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
  categoryId?: string;
  page?: number;
  size?: number;
}

export function getTransactions(params: QueryParams): Promise<PageResult<TransactionItem>> {
  return http.get('/transactions', { params }) as any;
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
