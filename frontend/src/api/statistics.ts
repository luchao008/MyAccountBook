import http from '@/utils/request';

export interface MonthlyStat {
  month: string;
  income: string;
  expense: string;
  balance: string;
}

export interface CategoryStatItem {
  categoryId: string | null;
  name: string;
  icon: string;
  type: 'income' | 'expense';
  /** 金额合计，字符串 */
  sum: string;
  /** 百分比数字，77.78 表示 77.78% */
  ratio: number;
  /** 该分类下的记账笔数 */
  count: number;
}

export interface TotalStat {
  income: string;
  expense: string;
  balance: string;
  count: number;
}

export interface RangeStat {
  key: 'today' | 'week' | 'month' | 'year' | 'lastYear';
  label: string;
  period: string;
  start: string;
  end: string;
  income: string;
  expense: string;
  balance: string;
  count: number;
}

export interface Overview {
  total: TotalStat;
  ranges: RangeStat[];
}

/** 首页总览：历年累计 + 今天/本周/本月/本年/去年 */
export function getOverview(accountId?: string): Promise<Overview> {
  return http.get('/statistics/overview', { params: { accountId } }) as any;
}

export function getMonthlyStat(month: string, accountId?: string): Promise<MonthlyStat> {
  return http.get('/statistics/monthly', { params: { month, accountId } }) as any;
}

export function getCategoryStat(
  month: string,
  type?: 'income' | 'expense',
  accountId?: string
): Promise<CategoryStatItem[]> {
  return http.get('/statistics/category', { params: { month, type, accountId } }) as any;
}
