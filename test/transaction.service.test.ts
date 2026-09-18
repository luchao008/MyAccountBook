import { createApp, close } from '@midwayjs/mock';
import { IMidwayApplication } from '@midwayjs/core';
import { TransactionService } from '../src/transaction/transaction.service';
import { CategoryService } from '../src/category/category.service';
import { AuthService } from '../src/auth/auth.service';
import { AccountService } from '../src/account/account.service';
import { ErrorCode } from '../src/common/error-code';
import { cleanupUsers, closeTestDataSource, expectBusinessError, randomUsername } from './helper';

/** 取某用户的默认账本 id（测试内动态注册的用户用） */
async function defaultAccountOf(accountService: AccountService, uid: string): Promise<string> {
  const list = await accountService.list(uid);
  return list.find((a) => a.isDefault)!.id;
}

describe('TransactionService', () => {
  let app: IMidwayApplication;
  let transactionService: TransactionService;
  let categoryService: CategoryService;
  let authService: AuthService;
  let accountService: AccountService;

  let userId: string;
  let otherUserId: string;
  /** 分类/交易测试都跑在默认账本上（本测试不涉及删分类） */
  let defaultAccountId: string;
  let otherDefaultAccountId: string;
  let expenseCategoryId: string;
  let incomeCategoryId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    app = await createApp(process.cwd());
    const ctx = app.getApplicationContext();
    transactionService = await ctx.getAsync(TransactionService);
    categoryService = await ctx.getAsync(CategoryService);
    authService = await ctx.getAsync(AuthService);
    accountService = await ctx.getAsync(AccountService);

    const me = await authService.register({
      username: randomUsername('txn'),
      password: '123456',
    });
    const other = await authService.register({
      username: randomUsername('txn2'),
      password: '123456',
    });
    userId = me.user.id;
    otherUserId = other.user.id;
    createdUserIds.push(userId, otherUserId);
    defaultAccountId = (await accountService.list(userId)).find((a) => a.isDefault)!.id;
    otherDefaultAccountId = (await accountService.list(otherUserId)).find((a) => a.isDefault)!.id;

    const expense = await categoryService.create(userId, {
      accountId: defaultAccountId,
      name: '餐饮',
      type: 'expense',
    });
    const income = await categoryService.create(userId, {
      accountId: defaultAccountId,
      name: '工资',
      type: 'income',
    });
    expenseCategoryId = expense.id;
    incomeCategoryId = income.id;
  });

  afterAll(async () => {
    await cleanupUsers(createdUserIds);
    await close(app);
    await closeTestDataSource();
  });

  describe('create', () => {
    it('记一笔支出成功：金额保持字符串，并带出分类', async () => {
      const txn = await transactionService.create(userId, {
        type: 'expense',
        amount: '35.50',
        categoryId: expenseCategoryId,
        recordDate: '2026-03-15',
        note: '午饭',
      });

      expect(txn.amount).toBe('35.50');
      expect(txn.type).toBe('expense');
      expect(txn.recordDate).toBe('2026-03-15');
      expect(txn.note).toBe('午饭');
      expect(txn.category?.name).toBe('餐饮');
    });

    it('不传分类：categoryId 为 null', async () => {
      const txn = await transactionService.create(userId, {
        type: 'expense',
        amount: '10',
        recordDate: '2026-03-16',
      });
      expect(txn.categoryId === null || txn.categoryId === undefined).toBe(true);
    });

    it('分类类型与账单类型不一致：抛 40000', async () => {
      await expectBusinessError(
        () =>
          transactionService.create(userId, {
            type: 'expense',
            amount: '20',
            categoryId: incomeCategoryId,
            recordDate: '2026-03-17',
          }),
        ErrorCode.PARAM_INVALID,
      );
    });

    it('分类不属于当前用户：抛 40401', async () => {
      const othersCategory = await categoryService.create(otherUserId, {
        accountId: otherDefaultAccountId,
        name: '他人分类',
        type: 'expense',
      });
      await expectBusinessError(
        () =>
          transactionService.create(userId, {
            type: 'expense',
            amount: '20',
            categoryId: othersCategory.id,
            recordDate: '2026-03-18',
          }),
        ErrorCode.CATEGORY_NOT_FOUND,
      );
    });

    it('★ 幂等：同一 clientId 重复提交只落一条（离线补传重试）', async () => {
      const clientId = 'offline-uuid-001';
      const first = await transactionService.create(userId, {
        type: 'expense',
        amount: '18.80',
        categoryId: expenseCategoryId,
        recordDate: '2026-06-01',
        note: '离线记的一笔',
        clientId,
      });
      const second = await transactionService.create(userId, {
        type: 'expense',
        amount: '18.80',
        categoryId: expenseCategoryId,
        recordDate: '2026-06-01',
        note: '离线记的一笔',
        clientId,
      });
      // 第二次返回同一条（不新建）
      expect(second.id).toBe(first.id);

      // 库里确实只有一条
      const page = await transactionService.page(userId, {
        accountId: defaultAccountId,
        start: '2026-06-01',
        end: '2026-06-01',
        page: 1,
        size: 100,
      });
      expect(page.list.filter((t) => t.clientId === clientId).length).toBe(1);
    });

    it('不带 clientId 的两次新增是两条（在线正常新增不受影响）', async () => {
      const a = await transactionService.create(userId, {
        type: 'expense',
        amount: '5.00',
        recordDate: '2026-06-02',
        note: '同款咖啡',
      });
      const b = await transactionService.create(userId, {
        type: 'expense',
        amount: '5.00',
        recordDate: '2026-06-02',
        note: '同款咖啡',
      });
      expect(a.id).not.toBe(b.id);
    });

    it('clientId 为空字符串：视同不传（不做幂等）', async () => {
      const a = await transactionService.create(userId, {
        type: 'expense',
        amount: '6.00',
        recordDate: '2026-06-03',
        clientId: '',
      });
      const b = await transactionService.create(userId, {
        type: 'expense',
        amount: '6.00',
        recordDate: '2026-06-03',
        clientId: '',
      });
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('page', () => {
    beforeAll(async () => {
      // 造一批固定日期数据，便于断言筛选结果
      await transactionService.create(userId, {
        type: 'expense',
        amount: '100.00',
        categoryId: expenseCategoryId,
        recordDate: '2026-04-05',
        note: 'A',
      });
      await transactionService.create(userId, {
        type: 'expense',
        amount: '200.00',
        categoryId: expenseCategoryId,
        recordDate: '2026-04-15',
        note: 'B',
      });
      await transactionService.create(userId, {
        type: 'income',
        amount: '5000.00',
        categoryId: incomeCategoryId,
        recordDate: '2026-05-01',
        note: 'C',
      });
    });

    it('分页返回 total 与当前页', async () => {
      const page1 = await transactionService.page(userId, {
        page: 1,
        size: 2,
      });
      expect(page1.page).toBe(1);
      expect(page1.size).toBe(2);
      expect(page1.list.length).toBeLessThanOrEqual(2);
      expect(page1.total).toBeGreaterThanOrEqual(3);
    });

    it('按日期区间筛选（闭区间）', async () => {
      const result = await transactionService.page(userId, {
        page: 1,
        size: 50,
        start: '2026-04-01',
        end: '2026-04-30',
      });
      expect(result.list.length).toBe(2);
      expect(result.list.every((t) => t.recordDate.startsWith('2026-04'))).toBe(true);
    });

    it('按收支类型筛选', async () => {
      const result = await transactionService.page(userId, {
        page: 1,
        size: 50,
        type: 'income',
      });
      expect(result.list.length).toBeGreaterThan(0);
      expect(result.list.every((t) => t.type === 'income')).toBe(true);
    });

    it('按分类筛选', async () => {
      const result = await transactionService.page(userId, {
        page: 1,
        size: 50,
        categoryId: incomeCategoryId,
      });
      expect(result.list.length).toBeGreaterThan(0);
      expect(result.list.every((t) => String(t.categoryId) === String(incomeCategoryId))).toBe(
        true,
      );
    });

    it('按日期倒序：最近的排前面', async () => {
      const result = await transactionService.page(userId, {
        page: 1,
        size: 50,
      });
      const dates = result.list.map((t) => t.recordDate);
      const sorted = [...dates].sort().reverse();
      expect(dates).toEqual(sorted);
    });

    it('数据隔离：查不到其他用户的账单', async () => {
      await transactionService.create(otherUserId, {
        type: 'expense',
        amount: '999.00',
        recordDate: '2026-04-20',
        note: '他人账单',
      });
      const mine = await transactionService.page(userId, {
        page: 1,
        size: 50,
      });
      expect(mine.list.every((t) => t.note !== '他人账单')).toBe(true);
    });
  });

  describe('findById', () => {
    it('账单不存在：抛 40402', async () => {
      await expectBusinessError(
        () => transactionService.findById(userId, '999999999'),
        ErrorCode.TRANSACTION_NOT_FOUND,
      );
    });

    it('其他用户的账单不可见：抛 40402', async () => {
      const others = await transactionService.create(otherUserId, {
        type: 'expense',
        amount: '1.00',
        recordDate: '2026-04-21',
      });
      await expectBusinessError(
        () => transactionService.findById(userId, others.id),
        ErrorCode.TRANSACTION_NOT_FOUND,
      );
    });
  });

  describe('update', () => {
    it('局部更新金额与备注', async () => {
      const txn = await transactionService.create(userId, {
        type: 'expense',
        amount: '15.00',
        recordDate: '2026-06-01',
        note: '旧备注',
      });
      const updated = await transactionService.update(userId, txn.id, {
        amount: '18.80',
        note: '新备注',
      });
      expect(updated.amount).toBe('18.80');
      expect(updated.note).toBe('新备注');
      // 未传的字段保持不变
      expect(updated.type).toBe('expense');
      expect(updated.recordDate).toBe('2026-06-01');
    });

    it('改类型导致与现有分类冲突：抛 40000', async () => {
      const txn = await transactionService.create(userId, {
        type: 'expense',
        amount: '20.00',
        categoryId: expenseCategoryId,
        recordDate: '2026-06-02',
      });
      // 支出账单挂的是支出分类，改成 income 后类型不一致
      await expectBusinessError(
        () => transactionService.update(userId, txn.id, { type: 'income' }),
        ErrorCode.PARAM_INVALID,
      );
    });

    it('清空分类：传空字符串后 categoryId 为 null', async () => {
      const txn = await transactionService.create(userId, {
        type: 'expense',
        amount: '20.00',
        categoryId: expenseCategoryId,
        recordDate: '2026-06-03',
      });
      const updated = await transactionService.update(userId, txn.id, {
        categoryId: '',
      });
      expect(updated.categoryId === null || updated.categoryId === undefined).toBe(true);
    });
  });

  describe('delete', () => {
    it('删除成功：返回 success 且再查为 40402', async () => {
      const txn = await transactionService.create(userId, {
        type: 'expense',
        amount: '5.00',
        recordDate: '2026-07-01',
      });
      const result = await transactionService.delete(userId, txn.id);
      expect(result).toEqual({ success: true });

      await expectBusinessError(
        () => transactionService.findById(userId, txn.id),
        ErrorCode.TRANSACTION_NOT_FOUND,
      );
    });

    it('删除不存在的账单：抛 40402', async () => {
      await expectBusinessError(
        () => transactionService.delete(userId, '999999999'),
        ErrorCode.TRANSACTION_NOT_FOUND,
      );
    });
  });

  describe('时刻（recordTime）', () => {
    it('带时刻创建：存为 HH:mm:ss，返回值一致', async () => {
      const txn = await transactionService.create(userId, {
        type: 'expense',
        amount: '12.00',
        recordDate: '2026-09-20',
        recordTime: '09:05',
        note: '带时间',
      });
      expect(txn.recordTime).toBe('09:05:00');
    });

    it('不带时刻：recordTime 为 null', async () => {
      const txn = await transactionService.create(userId, {
        type: 'expense',
        amount: '13.00',
        recordDate: '2026-09-20',
      });
      expect(txn.recordTime === null).toBe(true);
    });

    it('更新为空字符串：清除已记录的时刻', async () => {
      const txn = await transactionService.create(userId, {
        type: 'expense',
        amount: '14.00',
        recordDate: '2026-09-20',
        recordTime: '08:30',
      });
      const updated = await transactionService.update(userId, txn.id, {
        recordTime: '',
      });
      expect(updated.recordTime === null).toBe(true);
    });

    it('同日期排序：有时刻的排在无时刻前面', async () => {
      const withTime = await transactionService.create(userId, {
        type: 'expense',
        amount: '15.00',
        recordDate: '2026-09-21',
        recordTime: '10:00',
      });
      const withoutTime = await transactionService.create(userId, {
        type: 'expense',
        amount: '16.00',
        recordDate: '2026-09-21',
      });

      const page = await transactionService.page(userId, {
        page: 1,
        size: 50,
        start: '2026-09-21',
        end: '2026-09-21',
      });
      const ids = page.list.map((t) => t.id);
      expect(ids.indexOf(withTime.id)).toBeLessThan(ids.indexOf(withoutTime.id));
    });
  });

  describe('新增筛选与排序（流水页用）', () => {
    let qUserId: string;
    let catFood: string;
    let catLunch: string;
    let catTraffic: string;

    beforeAll(async () => {
      const u = await authService.register({
        username: randomUsername('tquery'),
        password: '123456',
      });
      qUserId = u.user.id;
      createdUserIds.push(qUserId);

      catFood = (
        await categoryService.create(qUserId, {
          accountId: await defaultAccountOf(accountService, qUserId),
          name: '餐饮Q',
          type: 'expense',
        })
      ).id;
      catLunch = (
        await categoryService.create(qUserId, {
          accountId: await defaultAccountOf(accountService, qUserId),
          name: '午餐Q',
          type: 'expense',
          parentId: catFood,
        })
      ).id;
      catTraffic = (
        await categoryService.create(qUserId, {
          accountId: await defaultAccountOf(accountService, qUserId),
          name: '交通Q',
          type: 'expense',
        })
      ).id;

      await transactionService.create(qUserId, {
        type: 'expense',
        amount: '30.00',
        categoryId: catLunch,
        recordDate: '2026-06-01',
        note: '公司午餐',
      });
      await transactionService.create(qUserId, {
        type: 'expense',
        amount: '80.00',
        categoryId: catTraffic,
        recordDate: '2026-06-02',
        note: '打车',
      });
      await transactionService.create(qUserId, {
        type: 'income',
        amount: '500.00',
        recordDate: '2026-06-03',
        note: '兼职收入',
      });
    });

    const q = () => ({ page: 1, size: 50 });

    it('关键词匹配备注', async () => {
      const r = await transactionService.page(qUserId, { ...q(), keyword: '午餐' } as any);
      expect(r.total).toBe(1);
      expect(r.list[0].note).toBe('公司午餐');
    });

    it('关键词匹配分类名', async () => {
      const r = await transactionService.page(qUserId, { ...q(), keyword: '交通Q' } as any);
      expect(r.total).toBe(1);
    });

    it('关键词匹配金额（"80" 命中 80.00）', async () => {
      const r = await transactionService.page(qUserId, { ...q(), keyword: '80' } as any);
      expect(r.total).toBe(1);
      expect(r.list[0].amount).toBe('80.00');
    });

    it('关键词匹配金额：整数部分命中（"8" 命中 80.00）', async () => {
      const r = await transactionService.page(qUserId, { ...q(), keyword: '8' } as any);
      expect(r.total).toBeGreaterThanOrEqual(1);
      expect(r.list.some((t) => t.amount === '80.00')).toBe(true);
    });

    it('金额区间（闭区间）', async () => {
      const r = await transactionService.page(qUserId, {
        ...q(),
        minAmount: '30.00',
        maxAmount: '80.00',
      } as any);
      expect(r.total).toBe(2);
    });

    it('分类多选：逗号分隔', async () => {
      const r = await transactionService.page(qUserId, {
        ...q(),
        categoryIds: `${catLunch},${catTraffic}`,
      } as any);
      expect(r.total).toBe(2);
    });

    it('分类多选：传一级分类会连带命中其下二级', async () => {
      // 交易挂在二级「午餐Q」上，传一级「餐饮Q」应当命中
      const r = await transactionService.page(qUserId, {
        ...q(),
        categoryIds: catFood,
      } as any);
      expect(r.total).toBe(1);
      expect(r.list[0].categoryId).toBe(catLunch);
    });

    it('排序：金额升序 / 降序', async () => {
      const asc = await transactionService.page(qUserId, { ...q(), order: 'amountAsc' } as any);
      expect(asc.list.map((t) => t.amount)).toEqual(['30.00', '80.00', '500.00']);

      const desc = await transactionService.page(qUserId, { ...q(), order: 'amountDesc' } as any);
      expect(desc.list.map((t) => t.amount)).toEqual(['500.00', '80.00', '30.00']);
    });

    it('summary：按天分组，结余 = 收入 - 支出，倒序', async () => {
      const rows = await transactionService.summary(qUserId, { unit: 'day' } as any);
      expect(rows.map((r) => r.key)).toEqual(['2026-06-03', '2026-06-02', '2026-06-01']);
      expect(rows[0].income).toBe('500.00');
      expect(rows[0].balance).toBe('500.00');
      expect(rows[2].expense).toBe('30.00');
      expect(rows[2].balance).toBe('-30.00');
    });

    it('summary：按月分组', async () => {
      const rows = await transactionService.summary(qUserId, { unit: 'month' } as any);
      expect(rows).toHaveLength(1);
      expect(rows[0].key).toBe('2026-06');
      expect(rows[0].income).toBe('500.00');
      expect(rows[0].expense).toBe('110.00');
      expect(rows[0].balance).toBe('390.00');
      expect(rows[0].count).toBe(3);
    });

    it('summary：与列表共用筛选（只看支出）', async () => {
      const rows = await transactionService.summary(qUserId, {
        unit: 'month',
        type: 'expense',
      } as any);
      expect(rows[0].income).toBe('0.00');
      expect(rows[0].expense).toBe('110.00');
    });

    it('summary：数据隔离', async () => {
      const rows = await transactionService.summary(otherUserId, { unit: 'month' } as any);
      expect(rows.find((r) => r.key === '2026-06')).toBeUndefined();
    });

    it('summary 按一级分类分组：二级交易归到父', async () => {
      const rows = await transactionService.summary(qUserId, {
        groupBy: 'category',
        level: 1,
      } as any);

      // 餐饮Q（含其下二级午餐Q 30）+ 交通Q 80 + 未分类（收入 500）
      const food = rows.find((r) => r.name === '餐饮Q');
      expect(food?.expense).toBe('30.00');
      expect(food?.key).toBe(catFood);

      const traffic = rows.find((r) => r.name === '交通Q');
      expect(traffic?.expense).toBe('80.00');

      const none = rows.find((r) => r.name === '未分类');
      expect(none?.income).toBe('500.00');
      expect(none?.key).toBe('__none__');

      /*
       * 排序口径是 **金额合计降序**（SQL 里 `ORDER BY sum DESC`），不是结余降序 ——
       * 结余会把支出组排到很后面（支出是负数），与"哪类花得最多"的直觉相反。
       * 这里按 |收入| + |支出| 的总量核对。
       */
      const totals = rows.map((r) => Number(r.income) + Number(r.expense));
      expect([...totals].sort((a, b) => b - a)).toEqual(totals);
    });

    it('summary 按二级分类分组：带所属一级，且未挂父的为 null', async () => {
      const rows = await transactionService.summary(qUserId, {
        groupBy: 'category',
        level: 2,
      } as any);

      const lunch = rows.find((r) => r.name === '午餐Q');
      expect(lunch?.key).toBe(catLunch);
      expect(lunch?.parentName).toBe('餐饮Q');

      // 交通Q 本身就是一级，作为"叶子"出现时没有父
      const traffic = rows.find((r) => r.name === '交通Q');
      expect(traffic?.parentName).toBeNull();
    });

    it('summary 按分类分组：两级各自的金额之和相等（同一批交易换个分组方式）', async () => {
      const l1 = await transactionService.summary(qUserId, {
        groupBy: 'category',
        level: 1,
      } as any);
      const l2 = await transactionService.summary(qUserId, {
        groupBy: 'category',
        level: 2,
      } as any);
      const sum = (arr: any[], f: string) => arr.reduce((s, r) => s + Number(r[f]), 0);
      expect(sum(l1, 'expense').toFixed(2)).toBe(sum(l2, 'expense').toFixed(2));
      expect(sum(l1, 'income').toFixed(2)).toBe(sum(l2, 'income').toFixed(2));
    });

    /*
     * ⚠️ **2026-09-15 约定反转**：原先"按分类分组不带时间限制"（用户当时确认）。
     * 现在改为「底栏『分类』只是换个展示形态，筛选条件照常生效」。
     *
     * ⚠️ 下面三条**各自建自己的数据**（独立日期），不依赖其它用例的执行顺序 ——
     *    项目铁律：共享 fixture 的用例之间会互相污染（曾出现"未分类 100 变 103"假失败）。
     */
    it('summary 按分类分组：不传 start/end 时不限时间（整个账本）', async () => {
      // 独立日期 2019-05-05：不与本 describe 其它用例的数据重叠
      await transactionService.create(qUserId, {
        type: 'expense',
        amount: '7.00',
        categoryId: catTraffic,
        recordDate: '2019-05-05',
      });
      const rows = await transactionService.summary(qUserId, {
        groupBy: 'category',
        level: 1,
      } as any);
      const traffic = rows.find((r) => r.name === '交通Q');
      // 80（既有 2026-06-02）+ 7（2019）—— 不传时间就都在
      expect(traffic?.expense).toBe('87.00');
    });

    it('summary 按分类分组：传 start/end 时按时间过滤（2026-09-15 反转）', async () => {
      // 独立日期 2019-06-06
      await transactionService.create(qUserId, {
        type: 'expense',
        amount: '9.00',
        categoryId: catTraffic,
        recordDate: '2019-06-06',
      });
      const rows = await transactionService.summary(qUserId, {
        groupBy: 'category',
        level: 1,
        start: '2026-06-01',
        end: '2026-06-30',
      } as any);
      const traffic = rows.find((r) => r.name === '交通Q');
      // 只算 2026-06 的 80，2019 那笔被排除
      expect(traffic?.expense).toBe('80.00');
    });

    it('summary 按分类分组：categoryIds 生效，且传一级会连带其下二级', async () => {
      // 传一级「餐饮Q」→ 其下二级「午餐Q」的 30.00 也要命中
      const rows = await transactionService.summary(qUserId, {
        groupBy: 'category',
        level: 1,
        categoryIds: catFood,
      } as any);
      expect(rows.map((r) => r.name)).toEqual(['餐饮Q']);
      expect(rows[0].expense).toBe('30.00');
    });
  });

  describe('软删除与流水回收站（2026-09-15）', () => {
    let sUserId: string;

    beforeAll(async () => {
      const u = await authService.register({
        username: randomUsername('tsoftdel'),
        password: '123456',
      });
      sUserId = u.user.id;
      createdUserIds.push(sUserId);
    });

    it('删除后：详情查不到（40402）、列表不含、汇总不计', async () => {
      const t1 = await transactionService.create(sUserId, {
        type: 'expense',
        amount: '11.00',
        recordDate: '2026-07-01',
      });
      await transactionService.delete(sUserId, t1.id);

      await expect(transactionService.findById(sUserId, t1.id)).rejects.toThrow();

      const page = await transactionService.page(sUserId, { page: 1, size: 50 } as any);
      expect(page.list.find((x) => x.id === t1.id)).toBeUndefined();

      const rows = await transactionService.summary(sUserId, {
        groupBy: 'time',
        unit: 'month',
      } as any);
      expect(rows.find((r) => r.key === '2026-07')).toBeUndefined();
    });

    it('回收站能查到已删的；恢复后回到列表', async () => {
      const t2 = await transactionService.create(sUserId, {
        type: 'expense',
        amount: '22.00',
        recordDate: '2026-07-02',
      });
      await transactionService.delete(sUserId, t2.id);

      const deleted = await transactionService.listDeleted(sUserId);
      expect(deleted.find((x) => x.id === t2.id)).toBeTruthy();

      await transactionService.restore(sUserId, t2.id);
      const back = await transactionService.findById(sUserId, t2.id);
      expect(back.id).toBe(t2.id);
      expect(back.deletedAt).toBeNull();

      const deletedAfter = await transactionService.listDeleted(sUserId);
      expect(deletedAfter.find((x) => x.id === t2.id)).toBeUndefined();
    });

    it('已删除的不能再删 / 不能恢复不存在的（40402）', async () => {
      const t3 = await transactionService.create(sUserId, {
        type: 'expense',
        amount: '33.00',
        recordDate: '2026-07-03',
      });
      await transactionService.delete(sUserId, t3.id);
      // 再删：findById 带软删除过滤 → 40402
      await expect(transactionService.delete(sUserId, t3.id)).rejects.toThrow();
      // 恢复一条从未删过的：也应 40402
      const t4 = await transactionService.create(sUserId, {
        type: 'expense',
        amount: '44.00',
        recordDate: '2026-07-04',
      });
      await expect(transactionService.restore(sUserId, t4.id)).rejects.toThrow();
    });

    it('★ 超期记录被惰性真删（7 天前删的查不到）', async () => {
      const t5 = await transactionService.create(sUserId, {
        type: 'expense',
        amount: '55.00',
        recordDate: '2026-07-05',
      });
      await transactionService.delete(sUserId, t5.id);
      /*
       * 手工把 deleted_at 改成 8 天前 —— 越过 7 天保留期。
       * 用 dataSource 直改（没有对外接口做这件事，这是测试专用手段）。
       */
      // service 的 dataSource 是 public 的（@InjectDataSource()），直接用它
      const ds = transactionService.dataSource;
      await ds.query(
        'UPDATE transactions SET deleted_at = DATE_SUB(NOW(6), INTERVAL 8 DAY) WHERE id = ?',
        [t5.id],
      );
      // 查回收站会触发惰性清理 → 这条既不在返回结果里，也已被物理删除
      const list = await transactionService.listDeleted(sUserId);
      expect(list.find((x) => x.id === t5.id)).toBeUndefined();
      const raw = await ds.query('SELECT COUNT(*) AS c FROM transactions WHERE id = ?', [t5.id]);
      expect(Number(raw[0].c)).toBe(0);
    });
  });
});
