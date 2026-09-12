import { createApp, close } from '@midwayjs/mock';
import { IMidwayApplication } from '@midwayjs/core';
import { AccountService } from '../src/account/account.service';
import { TransactionService } from '../src/transaction/transaction.service';
import { AuthService } from '../src/auth/auth.service';
import { StatisticsService } from '../src/statistics/statistics.service';
import { ErrorCode } from '../src/common/error-code';
import { cleanupUsers, closeTestDataSource, expectBusinessError, randomUsername } from './helper';

describe('多账本', () => {
  let app: IMidwayApplication;
  let accountService: AccountService;
  let transactionService: TransactionService;
  let statisticsService: StatisticsService;
  let authService: AuthService;

  let userId: string;
  let otherUserId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    app = await createApp(process.cwd());
    const ctx = app.getApplicationContext();
    accountService = await ctx.getAsync(AccountService);
    transactionService = await ctx.getAsync(TransactionService);
    statisticsService = await ctx.getAsync(StatisticsService);
    authService = await ctx.getAsync(AuthService);

    const me = await authService.register({
      username: randomUsername('acc'),
      password: '123456',
    });
    const other = await authService.register({
      username: randomUsername('acc2'),
      password: '123456',
    });
    userId = me.user.id;
    otherUserId = other.user.id;
    createdUserIds.push(userId, otherUserId);
  });

  afterAll(async () => {
    await cleanupUsers(createdUserIds);
    await close(app);
    await closeTestDataSource();
  });

  describe('注册与默认账本', () => {
    it('注册后自动拥有一个默认账本', async () => {
      const list = await accountService.list(userId);
      expect(list.length).toBe(1);
      expect(list[0].name).toBe('默认账本');
      expect(list[0].isDefault).toBe(true);
    });

    it('getDefaultAccount 能取到默认账本', async () => {
      const account = await accountService.getDefaultAccount(userId);
      expect(account).toBeTruthy();
      expect(account.isDefault).toBe(true);
    });
  });

  describe('创建账本', () => {
    it('创建成功：非首个账本 isDefault 为 false', async () => {
      const account = await accountService.create(userId, {
        name: '家庭账本',
        icon: 'home',
      });
      expect(account.name).toBe('家庭账本');
      expect(account.isDefault).toBe(false);
      expect(account.userId).toBe(userId);
    });

    it('账本名重复：抛 40903', async () => {
      await expectBusinessError(
        () => accountService.create(userId, { name: '家庭账本' }),
        ErrorCode.ACCOUNT_NAME_EXISTS,
      );
    });

    it('不同用户可以用同名账本', async () => {
      const a = await accountService.create(otherUserId, { name: '家庭账本' });
      expect(a.userId).toBe(otherUserId);
    });

    it('数据隔离：查不到其他用户的账本', async () => {
      const mine = await accountService.list(userId);
      const others = await accountService.list(otherUserId);
      const mineIds = new Set(mine.map((a) => a.id));
      expect(others.every((a) => !mineIds.has(a.id))).toBe(true);
    });
  });

  describe('更新账本', () => {
    it('改名成功', async () => {
      const list = await accountService.list(userId);
      const target = list.find((a) => a.name === '家庭账本');
      const updated = await accountService.update(userId, target.id, {
        name: '家庭账本2',
      });
      expect(updated.name).toBe('家庭账本2');
      // 改回去，避免影响后续用例
      await accountService.update(userId, target.id, { name: '家庭账本' });
    });

    it('设为默认账本会摘掉原默认标记', async () => {
      const list = await accountService.list(userId);
      const target = list.find((a) => a.name === '家庭账本');
      await accountService.update(userId, target.id, { isDefault: true });

      const after = await accountService.list(userId);
      expect(after.filter((a) => a.isDefault).length).toBe(1);
      expect(after.find((a) => a.isDefault).id).toBe(target.id);

      // 还原：把默认标记还给最初的「默认账本」
      const original = after.find((a) => a.name === '默认账本');
      await accountService.update(userId, original.id, { isDefault: true });
    });
  });

  describe('删除账本（防误删）', () => {
    it('确认名称不一致：抛 40001', async () => {
      const account = await accountService.create(userId, { name: '待删A' });
      await expectBusinessError(
        () => accountService.remove(userId, account.id, '写错的名字'),
        ErrorCode.ACCOUNT_CONFIRM_MISMATCH,
      );
    });

    it('删除最后一个账本：抛 40002', async () => {
      // 用一个全新用户测试：他只有注册时那一个账本
      const solo = await authService.register({
        username: randomUsername('solo'),
        password: '123456',
      });
      createdUserIds.push(solo.user.id);

      const accounts = await accountService.list(solo.user.id);
      expect(accounts.length).toBe(1);

      await expectBusinessError(
        () => accountService.remove(solo.user.id, accounts[0].id, accounts[0].name),
        ErrorCode.ACCOUNT_LAST_ONE,
      );
    });

    it('删除成功：连同其下交易一并删除', async () => {
      const account = await accountService.create(userId, { name: '待删B' });

      // 往这个账本里记两笔
      await transactionService.create(userId, {
        type: 'expense',
        amount: '11.00',
        recordDate: '2026-09-01',
        accountId: account.id,
      });
      await transactionService.create(userId, {
        type: 'expense',
        amount: '22.00',
        recordDate: '2026-09-02',
        accountId: account.id,
      });

      const preview = await accountService.previewDelete(userId, account.id);
      expect(preview.transactionCount).toBe(2);

      const result = await accountService.remove(userId, account.id, '待删B');
      expect(result.success).toBe(true);
      expect(result.deletedTransactions).toBe(2);

      await expectBusinessError(
        () => accountService.findById(userId, account.id),
        ErrorCode.ACCOUNT_NOT_FOUND,
      );
    });

    it('删除默认账本后，默认标记转移给剩余账本', async () => {
      const list = await accountService.list(userId);
      const def = list.find((a) => a.isDefault);
      expect(def).toBeTruthy();
      // 删掉默认账本（此时用户还有「家庭账本」，所以不会触发最后一个的限制）
      await accountService.remove(userId, def.id, def.name);

      const after = await accountService.list(userId);
      expect(after.length).toBeGreaterThan(0);
      expect(after.filter((a) => a.isDefault).length).toBe(1);
    });

    it('删除不存在的账本：抛 40403', async () => {
      await expectBusinessError(
        () => accountService.findById(userId, '999999999'),
        ErrorCode.ACCOUNT_NOT_FOUND,
      );
    });
  });

  describe('合并账本', () => {
    let target: any;
    let source: any;

    beforeAll(async () => {
      target = await accountService.create(userId, { name: '合并目标' });
      source = await accountService.create(userId, { name: '合并源' });

      // 目标账本：3 笔
      for (const [amount, note] of [
        ['10.00', '相同的一笔'],
        ['20.00', '目标独有'],
        ['30.00', '金额相同但备注不同'],
      ]) {
        await transactionService.create(userId, {
          type: 'expense',
          amount,
          recordDate: '2026-08-10',
          note,
          accountId: target.id,
        });
      }

      // 源账本：4 笔，其中 1 笔与目标完全重复
      for (const [amount, note] of [
        ['10.00', '相同的一笔'], // 完全重复（金额/日期/类型/分类/备注全同）
        ['30.00', '源账本的同额不同备注'], // 仅金额相同、备注不同 → 不算重复，保留
        ['40.00', '源独有'],
        ['50.00', '源独有2'],
      ]) {
        await transactionService.create(userId, {
          type: 'expense',
          amount,
          recordDate: '2026-08-10',
          note,
          accountId: source.id,
        });
      }
    });

    it('不能合并到自己：抛 40003', async () => {
      await expectBusinessError(
        () => accountService.merge(userId, target.id, target.id),
        ErrorCode.ACCOUNT_MERGE_SELF,
      );
    });

    it('预检：算出会迁移几笔、去重几笔', async () => {
      const preview = await accountService.previewMerge(userId, target.id, source.id);
      // 源账本共 4 笔
      expect(preview.sourceTotal).toBe(4);
      // 只有「10.00 + 相同的一笔」是严格全字段重复
      expect(preview.willSkip).toBe(1);
      expect(preview.willMove).toBe(3);
    });

    it('合并执行：去重 + 迁移 + 删除源账本', async () => {
      const result = await accountService.merge(userId, target.id, source.id);
      expect(result.sourceTotal).toBe(4);
      expect(result.willSkip).toBe(1);
      expect(result.willMove).toBe(3);
      expect(result.sourceName).toBe('合并源');

      // 源账本已删除
      await expectBusinessError(
        () => accountService.findById(userId, source.id),
        ErrorCode.ACCOUNT_NOT_FOUND,
      );

      // 目标账本：原有 3 笔 + 迁入 3 笔 = 6 笔
      const page = await transactionService.page(userId, {
        page: 1,
        size: 100,
        accountId: target.id,
      });
      expect(page.total).toBe(6);
    });

    it('合并后严格去重生效：完全相同的记录只剩一条', async () => {
      const page = await transactionService.page(userId, {
        page: 1,
        size: 100,
        accountId: target.id,
      });
      const identical = page.list.filter((t) => t.amount === '10.00' && t.note === '相同的一笔');
      expect(identical.length).toBe(1);
    });

    it('金额相同但备注不同的两笔都保留（不算重复）', async () => {
      const page = await transactionService.page(userId, {
        page: 1,
        size: 100,
        accountId: target.id,
      });
      // 目标原有的 1 条 + 源迁入的 1 条 = 2 条
      const sameAmount = page.list.filter((t) => t.amount === '30.00');
      expect(sameAmount.length).toBe(2);
    });

    it('数据隔离：不能合并其他用户的账本', async () => {
      const othersAccount = await accountService.create(otherUserId, {
        name: '他人账本',
      });
      await expectBusinessError(
        () => accountService.merge(userId, target.id, othersAccount.id),
        ErrorCode.ACCOUNT_NOT_FOUND,
      );
    });
  });

  describe('账单的账本归属', () => {
    it('不传 accountId：自动记入默认账本（向后兼容）', async () => {
      const def = await accountService.getDefaultAccount(userId);
      const txn = await transactionService.create(userId, {
        type: 'expense',
        amount: '5.00',
        recordDate: '2026-09-03',
      });
      expect(String(txn.accountId)).toBe(String(def.id));
    });

    it('指定 accountId：记入该账本', async () => {
      const account = await accountService.create(userId, { name: '指定账本' });
      const txn = await transactionService.create(userId, {
        type: 'expense',
        amount: '6.00',
        recordDate: '2026-09-04',
        accountId: account.id,
      });
      expect(String(txn.accountId)).toBe(String(account.id));
    });

    it('账本不属于当前用户：抛 40403', async () => {
      const othersAccount = await accountService.create(otherUserId, {
        name: '别人的账本',
      });
      await expectBusinessError(
        () =>
          transactionService.create(userId, {
            type: 'expense',
            amount: '7.00',
            recordDate: '2026-09-05',
            accountId: othersAccount.id,
          }),
        ErrorCode.ACCOUNT_NOT_FOUND,
      );
    });

    it('列表按 accountId 筛选', async () => {
      const account = await accountService.create(userId, { name: '筛选账本' });
      await transactionService.create(userId, {
        type: 'expense',
        amount: '8.00',
        recordDate: '2026-09-06',
        accountId: account.id,
      });

      const filtered = await transactionService.page(userId, {
        page: 1,
        size: 100,
        accountId: account.id,
      });
      expect(filtered.total).toBe(1);
    });

    it('更新时可以把交易改挂到另一个账本', async () => {
      const from = await accountService.create(userId, { name: '迁出' });
      const to = await accountService.create(userId, { name: '迁入' });
      const txn = await transactionService.create(userId, {
        type: 'expense',
        amount: '9.00',
        recordDate: '2026-09-07',
        accountId: from.id,
      });

      const updated = await transactionService.update(userId, txn.id, {
        accountId: to.id,
      });
      expect(String(updated.accountId)).toBe(String(to.id));
    });
  });

  describe('统计的账本维度', () => {
    it('按账本统计：只算该账本的钱', async () => {
      const a = await accountService.create(userId, { name: '统计A' });
      const b = await accountService.create(userId, { name: '统计B' });

      await transactionService.create(userId, {
        type: 'expense',
        amount: '100.00',
        recordDate: '2026-07-05',
        accountId: a.id,
      });
      await transactionService.create(userId, {
        type: 'expense',
        amount: '200.00',
        recordDate: '2026-07-05',
        accountId: b.id,
      });

      const statA = await statisticsService.monthly(userId, '2026-07', a.id);
      expect(statA.expense).toBe('100.00');

      const statB = await statisticsService.monthly(userId, '2026-07', b.id);
      expect(statB.expense).toBe('200.00');

      // 不传 accountId：统计全部账本
      const statAll = await statisticsService.monthly(userId, '2026-07');
      expect(statAll.expense).toBe('300.00');
    });

    it('分类占比按账本筛选', async () => {
      const account = await accountService.create(userId, { name: '占比账本' });
      await transactionService.create(userId, {
        type: 'expense',
        amount: '66.00',
        recordDate: '2026-06-15',
        accountId: account.id,
      });

      const rows = await statisticsService.categoryBreakdown(
        userId,
        '2026-06',
        'expense',
        account.id,
      );
      const sum = rows.reduce((acc, r) => acc + Number(r.sum), 0);
      expect(sum).toBe(66);
    });
  });
});
