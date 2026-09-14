import { ApiProperty } from '@midwayjs/swagger';

/** 首页总览（历年累计 + 五个时间区间）的响应模型 */

export class TotalStatVO {
  @ApiProperty({ description: '历年累计收入', example: '2155580.64' })
  income: string;

  @ApiProperty({ description: '历年累计支出', example: '1866713.65' })
  expense: string;

  @ApiProperty({ description: '总结余 = 收入 - 支出', example: '288866.99' })
  balance: string;

  @ApiProperty({ description: '累计记账笔数', example: 1280 })
  count: number;
}

export class RangeStatVO {
  @ApiProperty({
    description: '区间标识',
    example: 'month',
    enum: ['today', 'week', 'month', 'year', 'lastYear'],
  })
  key: string;

  @ApiProperty({ description: '区间名称', example: '本月' })
  label: string;

  @ApiProperty({ description: '展示用的期间文案', example: '09月01日 - 09月30日' })
  period: string;

  @ApiProperty({ description: '区间起始日期（闭区间）', example: '2026-09-01' })
  start: string;

  @ApiProperty({ description: '区间结束日期（闭区间）', example: '2026-09-30' })
  end: string;

  @ApiProperty({ description: '区间收入', example: '11756.33' })
  income: string;

  @ApiProperty({ description: '区间支出', example: '4852.01' })
  expense: string;

  @ApiProperty({ description: '区间结余', example: '6904.32' })
  balance: string;

  @ApiProperty({ description: '区间记账笔数', example: 24 })
  count: number;
}

export class OverviewDataVO {
  @ApiProperty({ type: TotalStatVO, description: '历年累计（当前账本）' })
  total: TotalStatVO;

  @ApiProperty({
    type: RangeStatVO,
    isArray: true,
    description: '今天 / 本周 / 本月 / 本年 / 去年',
  })
  ranges: RangeStatVO[];
}

export class OverviewResponseVO {
  @ApiProperty({ example: 0 })
  code: number;

  @ApiProperty({ type: OverviewDataVO })
  data: OverviewDataVO;

  @ApiProperty({ example: 'success' })
  message: string;
}

/* ================= 报表聚合（GET /statistics/report） ================= */

export class ReportSummaryVO {
  @ApiProperty({ description: '时段收入', example: '103482.23' })
  income: string;

  @ApiProperty({ description: '时段支出', example: '82473.53' })
  expense: string;

  @ApiProperty({ description: '时段结余 = 收入 - 支出', example: '21008.70' })
  balance: string;

  @ApiProperty({ description: '时段记账笔数', example: 662 })
  count: number;
}

export class ReportCategoryVO {
  @ApiProperty({
    description: '分类 ID（一级口径为一级分类、二级口径为二级分类），未分类为 null',
    example: '287',
    nullable: true,
  })
  categoryId: string | null;

  @ApiProperty({ description: '分类名', example: '金融保险' })
  name: string;

  @ApiProperty({ description: '图标标识', example: 'cat-finance' })
  icon: string;

  @ApiProperty({ description: '收支类型', example: 'expense', enum: ['income', 'expense'] })
  type: string;

  @ApiProperty({ description: '金额合计，字符串', example: '21875.00' })
  sum: string;

  @ApiProperty({ description: '占比，77.78 表示 77.78%', example: 26.52 })
  ratio: number;

  @ApiProperty({ description: '该分类下的记账笔数', example: 12 })
  count: number;

  @ApiProperty({
    description: '所属一级分类 ID。仅二级口径有值；一级口径与未分类为 null',
    example: '287',
    nullable: true,
  })
  parentId: string | null;

  @ApiProperty({
    description: '所属一级分类名。仅二级口径有值；一级口径与未分类为 null',
    example: '金融保险',
    nullable: true,
  })
  parentName: string | null;
}

export class ReportTrendItemVO {
  @ApiProperty({ description: '月份，YYYY-MM', example: '2026-09' })
  month: string;

  @ApiProperty({ description: '月份标签', example: '09月' })
  label: string;

  @ApiProperty({ description: '当月收入', example: '11756.33' })
  income: string;

  @ApiProperty({ description: '当月支出', example: '5256.16' })
  expense: string;
}

export class ReportDataVO {
  @ApiProperty({ description: '报表时段', example: '2026-09' })
  period: string;

  @ApiProperty({ description: '粒度', example: 'month', enum: ['year', 'month'] })
  granularity: string;

  @ApiProperty({ description: '起始日期（闭区间）', example: '2026-09-01' })
  start: string;

  @ApiProperty({ description: '结束日期（闭区间）', example: '2026-09-30' })
  end: string;

  @ApiProperty({ type: ReportSummaryVO, description: '时段汇总' })
  summary: ReportSummaryVO;

  @ApiProperty({
    type: ReportCategoryVO,
    isArray: true,
    description: '支出分类（**一级口径**，基础统计 Tab 的「支出分布」用）',
  })
  expenseCategories: ReportCategoryVO[];

  @ApiProperty({
    type: ReportCategoryVO,
    isArray: true,
    description: '收入分类（**一级口径**，基础统计 Tab 的「收入来源」用）',
  })
  incomeCategories: ReportCategoryVO[];

  @ApiProperty({
    type: ReportCategoryVO,
    isArray: true,
    description: '支出分类（**二级口径**，分类 Tab 的环形图与排行用；带 parentId / parentName）',
  })
  expenseCategoriesL2: ReportCategoryVO[];

  @ApiProperty({
    type: ReportCategoryVO,
    isArray: true,
    description: '收入分类（**二级口径**，分类 Tab 的环形图与排行用；带 parentId / parentName）',
  })
  incomeCategoriesL2: ReportCategoryVO[];

  @ApiProperty({
    type: ReportTrendItemVO,
    isArray: true,
    description: '年粒度为 12 个月；月粒度为空数组',
  })
  trend: ReportTrendItemVO[];
}

export class ReportResponseVO {
  @ApiProperty({ example: 0 })
  code: number;

  @ApiProperty({ type: ReportDataVO })
  data: ReportDataVO;

  @ApiProperty({ example: 'success' })
  message: string;
}
