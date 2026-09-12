import { Catch, MidwayHttpError } from '@midwayjs/core';
import { Context } from '@midwayjs/koa';
import { BusinessError } from '../common/business.error';
import { ErrorCode } from '../common/error-code';

/**
 * 全局兜底异常过滤器
 *
 * 响应结构统一为 { code, data, message }（文档第 8 节），
 * HTTP 状态码按 B 方案与业务码分离。
 *
 * 处理优先级（由 @Catch 匹配具体类型，此处为最后兜底）：
 *   1. BusinessError       业务异常，code 为业务错误码
 *   2. MidwayValidationError 参数校验失败（422）
 *   3. MidwayHttpError     框架 HTTP 异常
 *   4. 其他                 未知异常，500，不泄露堆栈
 */
@Catch()
export class DefaultErrorFilter {
  async catch(err: Error, ctx: Context) {
    // 1. 业务异常
    if (err instanceof BusinessError) {
      ctx.status = err.httpStatus;
      ctx.body = {
        code: Number(err.code),
        data: null,
        message: err.message,
      };
      return;
    }

    // 2 & 3. 框架 HTTP 异常（含参数校验 MidwayValidationError，默认 422）
    if (err instanceof MidwayHttpError) {
      ctx.status = err.status;
      ctx.body = {
        code: err.status === 422 ? ErrorCode.PARAM_INVALID : err.status * 100,
        data: null,
        message: err.message,
      };
      return;
    }

    // 4. 未知异常
    ctx.status = 500;
    ctx.body = {
      code: ErrorCode.INTERNAL,
      data: null,
      message: 'Internal Server Error',
    };

    // 保留堆栈到日志，便于排查
    ctx.logger.error(err);
  }
}
