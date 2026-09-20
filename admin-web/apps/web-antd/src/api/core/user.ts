import type { UserInfo } from '@vben/types';

import { requestClient } from '#/api/request';

/**
 * 获取当前管理员信息（中台 /api/admin/auth/me）。
 *
 * 返回字段对齐 Vben 的 UserInfo：userId/username/realName/avatar/desc/roles/homePath。
 */
export async function getUserInfoApi() {
  return requestClient.get<UserInfo>('/admin/auth/me');
}
