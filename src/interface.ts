/**
 * 全局共享类型
 */

/** 收支类型（与 DB ENUM 一致） */
export type TransactionTypeValue = 'income' | 'expense';

/** 分页查询结果 */
export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  size: number;
}

/** JWT 载荷（userId 为 BIGINT UNSIGNED，用 string 承载） */
export interface JwtPayload {
  userId: string;
  username: string;
}

// 扩展 Koa Context，挂载 JWT 解析出的用户信息
declare module '@midwayjs/koa' {
  interface Context {
    user?: JwtPayload;
  }
}
