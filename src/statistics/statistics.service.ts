import { Provide } from '@midwayjs/core';
import { InjectDataSource } from '@midwayjs/typeorm';
import { DataSource } from 'typeorm';
import { Transaction } from '../entity/transaction.entity';

/**
 * 统计口径（文档第 8.3 节）：
 *   balance = income - expense（不含期初余额）
 *   月份区间为 [月首日, 月末日]，按 record_date 闭区间过滤
 */
@Provide()
export class StatisticsService {
  @InjectDataSource()
  dataSource: DataSource;

  /**
   * 把 'YYYY-MM' 转成月份首尾日期
   */
  private resolveMonthRange(month: string): {
    monthStart: string;
    monthEnd: string;
  } {
    const [year, m] = month.split('-').map(Number);
    // 下个月的第 0 天 = 本月最后一天
    const lastDay = new Date(year, m, 0).getDate();
    return {
      monthStart: `${month}-01`,
      monthEnd: `${month}-${String(lastDay).padStart(2, '0')}`,
    };
  }

  /**
   * 把报表时段解析成首尾日期。
   *   - '2026'     → 整年 [2026-01-01, 2026-12-31]，granularity='year'
   *   - '2026-09'  → 该月 [2026-09-01, 2026-09-30]，granularity='month'
   */
  private resolvePeriodRange(period: string): {
    start: string;
    end: string;
    granularity: 'year' | 'month';
  } {
    if (period.length === 4) {
      return { start: `${period}-01-01`, end: `${period}-12-31`, granularity: 'year' };
    }
    const { monthStart, monthEnd } = this.resolveMonthRange(period);
    return { start: monthStart, end: monthEnd, granularity: 'month' };
  }

  /**
   * 报表聚合（GET /statistics/report）
   *
   * 一次返回该时段（年 / 月）的：汇总、支出分类、收入分类、12 个月趋势。
   * 年粒度下 trend 有 12 条（无数据的月份补 0）；月粒度下 trend 为空数组
   * （单月看"跨月走势"没有意义，前端也不渲染该模块）。
   *
   * 口径与 monthly / categoryBreakdown 完全一致：分类按一级聚合、结余 = 收入 - 支出。
   */
  async report(userId: string, period: string, accountId?: string) {
    const { start, end, granularity } = this.resolvePeriodRange(period);

    const summary = await this.summaryInRange(userId, start, end, accountId);
    const expense = await this.categoryInRange(userId, start, end, 'expense', accountId);
    const income = await this.categoryInRange(userId, start, end, 'income', accountId);
    const trend = granularity === 'year' ? await this.monthlyTrend(userId, period, accountId) : [];

    return {
      period,
      granularity,
      start,
      end,
      summary,
      // 一级口径：基础统计 Tab 的「收入来源 / 支出分布」（看大类结构）
      expenseCategories: expense.level1,
      incomeCategories: income.level1,
      // 二级口径：分类 Tab 的环形图与排行（看具体花在哪）
      expenseCategoriesL2: expense.level2,
      incomeCategoriesL2: income.level2,
      trend,
    };
  }

  /** 任意日期区间的收支汇总 */
  private async summaryInRange(userId: string, start: string, end: string, accountId?: string) {
    const qb = this.dataSource
      .getRepository(Transaction)
      .createQueryBuilder('t')
      .select("COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount ELSE 0 END), 0)", 'income')
      .addSelect(
        "COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0)",
        'expense',
      )
      .addSelect('COUNT(*)', 'count')
      .where('t.userId = :userId', { userId })
      .andWhere('t.recordDate BETWEEN :start AND :end', { start, end });

    if (accountId) {
      qb.andWhere('t.accountId = :accountId', { accountId });
    }

    const raw = await qb.getRawOne();
    const income = Number(raw.income).toFixed(2);
    const expense = Number(raw.expense).toFixed(2);
    return {
      income,
      expense,
      balance: (Number(income) - Number(expense)).toFixed(2),
      count: Number(raw.count ?? 0),
    };
  }

  /**
   * 任意日期区间的分类聚合，**一次查询同时产出两级口径**。
   *
   * 做法：SQL 按「叶子分类」分组（挂二级就是二级、直接挂一级就是它自己、
   * 未分类为 NULL），再在 JS 里把叶子按父级汇总出一级。
   *
   * 为什么不查两遍：两遍 SQL 会在大表上重复扫描，而且两次结果之间可能有写入
   * 导致口径对不上（一级之和 ≠ 二级之和）。一次查询、一次聚合天然自洽。
   *
   * 口径：
   *   - level1：交易挂二级 → 归到父；直接挂一级 → 归到自身；未分类 → 单独一组
   *   - level2：交易挂哪个叶子就算哪个（未分类单独一组）
   * 两级各自的 ratio 都以「该类型总金额」为分母，因此**各级之和都是 100%**。
   */
  private async categoryInRange(
    userId: string,
    start: string,
    end: string,
    type: 'income' | 'expense',
    accountId?: string,
  ) {
    const conditions = ['t.user_id = ?', 't.record_date BETWEEN ? AND ?', 't.type = ?'];
    const params: any[] = [userId, start, end, type];
    if (accountId) {
      conditions.push('t.account_id = ?');
      params.push(accountId);
    }

    const rows = await this.dataSource.query(
      `SELECT
         c.id   AS leafId,
         c.name AS leafName,
         c.icon AS leafIcon,
         p.id   AS parentId,
         p.name AS parentName,
         p.icon AS parentIcon,
         t.type AS type,
         SUM(t.amount) AS sum,
         COUNT(*) AS count
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       LEFT JOIN categories p ON p.id = c.parent_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY leafId, leafName, leafIcon, parentId, parentName, parentIcon, t.type
       ORDER BY sum DESC`,
      params,
    );

    const total = rows.reduce((acc: number, r: any) => acc + Number(r.sum), 0);
    const ratioOf = (v: any) => (total > 0 ? Number(((Number(v) / total) * 100).toFixed(2)) : 0);

    // ---- 二级：每行叶子就是一个条目 ----
    const level2 = rows.map((r: any) => ({
      categoryId: r.leafId ?? null,
      name: r.leafName ?? '未分类',
      icon: r.leafIcon ?? '',
      type: r.type,
      sum: Number(r.sum).toFixed(2),
      ratio: ratioOf(r.sum),
      count: Number(r.count),
      /** 所属一级分类 id（未分类与一级自身为 null） */
      parentId: r.parentId ?? null,
      /** 所属一级分类名，供前端做分组展示 */
      parentName: r.parentName ?? null,
    }));

    // ---- 一级：把叶子按 parentId ?? leafId 归并 ----
    const bucket = new Map<
      string,
      {
        categoryId: string | null;
        name: string;
        icon: string;
        type: string;
        sum: number;
        count: number;
      }
    >();
    for (const r of rows) {
      const key = String(r.parentId ?? r.leafId ?? '__none__');
      const name = r.parentName ?? r.leafName ?? '未分类';
      const icon = r.parentIcon ?? r.leafIcon ?? '';
      const cur = bucket.get(key);
      if (cur) {
        cur.sum += Number(r.sum);
        cur.count += Number(r.count);
      } else {
        bucket.set(key, {
          categoryId: r.parentId ?? r.leafId ?? null,
          name,
          icon,
          type: r.type,
          sum: Number(r.sum),
          count: Number(r.count),
        });
      }
    }

    const level1 = [...bucket.values()]
      .sort((a, b) => b.sum - a.sum)
      .map((b) => ({
        categoryId: b.categoryId,
        name: b.name,
        icon: b.icon,
        type: b.type,
        sum: b.sum.toFixed(2),
        ratio: ratioOf(b.sum),
        count: b.count,
        parentId: null,
        parentName: null,
      }));

    return { level1, level2 };
  }

  /** 某年 12 个月的收支（无数据的月份补 0） */
  private async monthlyTrend(userId: string, year: string, accountId?: string) {
    const conditions = ['t.user_id = ?', 't.record_date BETWEEN ? AND ?'];
    const params: any[] = [userId, `${year}-01-01`, `${year}-12-31`];
    if (accountId) {
      conditions.push('t.account_id = ?');
      params.push(accountId);
    }

    const rows = await this.dataSource.query(
      `SELECT
         MONTH(t.record_date) AS m,
         COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount ELSE 0 END), 0) AS income,
         COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS expense
       FROM transactions t
       WHERE ${conditions.join(' AND ')}
       GROUP BY m`,
      params,
    );

    const map = new Map<number, any>();
    for (const r of rows) map.set(Number(r.m), r);

    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const row = map.get(m);
      return {
        month: `${year}-${String(m).padStart(2, '0')}`,
        label: `${String(m).padStart(2, '0')}月`,
        income: Number(row?.income ?? 0).toFixed(2),
        expense: Number(row?.expense ?? 0).toFixed(2),
      };
    });
  }

  /**
   * 月度汇总：收入 / 支出 / 结余
   *
   * accountId 可选：不传时统计该用户全部账本（保持多账本改造前的行为）。
   */
  async monthly(userId: string, month: string, accountId?: string) {
    const { monthStart, monthEnd } = this.resolveMonthRange(month);

    const qb = this.dataSource
      .getRepository(Transaction)
      .createQueryBuilder('t')
      .select("COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount ELSE 0 END), 0)", 'income')
      .addSelect(
        "COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0)",
        'expense',
      )
      .where('t.userId = :userId', { userId })
      .andWhere('t.recordDate BETWEEN :monthStart AND :monthEnd', {
        monthStart,
        monthEnd,
      });

    if (accountId) {
      qb.andWhere('t.accountId = :accountId', { accountId });
    }

    const raw = await qb.getRawOne();

    // 保持字符串传输（文档第 6.3 节），不转 number
    const income = Number(raw.income).toFixed(2);
    const expense = Number(raw.expense).toFixed(2);
    const balance = (Number(income) - Number(expense)).toFixed(2);

    return { month, income, expense, balance };
  }

  /**
   * 分类占比统计（**按一级分类聚合**）
   *
   * 二级分类支持后的口径：
   *   - 交易挂在二级分类上 → 归到它的一级父分类
   *   - 交易直接挂在一级分类上 → 归到自身
   *   - 未分类（category_id IS NULL）→ 单独一组，name 记为"未分类"
   *
   * 用 COALESCE(p.id, c.id) 一步搞定：有父取父，无父取自身。
   *
   * accountId 可选：不传时统计全部账本。
   */
  async categoryBreakdown(
    userId: string,
    month: string,
    type?: 'income' | 'expense',
    accountId?: string,
  ) {
    const { monthStart, monthEnd } = this.resolveMonthRange(month);

    // 用 `?` 位置参数（TypeORM 的 raw query 不支持 :name 命名参数）
    const conditions = ['t.user_id = ?', 't.record_date BETWEEN ? AND ?'];
    const params: any[] = [userId, monthStart, monthEnd];
    if (type) {
      conditions.push('t.type = ?');
      params.push(type);
    }
    if (accountId) {
      conditions.push('t.account_id = ?');
      params.push(accountId);
    }

    const rows = await this.dataSource.query(
      `SELECT
         COALESCE(p.id, c.id) AS categoryId,
         COALESCE(p.name, c.name) AS name,
         COALESCE(p.icon, c.icon) AS icon,
         t.type AS type,
         SUM(t.amount) AS sum,
         COUNT(*) AS count
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       LEFT JOIN categories p ON p.id = c.parent_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY categoryId, name, icon, t.type
       ORDER BY sum DESC`,
      params,
    );

    // 计算占比：分母为当前筛选条件下的总金额
    const total = rows.reduce((acc: number, r: any) => acc + Number(r.sum), 0);

    return rows.map((r: any) => {
      const sum = Number(r.sum).toFixed(2);
      const ratio = total > 0 ? Number(((Number(r.sum) / total) * 100).toFixed(2)) : 0;
      return {
        categoryId: r.categoryId ?? null,
        name: r.name ?? '未分类',
        icon: r.icon ?? '',
        type: r.type,
        sum,
        ratio,
        // 该一级分类下的记账笔数（含其二级分类的笔数）
        count: Number(r.count),
      };
    });
  }

  /**
   * 账本总览：历年累计 + 今天/本周/本月/本年/去年 五个区间的收支。
   *
   * 为什么合成一个接口：首页首屏要展示 6 组数字，拆成 6 次请求会让首屏变慢，
   * 而且区间边界（尤其是"本周"从周几算起）应该由后端统一决定，避免各端算得不一致。
   *
   * 实现：一条 SQL 用条件聚合把 12 个指标一次算出来。
   * record_date 与区间均为闭区间比较。
   */
  async overview(userId: string, accountId?: string) {
    const now = new Date();
    const ranges = buildRanges(now);

    const selects: string[] = [
      "COALESCE(SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END), 0) AS totalIncome",
      "COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS totalExpense",
      'COUNT(*) AS totalCount',
    ];

    // 注意：这里必须用 `?` 位置参数，不能用 `:name` 命名参数。
    // 实测 TypeORM 的 dataSource.query() 在 mariadb 驱动下**不支持命名参数**，
    // 传对象时 `:name` 会原样进入 SQL 导致语法错误。
    // 参数顺序 = SQL 文本中 `?` 出现的顺序：
    //   先 SELECT 里各区间（每个区间三次 BETWEEN × 两个占位符），再 WHERE 的 userId / accountId。
    const values: any[] = [];

    for (const r of ranges) {
      selects.push(
        `COALESCE(SUM(CASE WHEN type = 'income' AND record_date BETWEEN ? AND ? THEN amount ELSE 0 END), 0) AS ${r.key}Income`,
        `COALESCE(SUM(CASE WHEN type = 'expense' AND record_date BETWEEN ? AND ? THEN amount ELSE 0 END), 0) AS ${r.key}Expense`,
        `COALESCE(SUM(CASE WHEN record_date BETWEEN ? AND ? THEN 1 ELSE 0 END), 0) AS ${r.key}Count`,
      );
      values.push(r.start, r.end, r.start, r.end, r.start, r.end);
    }

    const where = ['user_id = ?'];
    const whereValues: any[] = [userId];
    if (accountId) {
      where.push('account_id = ?');
      whereValues.push(accountId);
    }

    const rows = await this.dataSource.query(
      `SELECT ${selects.join(', ')} FROM transactions WHERE ${where.join(' AND ')}`,
      [...values, ...whereValues],
    );
    const raw = rows?.[0] ?? {};

    const fix = (v: any) => Number(v ?? 0).toFixed(2);

    const totalIncome = fix(raw.totalIncome);
    const totalExpense = fix(raw.totalExpense);

    return {
      total: {
        income: totalIncome,
        expense: totalExpense,
        balance: (Number(totalIncome) - Number(totalExpense)).toFixed(2),
        count: Number(raw.totalCount ?? 0),
      },
      ranges: ranges.map((r) => {
        const income = fix(raw[`${r.key}Income`]);
        const expense = fix(raw[`${r.key}Expense`]);
        return {
          key: r.key,
          label: r.label,
          period: r.period,
          start: r.start,
          end: r.end,
          income,
          expense,
          balance: (Number(income) - Number(expense)).toFixed(2),
          count: Number(raw[`${r.key}Count`] ?? 0),
        };
      }),
    };
  }
}

/** 格式化为 YYYY-MM-DD（本地时区） */
function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * 构造首页需要的 5 个时间区间。
 *
 * 口径说明：
 *   - 今天：当天 00:00 至 23:59（用日期闭区间表达）
 *   - 本周：**周一至周日**（国内习惯，不是周日开始）
 *   - 本月：1 号至当月最后一天
 *   - 本年 / 去年：自然年
 */
function buildRanges(now: Date) {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);

  // 周一作为一周起点：getDay() 周日为 0
  const dayOfWeek = now.getDay();
  const offsetToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offsetToMonday);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear(), 11, 31);

  const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
  const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31);

  return [
    {
      key: 'today',
      label: '今天',
      period: formatDate(todayStart),
      start: formatDate(todayStart),
      end: formatDate(todayEnd),
    },
    {
      key: 'week',
      label: '本周',
      period: `${formatDate(weekStart).slice(5)} - ${formatDate(weekEnd).slice(5)}`,
      start: formatDate(weekStart),
      end: formatDate(weekEnd),
    },
    {
      key: 'month',
      label: '本月',
      period: `${formatDate(monthStart).slice(5)} - ${formatDate(monthEnd).slice(5)}`,
      start: formatDate(monthStart),
      end: formatDate(monthEnd),
    },
    {
      key: 'year',
      label: '本年',
      period: `${now.getFullYear()}年`,
      start: formatDate(yearStart),
      end: formatDate(yearEnd),
    },
    {
      key: 'lastYear',
      label: '去年',
      period: `${now.getFullYear() - 1}年`,
      start: formatDate(lastYearStart),
      end: formatDate(lastYearEnd),
    },
  ];
}
