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

/**
 * JWT 载荷（userId 为 BIGINT UNSIGNED，用 string 承载）。
 *
 * scope：账号体系隔离（中台设计决策 D17）。
 *   - 'admin'：中台管理员（payload 为 adminId/adminUsername）
 *   - 无 / 其他：App 用户。存量老 token 没有 scope 字段，按 user 处理。
 *   payload 由 JWT 签名保护，不可伪造，守卫侧做硬校验即可。
 */
export interface JwtPayload {
  userId: string;
  username: string;
  /** App 用户 token 无此字段；管理员 token 为 'admin' */
  scope?: 'admin';
}

/** 管理员 JWT 载荷（中台登录接口签发） */
export interface AdminJwtPayload {
  adminId: string;
  username: string;
  scope: 'admin';
}

// 扩展 Koa Context：
//   ctx.user  App 用户信息（JwtGuard 填充）
//   ctx.admin 管理员信息（AdminGuard 填充）
declare module '@midwayjs/koa' {
  interface Context {
    user?: JwtPayload;
    admin?: AdminJwtPayload;
  }
}
