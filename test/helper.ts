import { DataSource } from 'typeorm';
import { User } from '../src/entity/user.entity';
import { Category } from '../src/entity/category.entity';
import { Transaction } from '../src/entity/transaction.entity';
import { Account } from '../src/entity/account.entity';

/**
 * 单测辅助工具。
 *
 * 设计取舍：service 层强依赖 TypeORM（实体关系、QueryBuilder、DB 约束），
 * 与其手写一堆 mock 不如直接连真实 MariaDB（Docker 容器），
 * 断言的是真实行为，包括唯一键、外键 CASCADE 这些 mock 根本测不到的东西。
 *
 * 隔离策略：
 *   - 每个用例用随机用户名创建独立用户
 *   - 用例结束后按 userId 清理（categories / transactions 对用户外键是 CASCADE，
 *     这里仍显式删除，避免依赖数据库行为）
 */

let ds: DataSource | null = null;

/** 测试用的独立数据源（只装实体，不加载迁移） */
export async function getTestDataSource(): Promise<DataSource> {
  if (ds && ds.isInitialized) {
    return ds;
  }
  ds = new DataSource({
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
    entities: [User, Category, Transaction, Account],
  });
  await ds.initialize();
  return ds;
}

export async function closeTestDataSource(): Promise<void> {
  if (ds && ds.isInitialized) {
    await ds.destroy();
  }
  ds = null;
}

/** 生成不重复的用户名，避免并发/重复执行时撞唯一键 */
export function randomUsername(prefix = 'ut'): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

/** 清理某用户及其全部数据（交易 → 分类 → 账本 → 用户） */
export async function cleanupUser(userId: string): Promise<void> {
  if (!userId) return;
  const dataSource = await getTestDataSource();
  await dataSource.getRepository(Transaction).delete({ userId });
  await dataSource.getRepository(Category).delete({ userId });
  await dataSource.getRepository(Account).delete({ userId });
  await dataSource.getRepository(User).delete({ id: userId });
}

/** 批量清理 */
export async function cleanupUsers(userIds: string[]): Promise<void> {
  for (const id of userIds) {
    await cleanupUser(id);
  }
}

/**
 * 断言函数抛出 BusinessError，且业务码等于预期。
 *
 * 注意：BusinessError 继承 MidwayError，构造时把业务码转成了字符串
 * （super(message, String(code))），所以这里必须 Number 后再比较。
 */
export async function expectBusinessError(
  fn: () => Promise<any>,
  expectedCode: number,
): Promise<void> {
  try {
    await fn();
  } catch (err: any) {
    expect(err.name).toBe('BusinessError');
    expect(Number(err.code)).toBe(expectedCode);
    return;
  }
  throw new Error(`期望抛出业务错误 ${expectedCode}，但函数正常返回了`);
}
