import { Middleware, IMiddleware, Inject } from '@midwayjs/core';
import { Context, NextFunction } from '@midwayjs/koa';
import { JwtService } from '@midwayjs/jwt';
import { BusinessError } from '../common/business.error';
import { ErrorCode } from '../common/error-code';
import { JwtPayload } from '../interface';

/**
 * JWT 守卫中间件（全局生效 + match 白名单）
 *
 * 设计（文档第 6 节 + 选型 A）：
 *   - 全局注册，默认所有 /api 路由都需要登录
 *   - match 仅放行白名单（登录、注册），其余全部校验
 *   - 校验通过后把 payload 挂到 ctx.user，供 controller 取 userId
 *
 * 安全原则：默认保护、显式放行。
 */
@Middleware()
export class JwtGuardMiddleware implements IMiddleware<Context, NextFunction> {
  @Inject()
  jwtService: JwtService;

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
      try {
        const payload = (await this.jwtService.verify(token)) as unknown as JwtPayload;
        ctx.user = { userId: payload.userId, username: payload.username };
        // 校验失败的具体原因（过期/签名错误/格式错误）不区分，统一提示重新登录
      } catch {
        throw new BusinessError('登录已过期，请重新登录', ErrorCode.UNAUTHORIZED);
      }

      return next();
    };
  }

  /**
   * 白名单：这些路径不校验 token。
   *
   * 两条规则：
   *   1. 非 /api 路径一律放行 —— Swagger 文档（/swagger-ui、/swagger-ui.json）
   *      等框架自带路由不做鉴权，否则打开文档就会 401。
   *   2. /api 下仅登录、注册放行，其余默认保护。
   *
   * 注意：ctx.path 已带 /api 前缀。
   */
  match(ctx: Context): boolean {
    if (!ctx.path.startsWith('/api')) {
      return false;
    }
    const publicPaths = ['/api/auth/login', '/api/auth/register'];
    return !publicPaths.includes(ctx.path);
  }

  static getName(): string {
    return 'jwtGuard';
  }
}
