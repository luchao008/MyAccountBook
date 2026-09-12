import { createApp, close } from '@midwayjs/mock';
import { IMidwayApplication } from '@midwayjs/core';
import { TransactionService } from '../src/transaction/transaction.service';
import { CategoryService } from '../src/category/category.service';
import { AuthService } from '../src/auth/auth.service';
import { ErrorCode } from '../src/common/error-code';
import { cleanupUsers, closeTestDataSource, expectBusinessError, randomUsername } from './helper';

describe('TransactionService', () => {
  let app: IMidwayApplication;
  let transactionService: TransactionService;
  let categoryService: CategoryService;
  let authService: AuthService;

  let userId: string;
  let otherUserId: string;
  let expenseCategoryId: string;
  let incomeCategoryId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    app = await createApp(process.cwd());
    const ctx = app.getApplicationContext();
    transactionService = await ctx.getAsync(TransactionService);
    categoryService = await ctx.getAsync(CategoryService);
    authService = await ctx.getAsync(AuthService);

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

    const expense = await categoryService.create(userId, {
      name: '餐饮',
      type: 'expense',
    });
    const income = await categoryService.create(userId, {
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
});
