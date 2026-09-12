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
