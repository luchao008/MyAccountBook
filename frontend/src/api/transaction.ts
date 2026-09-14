import http from '@/utils/request';

export interface TransactionItem {
  id: string;
  userId: string;
  type: 'income' | 'expense';
  /** 金额是字符串，如 "38.50" */
  amount: string;
  categoryId: string | null;
  /** YYYY-MM-DD */
  recordDate: string;
  /** 记账时刻 HH:mm:ss；null = 未记录时间 */
  recordTime: string | null;
  note: string;
  /** ISO 8601 UTC 时间 */
  createdAt: string;
  category: {
    id: string;
    name: string;
    icon: string;
    type: 'income' | 'expense';
  } | null;
  account?: {
    id: string;
    name: string;
    icon: string;
    isDefault: boolean;
  } | null;
}

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  size: number;
}

export interface QueryParams {
  start?: string;
  end?: string;
  type?: 'income' | 'expense';
  /** 单选分类（旧参数，与 categoryIds 互斥，都传时以后者为准） */
  categoryId?: string;
  /** 多选分类，逗号分隔。传一级分类会连带命中其下二级 */
  categoryIds?: string;
  accountId?: string;
  /** 关键词，匹配备注或分类名 */
  keyword?: string;
  minAmount?: string;
  maxAmount?: string;
  order?: 'time' | 'amountDesc' | 'amountAsc';
  page?: number;
  size?: number;
}

/** 分组粒度 */
export type SummaryUnit = 'year' | 'quarter' | 'month' | 'week' | 'day';

export interface SummaryItem {
  /** 分组键，随 unit 变化：2026 / 2026-Q3 / 2026-09 / 2026-W37 / 2026-09-14 */
  key: string;
  unit: SummaryUnit;
  income: string;
  expense: string;
  balance: string;
  count: number;
}

/** 与列表共用筛选条件的汇总查询参数（不含分页） */
export interface SummaryParams {
  unit: SummaryUnit;
  start?: string;
  end?: string;
  type?: 'income' | 'expense';
  categoryIds?: string;
  accountId?: string;
  keyword?: string;
  minAmount?: string;
  maxAmount?: string;
}

export function getTransactions(params: QueryParams): Promise<PageResult<TransactionItem>> {
  return http.get('/transactions', { params }) as any;
}

/** 流水分组汇总（流水页主列表） */
export function getTransactionSummary(params: SummaryParams): Promise<SummaryItem[]> {
  return http.get('/transactions/summary', { params }) as any;
}

export function getTransaction(id: string): Promise<TransactionItem> {
  return http.get(`/transactions/${id}`) as any;
}

export function createTransaction(data: {
  type: 'income' | 'expense';
  amount: string;
  recordDate: string;
  categoryId?: string;
  note?: string;
  /** HH:mm；不传表示不记录时间 */
  recordTime?: string;
  accountId?: string;
}): Promise<TransactionItem> {
  return http.post('/transactions', data) as any;
}

export function updateTransaction(
  id: string,
  data: Partial<{
    type: 'income' | 'expense';
    amount: string;
    recordDate: string;
    categoryId: string;
    note: string;
    /** HH:mm；传空字符串清除时间 */
    recordTime: string;
    accountId: string;
  }>
): Promise<TransactionItem> {
  return http.put(`/transactions/${id}`, data) as any;
}

export function deleteTransaction(id: string): Promise<{ success: boolean }> {
  return http.delete(`/transactions/${id}`) as any;
}
