import { Middleware, IMiddleware, Inject } from '@midwayjs/core';
import { Context, NextFunction } from '@midwayjs/koa';
import { JwtService } from '@midwayjs/jwt';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entity/user.entity';
import { BusinessError } from '../common/business.error';
import { ErrorCode } from '../common/error-code';
import { JwtPayload } from '../interface';

/**
 * JWT 守卫中间件（全局生效 + match 白名单）
 *
 * 设计（中台设计文档第 4 节，决策 D17/D18）：
 *   - 全局注册，默认所有 /api 路由都需要登录
 *   - match 放行：登录、注册，以及整个 /api/admin/（admin 路由全权交给 AdminGuard）
 *   - 校验通过后把 payload 挂到 ctx.user，供 controller 取 userId
 *   - scope 硬隔离：管理员 token（scope='admin'）在 App 路由直接拒绝，
 *     管理员凭证调不了任何用户接口（AdminGuard 反向拒绝 user token，双向隔离）
 *   - 状态查库：disabled 用户的 token 即使没过期也即时失效。
 *     若不查库，中台停用一个用户后其 token 仍存活最长 7 天
 *
 * 安全原则：默认保护、显式放行。
 */
@Middleware()
export class JwtGuardMiddleware implements IMiddleware<Context, NextFunction> {
  @Inject()
  jwtService: JwtService;

  @InjectEntityModel(User)
  userRepo: Repository<User>;

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

      // 3. 校验 token
      const token = parts[1];
      let payload: JwtPayload;
      try {
        payload = (await this.jwtService.verify(token)) as unknown as JwtPayload;
        // 校验失败的具体原因（过期/签名错误/格式错误）不区分，统一提示重新登录
      } catch {
        throw new BusinessError('登录已过期，请重新登录', ErrorCode.UNAUTHORIZED);
      }

      // 4. scope 硬隔离：管理员凭证不能调 App 用户接口
      if (payload.scope === 'admin') {
        throw new BusinessError('无权访问用户接口', ErrorCode.UNAUTHORIZED);
      }

      // 5. 状态查库：停用即时生效。
      //    pending 用户的 App token 正常流程不存在（注册不再签发 token），
      //    但这里按"非 active 一律拒"收口，防住任何历史遗留 token。
      const user = await this.userRepo.findOne({
        where: { id: payload.userId },
        select: ['id', 'username', 'status'],
      });
      if (!user || user.status !== 'active') {
        throw new BusinessError('登录已过期，请重新登录', ErrorCode.USER_DISABLED);
      }

      ctx.user = { userId: user.id, username: user.username };
      return next();
    };
  }

  /**
   * 白名单：这些路径不校验 token。
   *
   * 三条规则：
   *   1. 非 /api 路径一律放行 —— Swagger 文档（/swagger-ui、/swagger-ui.json）
   *      等框架自带路由不做鉴权，否则打开文档就会 401。
   *   2. /api 下仅登录、注册放行，其余默认保护。
   *   3. /api/admin/ 整体放行 —— admin 路由由 AdminGuard 全权校验，
   *      这里放行不是降低保护：user token 没有 adminId，AdminGuard 侧会被拒。
   *
   * 注意：ctx.path 已带 /api 前缀。
   */
  match(ctx: Context): boolean {
    if (!ctx.path.startsWith('/api')) {
      return false;
    }
    if (ctx.path.startsWith('/api/admin/')) {
      return false;
    }
    const publicPaths = ['/api/auth/login', '/api/auth/register'];
    return !publicPaths.includes(ctx.path);
  }

  static getName(): string {
    return 'jwtGuard';
  }
}
