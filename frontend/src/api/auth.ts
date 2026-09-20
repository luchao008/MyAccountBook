import http from '@/utils/request';

export interface LoginResult {
  token: string;
  expiresIn: string;
  user: { id: string; username: string };
}

export function login(data: { username: string; password: string }): Promise<LoginResult> {
  return http.post('/auth/login', data) as any;
}

/** 注册返回：申请制，不含 token（中台审批，D18） */
export interface RegisterResult {
  status: 'pending';
  message: string;
  user: { id: string; username: string };
}

export function register(data: {
  username: string;
  password: string;
}): Promise<RegisterResult> {
  return http.post('/auth/register', data) as any;
}
