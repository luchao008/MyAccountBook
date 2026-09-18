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
  /**
   * 软删除时间戳（ISO 8601 UTC）。**只有「流水回收站」接口会返回它** ——
   * 常规接口只返回未删除的流水，该字段为 undefined。
   */
  deletedAt?: string | null;
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
  /** 分组键：时间维度是 2026 / 2026-Q3 / 2026-09 / …；分类维度是分类 id（未分类为 '__none__'） */
  key: string;
  /** 'category' 表示按分类分组（此时 unit 不是时间粒度） */
  unit: SummaryUnit | 'category';
  /** 分类维度才有：分类名 */
  name?: string;
  /** 分类维度才有：图标 */
  icon?: string;
  /** 分类维度才有（二级口径）：所属一级分类名 */
  parentName?: string | null;
  income: string;
  expense: string;
  balance: string;
  count: number;
}

/** 与列表共用筛选条件的汇总查询参数（不含分页） */
export interface SummaryParams {
  /** 分组维度，默认 time */
  groupBy?: 'time' | 'category';
  /** 分类层级，仅 groupBy=category 有意义 */
  level?: 1 | 2;
  unit?: SummaryUnit;
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

/** 从回收站恢复 */
export function restoreTransaction(id: string): Promise<TransactionItem> {
  return http.post(`/transactions/${id}/restore`) as any;
}

/** 流水回收站列表（7 天内删除的） */
export function getDeletedTransactions(): Promise<TransactionItem[]> {
  return http.get('/transactions/deleted') as any;
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

/* ============================================================
 * 流水导入（随手记 xlsx）
 *
 * 文件用 JSON + base64 承载（后端未引入文件上传中间件）；
 * 流程固定两步：preview（不写库）→ commit（写库）。
 * ============================================================ */

/** 单行的处理结论 */
export type ImportRowStatus = 'ok' | 'duplicate' | 'unmatched' | 'invalid';

export interface ImportRowReport {
  rowNo: number;
  sheet: string;
  type: 'income' | 'expense' | null;
  amount: string | null;
  recordDate: string | null;
  /** HH:mm（秒已丢弃） */
  recordTime: string | null;
  note: string;
  /** 附件里的分类原文，形如「食品酒水 / 早午晚餐」 */
  categoryRaw: string;
  categoryId: string | null;
  categoryName: string | null;
  status: ImportRowStatus;
  /** 按当前开关，这一行最终是否会被写入 */
  willImport: boolean;
  messages: string[];
}

export interface ImportSummary {
  total: number;
  valid: number;
  importable: number;
  skipped: number;
  duplicate: number;
  unmatched: number;
  invalid: number;
}

export interface ImportPreviewResult {
  filename: string;
  accountId: string;
  accountName: string;
  summary: ImportSummary;
  sheets: { name: string; total: number; valid: number; invalid: number }[];
  /** 读不了的工作表及原因（不影响其他工作表） */
  sheetErrors: string[];
  /**
   * **只含需要关注的行**（分类降级 / 疑似重复 / 无法导入）。
   * 正常行不回传 —— 真实账单里它们占 99%，带上只会淹掉异常、还白撑响应体。
   */
  rows: ImportRowReport[];
  /** 需要关注的行总数（rows 可能被截断，计数以此为准） */
  abnormal: number;
  rowsTruncated: boolean;
}

export interface ImportCommitResult {
  accountId: string;
  accountName: string;
  imported: number;
  skipped: number;
  failed: number;
  /** 分类降级（挂一级 / 记为未分类）的条数 —— **这些是导入成功的**，只是分类不精确 */
  unmatched: number;
  failures: { rowNo: number; message: string }[];
}

/** 导入入参：预览与提交**同一个形状**（同文件 / 同账本 / 同开关） */
export interface ImportFileParams {
  filename: string;
  contentBase64: string;
  accountId?: string;
  skipDuplicates?: boolean;
}

/** 解析并给出报告。**不写库**。 */
export function previewImport(data: ImportFileParams): Promise<ImportPreviewResult> {
  return http.post('/transactions/import/preview', data) as any;
}

/**
 * 落库。**重新传文件**，由服务端重新解析。
 *
 * ⚠️ 刻意不传「预览那批行」（2026-09-17 方案 B）：预览为控制响应体只回传异常行，
 * 正常行前端根本拿不到；而早先「预览回传全部行 → 提交照单落库」的写法，
 * 会因预览截断导致**一次只能导入 2000 条**。现在两端都传文件，
 * 行数上限只剩「文件 2MB」（约 3 万行），且预览与提交口径不可能分叉。
 */
export function commitImport(data: ImportFileParams): Promise<ImportCommitResult> {
  return http.post('/transactions/import/commit', data) as any;
}
