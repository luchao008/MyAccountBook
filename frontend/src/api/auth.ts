import http from '@/utils/request';

export interface LoginResult {
  token: string;
  expiresIn: string;
  user: { id: string; username: string };
}

export function login(data: { username: string; password: string }): Promise<LoginResult> {
  return http.post('/auth/login', data) as any;
}

export function register(data: { username: string; password: string }): Promise<LoginResult> {
  return http.post('/auth/register', data) as any;
}
