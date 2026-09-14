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

/* ================= 报表聚合（年 / 月） ================= */

export interface ReportSummary {
  income: string;
  expense: string;
  balance: string;
  count: number;
}

export interface ReportCategory {
  categoryId: string | null;
  name: string;
  icon: string;
  type: 'income' | 'expense';
  sum: string;
  ratio: number;
  count: number;
  /** 所属一级分类 ID（仅二级口径有值） */
  parentId: string | null;
  /** 所属一级分类名（仅二级口径有值，供分组展示） */
  parentName: string | null;
}

export interface ReportTrendItem {
  month: string;
  label: string;
  income: string;
  expense: string;
}

export interface ReportData {
  period: string;
  granularity: 'year' | 'month';
  start: string;
  end: string;
  summary: ReportSummary;
  /** 一级口径：基础统计 Tab 的「收入来源 / 支出分布」 */
  expenseCategories: ReportCategory[];
  incomeCategories: ReportCategory[];
  /** 二级口径：分类 Tab 的环形图与排行 */
  expenseCategoriesL2: ReportCategory[];
  incomeCategoriesL2: ReportCategory[];
  trend: ReportTrendItem[];
}

/**
 * 报表聚合：一次拿全该时段（年 / 月）的汇总、收支分类、12 个月趋势。
 * period 为 'YYYY'（年）或 'YYYY-MM'（年月）。
 */
export function getReport(period: string, accountId?: string): Promise<ReportData> {
  return http.get('/statistics/report', { params: { period, accountId } }) as any;
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
