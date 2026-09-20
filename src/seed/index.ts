import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { User } from '../entity/user.entity';
import { Category } from '../entity/category.entity';
import { Account } from '../entity/account.entity';
import { rebuildAccountCategories } from '../category/category-rebuild';
import { Transaction } from '../entity/transaction.entity';

/**
 * 种子数据脚本
 *
 *   npm run seed           仅初始化/重建 demo 账号
 *   npm run seed:all       为**所有**用户初始化分类体系与默认账本
 *
 * 幂等：重复执行不会产生重复数据
 *   - 用户按 username 判断
 *   - 账本按 (userId, name) 判断
 *   - 分类按 (accountId, name) upsert（存在则更新属性，不重复插入）；账本级隔离后挂到默认账本
 *
 * 分类体系：支出两级（13 个一级 + 55 个二级），收入两级（2 个一级 + 19 个二级）。
 * 不在新体系名单里的旧分类会被清理，其下交易按收支类型改挂到回退分类。
 */

const SEED_USER = {
  username: 'demo',
  password: '123456',
};

/**
 * 默认账本名。与 AccountService 中的 DEFAULT_ACCOUNT_NAME 保持一致。
 * 这里不 import 那个常量，是为了避免 seed 脚本连带加载 Midway 的 IoC 相关模块。
 */
const DEFAULT_ACCOUNT_NAME = '默认账本';

/**
 * seed 专用数据源。
 *
 * 与 src/data-source.ts（TypeORM CLI 专用）的区别：
 *   - 不配置 migrations —— seed 只需要实体，加载迁移会触发
 *     TypeORM 的 IoC 容器去解析 migration 类，而这些类并未注册进
 *     Midway 容器，必然报 DefinitionNotFoundError。
 *   - 与 config.default.ts 的运行时配置保持字段一致。
 */
function createDataSource() {
  return new DataSource({
    type: 'mariadb',
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root123456',
    database: process.env.DB_NAME || 'account_book',
    charset: 'utf8mb4',
    timezone: '+08:00',
    synchronize: false,
    logging: false,
    entities: [User, Category, Account, Transaction],
  });
}

/**
 * 确保用户有默认账本，返回它（分类要挂到这个账本上）。
 * 同时返回是否新建，供统计。
 */
async function ensureDefaultAccount(
  dataSource: DataSource,
  userId: string,
): Promise<{ account: Account; created: boolean }> {
  const accountRepo = dataSource.getRepository(Account);
  const existing = await accountRepo.findOne({
    where: { userId, name: DEFAULT_ACCOUNT_NAME },
  });
  if (existing) return { account: existing, created: false };

  const saved = await accountRepo.save(
    accountRepo.create({
      userId,
      name: DEFAULT_ACCOUNT_NAME,
      icon: 'wallet',
      sort: 0,
      isDefault: true,
    }),
  );
  return { account: saved, created: true };
}

async function seed() {
  const dataSource = createDataSource();
  await dataSource.initialize();
  console.log('[seed] 数据源已连接');

  // --all：为库里所有用户初始化（用于已有数据的环境）
  const forAllUsers = process.argv.includes('--all');

  try {
    const userRepo = dataSource.getRepository(User);
    let user = await userRepo.findOne({ where: { username: SEED_USER.username } });

    if (user) {
      console.log(`[seed] 用户已存在，跳过：${SEED_USER.username}`);
    } else {
      const passwordHash = await bcrypt.hash(SEED_USER.password, 10);
      user = await userRepo.save(
        userRepo.create({ username: SEED_USER.username, passwordHash, status: 'active' as const }),
      );
      console.log(`[seed] 已创建用户：${SEED_USER.username} / ${SEED_USER.password}`);
    }

    const targets = forAllUsers ? await userRepo.find() : [user];
    if (forAllUsers) {
      console.log(`[seed] --all：将为 ${targets.length} 个用户初始化账本与分类`);
    }

    let accountsCreated = 0;
    let totalCats = 0;
    let totalLegacy = 0;
    let totalReassigned = 0;

    for (const target of targets) {
      const { account, created } = await ensureDefaultAccount(dataSource, target.id);
      if (created) accountsCreated++;

      const result = await rebuildAccountCategories(dataSource, target.id, account.id);
      totalCats += result.total;
      totalLegacy += result.legacyRemoved;
      totalReassigned += result.reassigned;

      if (!forAllUsers) {
        console.log(
          `[seed] 分类：一级 ${result.roots} 个 + 二级 ${result.children} 个；` +
            `清理旧分类 ${result.legacyRemoved} 个，改挂交易 ${result.reassigned} 笔`,
        );
      }
    }

    if (forAllUsers) {
      console.log(
        `[seed] 完成：新建账本 ${accountsCreated} 个；` +
          `分类共写入 ${totalCats} 条（${targets.length} 用户 × ${totalCats / Math.max(targets.length, 1)} 个）；` +
          `清理旧分类 ${totalLegacy} 个，改挂交易 ${totalReassigned} 笔`,
      );
    }

    console.log('[seed] 完成');
  } finally {
    await dataSource.destroy();
  }
}

// 仅在直接运行本文件时执行（npm run seed）。
// 必须加这层守卫：Midway 的文件扫描器会加载 src 下所有 .ts，
// 若无条件自执行，服务启动时就会跑一遍 seed，
// 且失败时的 process.exit(1) 会直接把服务进程带走。
if (require.main === module) {
  seed().catch((err) => {
    console.error('[seed] 失败：', err);
    process.exit(1);
  });
}
