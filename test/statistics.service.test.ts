import { createApp, close } from '@midwayjs/mock';
import { IMidwayApplication } from '@midwayjs/core';
import { StatisticsService } from '../src/statistics/statistics.service';
import { TransactionService } from '../src/transaction/transaction.service';
import { CategoryService } from '../src/category/category.service';
import { AuthService } from '../src/auth/auth.service';
import { AccountService } from '../src/account/account.service';
import { cleanupUsers, closeTestDataSource, randomUsername } from './helper';

/** 取某用户的默认账本 id（测试内动态注册的用户用） */
async function defaultAccountOf(accountService: AccountService, uid: string): Promise<string> {
  const list = await accountService.list(uid);
  return list.find((a) => a.isDefault)!.id;
}

describe('StatisticsService', () => {
  let app: IMidwayApplication;
  let statisticsService: StatisticsService;
  let transactionService: TransactionService;
  let categoryService: CategoryService;
  let authService: AuthService;
  let accountService: AccountService;

  let userId: string;
  let otherUserId: string;
  /** 分类/交易测试都跑在默认账本上（本测试不涉及删分类） */
  let defaultAccountId: string;
  let foodCategoryId: string;
  let transportCategoryId: string;
  let salaryCategoryId: string;
  const createdUserIds: string[] = [];

  // 固定月份，避免依赖"当前时间"
  const MONTH = '2026-08';

  beforeAll(async () => {
    app = await createApp(process.cwd());
    const ctx = app.getApplicationContext();
    statisticsService = await ctx.getAsync(StatisticsService);
    transactionService = await ctx.getAsync(TransactionService);
    categoryService = await ctx.getAsync(CategoryService);
    authService = await ctx.getAsync(AuthService);
    accountService = await ctx.getAsync(AccountService);

    const me = await authService.register({
      username: randomUsername('stat'),
      password: '123456',
    });
    const other = await authService.register({
      username: randomUsername('stat2'),
      password: '123456',
    });
    userId = me.user.id;
    otherUserId = other.user.id;
    createdUserIds.push(userId, otherUserId);
    defaultAccountId = (await accountService.list(userId)).find((a) => a.isDefault)!.id;

    const food = await categoryService.create(userId, {
      accountId: defaultAccountId,
      name: '餐饮',
      type: 'expense',
    });
    const transport = await categoryService.create(userId, {
      accountId: defaultAccountId,
      name: '交通',
      type: 'expense',
    });
    const salary = await categoryService.create(userId, {
      accountId: defaultAccountId,
      name: '工资',
      type: 'income',
    });
    foodCategoryId = food.id;
    transportCategoryId = transport.id;
    salaryCategoryId = salary.id;

    // 2026-08 支出：餐饮 300 + 交通 100 = 400
    await transactionService.create(userId, {
      type: 'expense',
      amount: '300.00',
      categoryId: foodCategoryId,
      recordDate: '2026-08-03',
    });
    await transactionService.create(userId, {
      type: 'expense',
      amount: '100.00',
      categoryId: transportCategoryId,
      recordDate: '2026-08-20',
    });
    // 2026-08 收入：工资 8000
    await transactionService.create(userId, {
      type: 'income',
      amount: '8000.00',
      categoryId: salaryCategoryId,
      recordDate: '2026-08-05',
    });
    // 未分类支出 100（计入总额，归到"未分类"）
    await transactionService.create(userId, {
      type: 'expense',
      amount: '100.00',
      recordDate: '2026-08-25',
    });
    // 跨月数据：不应计入 2026-08
    await transactionService.create(userId, {
      type: 'expense',
      amount: '777.00',
      categoryId: foodCategoryId,
      recordDate: '2026-09-01',
    });
    // 他人数据：不应计入当前用户统计
    await transactionService.create(otherUserId, {
      type: 'expense',
      amount: '9999.00',
      recordDate: '2026-08-10',
    });
  });

  afterAll(async () => {
    await cleanupUsers(createdUserIds);
    await close(app);
    await closeTestDataSource();
  });

  describe('monthly', () => {
    it('汇总收入、支出与结余', async () => {
      const result = await statisticsService.monthly(userId, MONTH);
      expect(result.month).toBe(MONTH);
      expect(result.income).toBe('8000.00');
      // 300 + 100 + 100(未分类)
      expect(result.expense).toBe('500.00');
      expect(result.balance).toBe('7500.00');
    });

    it('只统计指定月份：跨月数据不计入', async () => {
      const result = await statisticsService.monthly(userId, MONTH);
      // 2026-09 的 777 不应出现
      expect(result.expense).toBe('500.00');
    });

    it('数据隔离：其他用户的数据不计入', async () => {
      const result = await statisticsService.monthly(userId, MONTH);
      expect(result.expense).toBe('500.00');

      const others = await statisticsService.monthly(otherUserId, MONTH);
      expect(others.expense).toBe('9999.00');
    });

    it('空月份返回全 0，且格式为两位小数', async () => {
      const result = await statisticsService.monthly(userId, '2030-01');
      expect(result.income).toBe('0.00');
      expect(result.expense).toBe('0.00');
      expect(result.balance).toBe('0.00');
    });

    it('月份区间覆盖首尾两天（用独立月份，避免污染 8 月的分类占比断言）', async () => {
      await transactionService.create(userId, {
        type: 'expense',
        amount: '1.00',
        recordDate: '2026-10-01',
      });
      await transactionService.create(userId, {
        type: 'expense',
        amount: '2.00',
        recordDate: '2026-10-31',
      });
      const result = await statisticsService.monthly(userId, '2026-10');
      // 月首 1.00 + 月末 2.00，两天都要被统计到
      expect(result.expense).toBe('3.00');
    });
  });

  describe('categoryBreakdown', () => {
    it('按支出统计各分类金额与占比', async () => {
      const result = await statisticsService.categoryBreakdown(userId, MONTH, 'expense');
      const food = result.find((r) => r.name === '餐饮');
      const transport = result.find((r) => r.name === '交通');

      expect(food.sum).toBe('300.00');
      expect(transport.sum).toBe('100.00');

      // 占比之和约为 100（分母为当前筛选总额 500）
      const totalRatio = result.reduce((acc, r) => acc + r.ratio, 0);
      expect(totalRatio).toBeCloseTo(100, 1);
    });

    it('未分类账单归入"未分类"', async () => {
      const result = await statisticsService.categoryBreakdown(userId, MONTH, 'expense');
      const uncategorized = result.find((r) => r.name === '未分类');
      expect(uncategorized).toBeDefined();
      expect(uncategorized.categoryId === null).toBe(true);
      expect(uncategorized.sum).toBe('100.00');
    });

    it('按收入统计时只出现收入分类', async () => {
      const result = await statisticsService.categoryBreakdown(userId, MONTH, 'income');
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((r) => r.type === 'income')).toBe(true);
    });

    it('不传 type 时收入与支出一并统计', async () => {
      const result = await statisticsService.categoryBreakdown(userId, MONTH);
      const types = new Set(result.map((r) => r.type));
      expect(types.has('income')).toBe(true);
      expect(types.has('expense')).toBe(true);
    });

    it('按金额降序排列', async () => {
      const result = await statisticsService.categoryBreakdown(userId, MONTH, 'expense');
      const sums = result.map((r) => Number(r.sum));
      const sorted = [...sums].sort((a, b) => b - a);
      expect(sums).toEqual(sorted);
    });

    it('每个分类带出记账笔数', async () => {
      const result = await statisticsService.categoryBreakdown(userId, MONTH, 'expense');
      const food = result.find((r) => r.name === '餐饮');
      expect(food.count).toBeGreaterThan(0);
      // 笔数与金额一样是数字
      expect(typeof food.count).toBe('number');
    });

    it('二级分类的交易聚合到它的一级分类下', async () => {
      const parent = await categoryService.create(userId, {
        accountId: defaultAccountId,
        name: '聚合用一级',
        type: 'expense',
      });
      const child = await categoryService.create(userId, {
        accountId: defaultAccountId,
        name: '聚合用二级',
        type: 'expense',
        parentId: parent.id,
      });

      await transactionService.create(userId, {
        type: 'expense',
        amount: '50.00',
        recordDate: `${MONTH}-15`,
        categoryId: child.id,
      });

      const result = await statisticsService.categoryBreakdown(userId, MONTH, 'expense');

      // 出现在一级名下
      const aggregated = result.find((r) => r.name === '聚合用一级');
      expect(aggregated).toBeDefined();
      expect(Number(aggregated.sum)).toBeGreaterThanOrEqual(50);

      // 二级分类名不应单独出现在结果里
      expect(result.find((r) => r.name === '聚合用二级')).toBeUndefined();
    });

    it('直接挂在一级分类上的交易也归到该一级', async () => {
      const root = await categoryService.create(userId, {
        accountId: defaultAccountId,
        name: '直接挂一级',
        type: 'expense',
      });

      await transactionService.create(userId, {
        type: 'expense',
        amount: '30.00',
        recordDate: `${MONTH}-16`,
        categoryId: root.id,
      });

      const result = await statisticsService.categoryBreakdown(userId, MONTH, 'expense');
      const found = result.find((r) => r.name === '直接挂一级');
      expect(found).toBeDefined();
      expect(found.sum).toBe('30.00');
    });
  });

  describe('overview（首页总览）', () => {
    it('返回历年累计与五个区间的收支', async () => {
      const result = await statisticsService.overview(userId);

      expect(result.total).toBeTruthy();
      expect(result.ranges.map((r) => r.key)).toEqual([
        'today',
        'week',
        'month',
        'year',
        'lastYear',
      ]);
      expect(result.ranges.map((r) => r.label)).toEqual(['今天', '本周', '本月', '本年', '去年']);
    });

    it('历年累计包含全部历史数据（跨月也算）', async () => {
      const result = await statisticsService.overview(userId);
      // 测试数据里 2026-08 有 500 支出、2026-09 也有支出，故累计应大于单月
      const yearExpense = Number(result.ranges.find((r) => r.key === 'year').expense);
      expect(Number(result.total.expense)).toBeGreaterThanOrEqual(yearExpense);
    });

    it('区间金额格式统一为两位小数字符串', async () => {
      const result = await statisticsService.overview(userId);
      for (const r of result.ranges) {
        expect(r.income).toMatch(/^-?\d+\.\d{2}$/);
        expect(r.expense).toMatch(/^-?\d+\.\d{2}$/);
        expect(r.balance).toMatch(/^-?\d+\.\d{2}$/);
      }
    });

    it('结余 = 收入 − 支出', async () => {
      const result = await statisticsService.overview(userId);
      for (const r of result.ranges) {
        const expected = (Number(r.income) - Number(r.expense)).toFixed(2);
        expect(r.balance).toBe(expected);
      }
    });

    it('去年的区间落在上一年自然年内', async () => {
      const result = await statisticsService.overview(userId);
      const lastYear = result.ranges.find((r) => r.key === 'lastYear');
      const thisYear = new Date().getFullYear();
      expect(lastYear.start).toBe(`${thisYear - 1}-01-01`);
      expect(lastYear.end).toBe(`${thisYear - 1}-12-31`);
    });

    it('本周从周一开始（不是周日）', async () => {
      const result = await statisticsService.overview(userId);
      const week = result.ranges.find((r) => r.key === 'week');
      // 解析 start 的星期几，0=周日；期望为 1（周一）
      const [y, m, d] = week.start.split('-').map(Number);
      expect(new Date(y, m - 1, d).getDay()).toBe(1);
    });

    it('按账本筛选：只统计该账本', async () => {
      const account = await accountService.create(userId, { name: '总览账本' });
      await transactionService.create(userId, {
        type: 'expense',
        amount: '88.00',
        recordDate: new Date().toISOString().slice(0, 10),
        accountId: account.id,
      });

      const scoped = await statisticsService.overview(userId, account.id);
      expect(scoped.total.expense).toBe('88.00');

      // 不传 accountId 时覆盖全部账本，金额只会更大
      const all = await statisticsService.overview(userId);
      expect(Number(all.total.expense)).toBeGreaterThanOrEqual(88);
    });
  });

  describe('report（报表聚合）', () => {
    // 用独立用户与独立月份，避免与上面的用例互相污染
    let rUserId: string;
    const RYEAR = '2025';

    beforeAll(async () => {
      const u = await authService.register({
        username: randomUsername('report'),
        password: '123456',
      });
      rUserId = u.user.id;
      createdUserIds.push(rUserId);

      // 1 月一笔收入、3 月一笔支出、7 月两笔支出
      await transactionService.create(rUserId, {
        type: 'income',
        amount: '5000.00',
        recordDate: `${RYEAR}-01-15`,
      });
      await transactionService.create(rUserId, {
        type: 'expense',
        amount: '120.00',
        recordDate: `${RYEAR}-03-10`,
      });
      await transactionService.create(rUserId, {
        type: 'expense',
        amount: '80.00',
        recordDate: `${RYEAR}-07-02`,
      });
      await transactionService.create(rUserId, {
        type: 'expense',
        amount: '20.00',
        recordDate: `${RYEAR}-07-20`,
      });
    });

    it('年粒度：汇总按整年聚合，trend 返回 12 个月', async () => {
      const result = await statisticsService.report(rUserId, RYEAR);
      expect(result.granularity).toBe('year');
      expect(result.start).toBe(`${RYEAR}-01-01`);
      expect(result.end).toBe(`${RYEAR}-12-31`);
      expect(result.summary.income).toBe('5000.00');
      expect(result.summary.expense).toBe('220.00');
      expect(result.summary.balance).toBe('4780.00');
      expect(result.summary.count).toBe(4);
      expect(result.trend).toHaveLength(12);
    });

    it('年粒度：trend 无数据的月份补 0，有数据的月份正确归位', async () => {
      const result = await statisticsService.report(rUserId, RYEAR);
      const jan = result.trend[0];
      const mar = result.trend[2];
      const jul = result.trend[6];
      const feb = result.trend[1];

      expect(jan.month).toBe(`${RYEAR}-01`);
      expect(jan.income).toBe('5000.00');
      expect(jan.expense).toBe('0.00');

      expect(mar.expense).toBe('120.00');

      expect(jul.expense).toBe('100.00'); // 80 + 20

      expect(feb.income).toBe('0.00');
      expect(feb.expense).toBe('0.00');
    });

    it('月粒度：汇总按该月聚合，trend 为空数组', async () => {
      const result = await statisticsService.report(rUserId, `${RYEAR}-07`);
      expect(result.granularity).toBe('month');
      expect(result.start).toBe(`${RYEAR}-07-01`);
      expect(result.end).toBe(`${RYEAR}-07-31`);
      expect(result.summary.expense).toBe('100.00');
      expect(result.summary.income).toBe('0.00');
      expect(result.summary.count).toBe(2);
      expect(result.trend).toHaveLength(0);
    });

    it('月粒度：分类按一级聚合且含未分类', async () => {
      const result = await statisticsService.report(rUserId, `${RYEAR}-07`);
      // 两笔支出都没挂分类 → 合并为一个「未分类」组
      expect(result.expenseCategories).toHaveLength(1);
      expect(result.expenseCategories[0].name).toBe('未分类');
      expect(result.expenseCategories[0].sum).toBe('100.00');
      expect(result.expenseCategories[0].ratio).toBe(100);
    });

    it('两级口径：二级带 parentName，一级由二级归并而来', async () => {
      // 用独立用户，建「餐饮(一级) → 午餐(二级)」+「交通(一级)」两个分类
      const u = await authService.register({
        username: randomUsername('report2l'),
        password: '123456',
      });
      const l2UserId = u.user.id;
      createdUserIds.push(l2UserId);

      const food = await categoryService.create(l2UserId, {
        accountId: await defaultAccountOf(accountService, l2UserId),
        name: '餐饮L2T',
        type: 'expense',
      });
      const lunch = await categoryService.create(l2UserId, {
        accountId: await defaultAccountOf(accountService, l2UserId),
        name: '午餐L2T',
        type: 'expense',
        parentId: food.id,
      });
      const transport = await categoryService.create(l2UserId, {
        accountId: await defaultAccountOf(accountService, l2UserId),
        name: '交通L2T',
        type: 'expense',
      });

      await transactionService.create(l2UserId, {
        type: 'expense',
        amount: '60.00',
        categoryId: lunch.id,
        recordDate: `${RYEAR}-05-10`,
      });
      await transactionService.create(l2UserId, {
        type: 'expense',
        amount: '40.00',
        categoryId: transport.id,
        recordDate: `${RYEAR}-05-11`,
      });

      const result = await statisticsService.report(l2UserId, `${RYEAR}-05`);

      // 一级：餐饮 60 + 交通 40
      expect(result.expenseCategories).toHaveLength(2);
      const l1Food = result.expenseCategories.find((c) => c.name === '餐饮L2T');
      expect(l1Food?.sum).toBe('60.00');
      expect(l1Food?.parentId).toBeNull();

      // 二级：午餐（挂父）+ 交通（本身就是一级）
      expect(result.expenseCategoriesL2).toHaveLength(2);
      const l2Lunch = result.expenseCategoriesL2.find((c) => c.name === '午餐L2T');
      expect(l2Lunch?.sum).toBe('60.00');
      expect(l2Lunch?.parentName).toBe('餐饮L2T');
      expect(l2Lunch?.parentId).toBe(food.id);

      // 二级里没挂父的那条，parentId/parentName 为 null
      const l2Transport = result.expenseCategoriesL2.find((c) => c.name === '交通L2T');
      expect(l2Transport?.parentId).toBeNull();
      expect(l2Transport?.parentName).toBeNull();

      // 两级各自占比之和都是 100%（同一批交易换了分组方式）
      const sumRatio = (arr: { ratio: number }[]) => arr.reduce((s, r) => s + r.ratio, 0);
      expect(Math.round(sumRatio(result.expenseCategories))).toBe(100);
      expect(Math.round(sumRatio(result.expenseCategoriesL2))).toBe(100);
    });

    it('空时段的汇总为 0', async () => {
      const result = await statisticsService.report(rUserId, '1999');
      expect(result.summary.income).toBe('0.00');
      expect(result.summary.expense).toBe('0.00');
      expect(result.summary.balance).toBe('0.00');
      expect(result.summary.count).toBe(0);
      expect(result.trend).toHaveLength(12);
      expect(result.expenseCategories).toHaveLength(0);
    });

    it('数据隔离：查不到其他用户的数据', async () => {
      const result = await statisticsService.report(otherUserId, RYEAR);
      expect(result.summary.count).toBe(0);
    });
  });
});
