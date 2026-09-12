import { Middleware, IMiddleware } from '@midwayjs/core';
import { Context, NextFunction } from '@midwayjs/koa';
import { ErrorCode } from '../common/error-code';

/**
 * 统一响应中间件
 * 把 controller 返回值包装成 { code, data, message }（文档第 8 节）。
 * 已由异常过滤器设置过 body 的请求不再包装。
 */
@Middleware()
export class ResponseMiddleware implements IMiddleware<Context, NextFunction> {
  resolve() {
    return async (ctx: Context, next: NextFunction) => {
      const result = await next();

      // 非 /api 路由不处理
      if (!ctx.path.startsWith('/api')) {
        return;
      }

      // 异常过滤器已写过 body（含 __wrapped 标记），跳过
      if ((ctx.body as any)?.__wrapped) {
        return;
      }

      // 无返回值（如 204）不包装
      if (result === undefined) {
        return;
      }

      ctx.body = {
        code: ErrorCode.SUCCESS,
        data: result,
        message: 'success',
      };
    };
  }

  match(ctx: Context): boolean {
    return ctx.path.startsWith('/api');
  }
}
