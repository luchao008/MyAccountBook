import { ErrorCode } from './error-code';

/**
 * 统一响应结构（规划文档第 8 节）
 * { code, data, message }
 */
export interface ApiResponse<T = any> {
  code: number;
  data: T;
  message: string;
}

export function success<T>(data: T, message = 'success'): ApiResponse<T> {
  return { code: ErrorCode.SUCCESS, data, message };
}

export function fail(code: number, message: string): ApiResponse<null> {
  return { code, data: null, message };
}
