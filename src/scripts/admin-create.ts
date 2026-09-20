import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import * as readline from 'readline';
import { DataSource } from 'typeorm';
import { Admin } from '../entity/admin.entity';

/**
 * 中台管理员创建脚本（幂等）：
 *
 *   npm run admin:create -- <username> [password]
 *
 *   - 密码缺省时交互式输入（不回显，避免留在 shell 历史）
 *   - 用户名已存在：若是 disabled 则重新启用并改密码；否则报错退出
 *   - 创建成功后输出提示：用该账号登录 /api/admin/auth/login
 *
 * 独立脚本而非中台接口的原因（设计决策 D17）：
 * v1 管理员数量极少（预计 1-2 人），走接口反而引入"谁能创建管理员"
 * 的引导权限问题（鸡生蛋）；v2 若管理员多了再考虑接口化 + 角色分级。
 *
 * 复用 seed 的数据源构造思路：不挂 Midway IoC，直接裸 DataSource。
 */
const SALT_ROUNDS = 10;

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
    entities: [Admin],
  });
}

/** 交互式读密码（不回显）。stdin 不是 TTY 时回退普通读取（如 CI 注入）。 */
function readPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const username = process.argv[2];
  if (!username || !/^[a-zA-Z0-9_-]{2,64}$/.test(username)) {
    console.error('用法：npm run admin:create -- <username> [password]');
    console.error('用户名规则：2-64 位字母/数字/下划线/连字符');
    process.exit(1);
  }

  let password = process.argv[3];
  if (!password) {
    password = await readPassword('请输入管理员密码（6-64 位）：');
  }
  if (!password || password.length < 6 || password.length > 64) {
    console.error('密码长度需 6-64 位');
    process.exit(1);
  }

  const dataSource = createDataSource();
  await dataSource.initialize();
  try {
    const repo = dataSource.getRepository(Admin);
    const existing = await repo.findOne({ where: { username } });
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    if (existing) {
      // 幂等语义：disabled 的重启用 + 重置密码；active 的只重置密码
      await repo.update(existing.id, { passwordHash, status: 'active' });
      console.log(
        `[admin:create] 管理员已存在（id=${existing.id}），密码已重置` +
          (existing.status === 'disabled' ? '，账号已重新启用' : ''),
      );
    } else {
      const saved = await repo.save(repo.create({ username, passwordHash, nickname: null }));
      console.log(`[admin:create] 已创建管理员：${username}（id=${saved.id}）`);
    }
    console.log('[admin:create] 登录入口：POST /api/admin/auth/login');
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[admin:create] 失败：', err);
    process.exit(1);
  });
}
