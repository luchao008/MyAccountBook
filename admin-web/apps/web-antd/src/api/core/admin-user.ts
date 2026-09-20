import { requestClient } from '#/api/request';

/** 用户状态（与后端 users.status 一致） */
export type UserStatus = 'active' | 'disabled' | 'pending';

/** 列表筛选状态（'' = 全部） */
export type UserStatusFilter = '' | UserStatus;

/** 管理端用户条目（对应后端 UserAdminItem） */
export interface UserAdminItem {
  id: string;
  username: string;
  status: UserStatus;
  createdAt: string;
  accountCount: number;
  transactionCount: number;
}

export interface UserListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: UserStatusFilter;
}

export interface UserListResult {
  items: UserAdminItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** 用户列表（分页 + 用户名模糊搜索 + 状态筛选） */
export async function getUserListApi(params: UserListParams) {
  return requestClient.get<UserListResult>('/admin/users', { params });
}

/** 用户详情（含账本数/流水数） */
export async function getUserDetailApi(id: string) {
  return requestClient.get<UserAdminItem>(`/admin/users/${id}`);
}

/** 通过注册申请（pending -> active） */
export async function approveUserApi(id: string) {
  return requestClient.post<UserAdminItem>(`/admin/users/${id}/approve`);
}

/** 驳回注册申请（pending -> 物理删除） */
export async function rejectUserApi(id: string) {
  return requestClient.post<{ success: boolean }>(`/admin/users/${id}/reject`);
}

/** 停用用户（active -> disabled） */
export async function disableUserApi(id: string) {
  return requestClient.post<UserAdminItem>(`/admin/users/${id}/disable`);
}

/** 启用用户（disabled -> active） */
export async function enableUserApi(id: string) {
  return requestClient.post<UserAdminItem>(`/admin/users/${id}/enable`);
}

/** 删除用户（物理级联删除） */
export async function deleteUserApi(id: string) {
  return requestClient.delete<{ success: boolean }>(`/admin/users/${id}`);
}
