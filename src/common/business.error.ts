import { MidwayError } from '@midwayjs/core';
import { ErrorCode } from './error-code';

/**
 * 业务错误码 -> HTTP 状态码映射
 *
 * 约定：业务码的高三位即 HTTP 状态码。
 *   40000 -> 400   40100 -> 401   40401 -> 404   40901 -> 409   50000 -> 500
 * 因此直接取 Math.floor(code / 100) 即可。
 * 兜底 500，避免出现非法 HTTP 状态码。
 */
function codeToHttpStatus(code: number): number {
  const status = Math.floor(code / 100);
  return status >= 400 && status <= 599 ? status : 500;
}

/**
 * 业务异常
 * 复用 MidwayError 的 code 字段承载业务错误码，
 * httpStatus 由错误码自动推导。
 */
export class BusinessError extends MidwayError {
  readonly httpStatus: number;

  constructor(message: string, code: ErrorCode = ErrorCode.PARAM_INVALID) {
    super(message, String(code));
    this.name = 'BusinessError';
    this.httpStatus = codeToHttpStatus(code);
  }
}
