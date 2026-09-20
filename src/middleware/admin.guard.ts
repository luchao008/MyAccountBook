import { Middleware, IMiddleware, Inject } from '@midwayjs/core';
import { Context, NextFunction } from '@midwayjs/koa';
import { JwtService } from '@midwayjs/jwt';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository } from 'typeorm';
import { Admin } from '../entity/admin.entity';
import { BusinessError } from '../common/business.error';
import { ErrorCode } from '../common/error-code';
import { AdminJwtPayload } from '../interface';

/**
 * 中台管理守卫（中台设计文档第 4 节，决策 D17）。
 *
 * 职责：/api/admin/* 路由组的唯一鉴权层（JwtGuard 已将该前缀整体放行，见其 match）。
 *
 * 校验链（全部通过才放行）：
 *   1. Bearer token 存在且验签通过（与 App 共用同一 JWT secret）
 *   2. payload.scope === 'admin'（App 用户 token 无 scope，直接拒绝 —— 双向硬隔离）
 *   3. adminId 在 admins 表中存在
 *   4. admin.status === 'active'（管理员停用即时生效，不受 7 天 token 存活期影响）
 *
 * 通过后挂 ctx.admin = { adminId, username }，中台 controller 从 ctx.admin 取操作者。
 *
 * 白名单：/api/admin/auth/login（管理员登录本身不要求 token）。
 *
 * 安全原则：默认保护、显式放行 —— /api/admin/ 下新增路由默认全部受保护，
 * 新增接口忘配守卫不会漏放（漏保护比漏放行危险得多）。
 */
@Middleware()
export class AdminGuardMiddleware implements IMiddleware<Context, NextFunction> {
  @Inject()
  jwtService: JwtService;

  @InjectEntityModel(Admin)
  adminRepo: Repository<Admin>;

  resolve() {
    return async (ctx: Context, next: NextFunction) => {
      // 1. 取 Authorization 头
      const authHeader = ctx.headers['authorization'];
      if (!authHeader) {
        throw new BusinessError('未登录或登录已过期', ErrorCode.UNAUTHORIZED);
      }

      // 2. 校验 Bearer 格式
      const parts = String(authHeader).trim().split(' ');
      if (parts.length !== 2 || !/^Bearer$/i.test(parts[0])) {
        throw new BusinessError('认证格式错误', ErrorCode.UNAUTHORIZED);
      }

      // 3. 验签 + scope 校验（失败原因不区分，统一提示重新登录）
      const token = parts[1];
      let payload: AdminJwtPayload;
      try {
        payload = (await this.jwtService.verify(token)) as unknown as AdminJwtPayload;
      } catch {
        throw new BusinessError('登录已过期，请重新登录', ErrorCode.UNAUTHORIZED);
      }

      if (payload.scope !== 'admin' || !payload.adminId) {
        throw new BusinessError('无权访问管理接口', ErrorCode.UNAUTHORIZED);
      }

      // 4. 状态查库：管理员停用即时生效
      const admin = await this.adminRepo.findOne({
        where: { id: payload.adminId },
        select: ['id', 'username', 'status'],
      });
      if (!admin || admin.status !== 'active') {
        throw new BusinessError('管理员账号已被停用', ErrorCode.ADMIN_DISABLED);
      }

      ctx.admin = { adminId: admin.id, username: admin.username, scope: 'admin' };
      return next();
    };
  }

  /**
   * 白名单：仅管理员登录不需要 token。
   * match 返回 false 时中间件不执行，直接放行。
   */
  match(ctx: Context): boolean {
    if (!ctx.path.startsWith('/api/admin/')) {
      return false;
    }
    return ctx.path !== '/api/admin/auth/login';
  }

  static getName(): string {
    return 'adminGuard';
  }
}
