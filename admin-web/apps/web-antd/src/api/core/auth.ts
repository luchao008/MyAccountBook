import { requestClient } from '#/api/request';

export namespace AuthApi {
  /** 登录接口参数 */
  export interface LoginParams {
    password?: string;
    username?: string;
  }

  /** 后端 /api/admin/auth/login 原始返回值 */
  export interface LoginResult {
    token: string;
    expiresIn: string;
    admin: {
      id: string;
      username: string;
      nickname: null | string;
    };
  }
}

/**
 * 管理员登录。
 *
 * 后端返回 { token, expiresIn, admin }，这里适配成 Vben 期望的
 * { accessToken }，auth store 无需感知后端字段名。
 */
export async function loginApi(data: AuthApi.LoginParams) {
  const res = await requestClient.post<AuthApi.LoginResult>(
    '/admin/auth/login',
    data,
  );
  return { accessToken: res.token };
}
