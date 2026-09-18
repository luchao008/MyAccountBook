import http from '@/utils/request';

export interface AccountItem {
  id: string;
  userId: string;
  name: string;
  icon: string;
  sort: number;
  isDefault: boolean;
  createdAt: string;
}

export interface MergePreview {
  sourceTotal: number;
  willMove: number;
  willSkip: number;
}

export interface MergeResult extends MergePreview {
  targetId: string;
  sourceId: string;
  sourceName: string;
}

export function getAccounts(): Promise<AccountItem[]> {
  return http.get('/accounts') as any;
}

export function createAccount(data: {
  name: string;
  icon?: string;
  sort?: number;
  /** 是否复制母本全部分类（默认 true）。false 时按 categoryIds 复制 */
  copyAll?: boolean;
  /** 要从母本复制过来的分类 id；**仅 copyAll=false 时生效**（空数组 = 一个都不要） */
  categoryIds?: string[];
}): Promise<AccountItem> {
  return http.post('/accounts', data) as any;
}

/** 分类候选：默认账本（母本）的全部分类 */
export function getCategoryCandidates(): Promise<
  Array<{
    id: string;
    name: string;
    type: 'income' | 'expense';
    icon: string;
    sort: number;
    parentId: string | null;
    isHidden: boolean;
  }>
> {
  return http.get('/accounts/category-candidates') as any;
}

/** 从母本批量导入分类到指定账本 */
export function importCategories(
  accountId: string,
  categoryIds: string[]
): Promise<{ imported: number }> {
  return http.post(`/accounts/${accountId}/categories`, { categoryIds }) as any;
}

export function updateAccount(
  id: string,
  data: Partial<{ name: string; icon: string; sort: number; isDefault: boolean }>
): Promise<AccountItem> {
  return http.put(`/accounts/${id}`, data) as any;
}

/** 删除前预检：返回会连带删除多少笔交易 */
export function getDeletePreview(id: string): Promise<{ transactionCount: number }> {
  return http.get(`/accounts/${id}/delete-preview`) as any;
}

/**
 * 删除账本。必须传 confirmName 且与账本名完全一致，否则后端拒绝（40001）。
 *
 * ⚠️ **查询串必须拼进 URL，不能走 `http.delete(url, { params })`**（2026-09-17 修复）。
 *
 * luch-request 的签名是 `delete(url, data, options)` —— 第二个参数是**请求体**，
 * 不是 axios 那种 config。于是 `{ params: {...} }` 被当成 body 发出去（还是 JSON），
 * URL 上根本没有查询串，后端 `DeleteAccountQueryDTO.confirmName` 直接报
 * 「"confirmName" 是必须的」（422 / 40000）。
 * 用户视角就是「名字明明输对了，却提示没拿到名称」。
 *
 * 与 `category.ts` / `transaction.ts` 保持一致：查询串直接拼进 URL。
 */
export function deleteAccount(
  id: string,
  confirmName: string
): Promise<{ success: boolean; deletedTransactions: number }> {
  return http.delete(`/accounts/${id}?confirmName=${encodeURIComponent(confirmName)}`) as any;
}

/** 合并预检：算出会迁多少笔、去重多少笔 */
export function previewMerge(targetId: string, sourceId: string): Promise<MergePreview> {
  return http.post('/accounts/merge-preview', { targetId, sourceId }) as any;
}

/** 执行合并：把 sourceId 并入 targetId，源账本会被删除 */
export function mergeAccounts(targetId: string, sourceId: string): Promise<MergeResult> {
  return http.post('/accounts/merge', { targetId, sourceId }) as any;
}
