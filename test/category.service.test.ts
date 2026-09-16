import { createApp, close } from '@midwayjs/mock';
import { IMidwayApplication } from '@midwayjs/core';
import { CategoryService } from '../src/category/category.service';
import { AuthService } from '../src/auth/auth.service';
import { AccountService } from '../src/account/account.service';
import { TransactionService } from '../src/transaction/transaction.service';
import { ErrorCode } from '../src/common/error-code';
import { cleanupUsers, closeTestDataSource, expectBusinessError, randomUsername } from './helper';

/**
 * ⚠️ 分类自 2026-09-16 起为**账本级隔离**，所有方法都要 accountId。
 *
 * 测试策略：功能性测试都跑在**非默认账本**（mainAccountId）上 ——
 * 因为默认账本的分类**不允许删除**（设计 D16），用它测删除会全部报 40006。
 * 非默认账本由测试自行创建（注册时只自动建默认账本）。
 * 默认账本专用于"默认账本禁删"的专项用例。
 */
describe('CategoryService', () => {
  let app: IMidwayApplication;
  let categoryService: CategoryService;
  let authService: AuthService;
  let accountService: AccountService;
  let transactionService: TransactionService;

  let userId: string;
  let otherUserId: string;
  /** 用户自己的默认账本（母本） */
  let defaultAccountId: string;
  /** 用户自己的非默认账本 —— 功能性测试用 */
  let mainAccountId: string;
  /** 另一个用户的默认账本 */
  let otherMainAccountId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    app = await createApp(process.cwd());
    const ctx = app.getApplicationContext();
    categoryService = await ctx.getAsync(CategoryService);
    authService = await ctx.getAsync(AuthService);
    accountService = await ctx.getAsync(AccountService);
    transactionService = await ctx.getAsync(TransactionService);

    const me = await authService.register({
      username: randomUsername('cat'),
      password: '123456',
    });
    const other = await authService.register({
      username: randomUsername('cat2'),
      password: '123456',
    });
    userId = me.user.id;
    otherUserId = other.user.id;
    createdUserIds.push(userId, otherUserId);

    // 注册时自动建默认账本；这里再各建一个非默认账本供功能性测试
    const mine = await accountService.list(userId);
    defaultAccountId = mine.find((a) => a.isDefault)!.id;
    mainAccountId = (await accountService.create(userId, { name: '测试账本' })).id;

    const others = await accountService.list(otherUserId);
    otherMainAccountId = (await accountService.create(otherUserId, { name: '他人测试账本' })).id;
    void others;
  });

  afterAll(async () => {
    await cleanupUsers(createdUserIds);
    await close(app);
    await closeTestDataSource();
  });

  describe('create', () => {
    it('创建成功：icon / sort 走默认值', async () => {
      const category = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '餐饮',
        type: 'expense',
      });
      expect(category.name).toBe('餐饮');
      expect(category.type).toBe('expense');
      expect(category.icon).toBe('');
      expect(category.sort).toBe(0);
      expect(category.userId).toBe(userId);
    });

    it('创建成功：自定义 icon / sort 生效', async () => {
      const category = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '交通',
        type: 'expense',
        icon: 'transport',
        sort: 5,
      });
      expect(category.icon).toBe('transport');
      expect(category.sort).toBe(5);
    });

    it('同一用户名下重名：抛 40902', async () => {
      await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '购物',
        type: 'expense',
      });
      await expectBusinessError(
        () =>
          categoryService.create(userId, {
            accountId: mainAccountId,
            name: '购物',
            type: 'expense',
          }),
        ErrorCode.CATEGORY_NAME_EXISTS,
      );
    });

    it('不同用户可以用同名分类（唯一键是 user_id + name）', async () => {
      const mine = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '医疗',
        type: 'expense',
      });
      const others = await categoryService.create(otherUserId, {
        accountId: otherMainAccountId,
        name: '医疗',
        type: 'expense',
      });
      expect(mine.id).not.toBe(others.id);
      expect(others.userId).toBe(otherUserId);
    });
  });

  describe('list', () => {
    it('按 sort 升序、id 升序排列', async () => {
      await categoryService.create(userId, {
        accountId: mainAccountId,
        name: 'A零',
        type: 'income',
        sort: 1,
      });
      await categoryService.create(userId, {
        accountId: mainAccountId,
        name: 'B一',
        type: 'income',
        sort: 1,
      });
      await categoryService.create(userId, {
        accountId: mainAccountId,
        name: 'C二',
        type: 'income',
        sort: 0,
      });

      const list = await categoryService.list(userId, { accountId: mainAccountId });
      const income = list.filter((c) => c.type === 'income');
      const names = income.map((c) => c.name);

      // sort=0 的 C二 排最前，sort 相同的 A零/B一 按 id 升序
      expect(names.indexOf('C二')).toBeLessThan(names.indexOf('A零'));
      expect(names.indexOf('A零')).toBeLessThan(names.indexOf('B一'));
    });

    it('按 type 过滤', async () => {
      await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '工资收入',
        type: 'income',
      });
      const incomeList = await categoryService.list(userId, {
        accountId: mainAccountId,
        type: 'income',
      });
      expect(incomeList.length).toBeGreaterThan(0);
      expect(incomeList.every((c) => c.type === 'income')).toBe(true);
    });

    it('数据隔离：查不到其他用户的分类', async () => {
      const mine = await categoryService.list(userId, { accountId: mainAccountId });
      const others = await categoryService.list(otherUserId, { accountId: otherMainAccountId });
      const mineIds = new Set(mine.map((c) => c.id));
      expect(others.every((c) => !mineIds.has(c.id))).toBe(true);
    });
  });

  describe('findById', () => {
    it('分类不存在：抛 40401', async () => {
      await expectBusinessError(
        () => categoryService.findById(userId, mainAccountId, '999999999'),
        ErrorCode.CATEGORY_NOT_FOUND,
      );
    });

    it('其他用户的分类不可见：抛 40401', async () => {
      const others = await categoryService.create(otherUserId, {
        accountId: otherMainAccountId,
        name: '他人分类',
        type: 'expense',
      });
      await expectBusinessError(
        () => categoryService.findById(userId, mainAccountId, others.id),
        ErrorCode.CATEGORY_NOT_FOUND,
      );
    });
  });

  describe('update', () => {
    it('更新名称与排序', async () => {
      const category = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '待改名',
        type: 'expense',
      });
      const updated = await categoryService.update(userId, mainAccountId, category.id, {
        name: '已改名',
        sort: 20,
      });
      expect(updated.name).toBe('已改名');
      expect(updated.sort).toBe(20);
    });

    it('改名为已存在的名字：抛 40902', async () => {
      await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '甲',
        type: 'expense',
      });
      const target = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '乙',
        type: 'expense',
      });
      await expectBusinessError(
        () => categoryService.update(userId, mainAccountId, target.id, { name: '甲' }),
        ErrorCode.CATEGORY_NAME_EXISTS,
      );
    });

    it('更新不存在的分类：抛 40401', async () => {
      await expectBusinessError(
        () => categoryService.update(userId, mainAccountId, '999999999', { name: 'x' }),
        ErrorCode.CATEGORY_NOT_FOUND,
      );
    });
  });

  describe('delete', () => {
    it('删除成功：返回 success 且再查为 40401', async () => {
      const category = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '待删除',
        type: 'expense',
      });
      const result = await categoryService.delete(userId, mainAccountId, category.id);
      expect(result.success).toBe(true);

      await expectBusinessError(
        () => categoryService.findById(userId, mainAccountId, category.id),
        ErrorCode.CATEGORY_NOT_FOUND,
      );
    });

    it('删除不存在的分类：抛 40401', async () => {
      await expectBusinessError(
        () => categoryService.delete(userId, mainAccountId, '999999999'),
        ErrorCode.CATEGORY_NOT_FOUND,
      );
    });
  });

  describe('两级分类', () => {
    it('创建二级分类：parentId 正确落库', async () => {
      const parent = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '行车交通',
        type: 'expense',
      });
      const child = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '打车租车',
        type: 'expense',
        parentId: parent.id,
      });

      expect(String(child.parentId)).toBe(String(parent.id));
      expect(child.type).toBe('expense');
    });

    it('二级分类的收支类型必须与父一致：否则 40000', async () => {
      const parent = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '食品酒水',
        type: 'expense',
      });
      await expectBusinessError(
        () =>
          categoryService.create(userId, {
            accountId: mainAccountId,
            name: '错误的收入子类',
            type: 'income',
            parentId: parent.id,
          }),
        ErrorCode.PARAM_INVALID,
      );
    });

    it('最多两级：不能挂在二级分类下：抛 40000', async () => {
      const root = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '居家物业',
        type: 'expense',
      });
      const sub = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '水电煤气宽带',
        type: 'expense',
        parentId: root.id,
      });

      await expectBusinessError(
        () =>
          categoryService.create(userId, {
            accountId: mainAccountId,
            name: '三级分类不该存在',
            type: 'expense',
            parentId: sub.id,
          }),
        ErrorCode.PARAM_INVALID,
      );
    });

    it('父分类不存在：抛 40401', async () => {
      await expectBusinessError(
        () =>
          categoryService.create(userId, {
            accountId: mainAccountId,
            name: '孤儿分类',
            type: 'expense',
            parentId: '999999999',
          }),
        ErrorCode.CATEGORY_NOT_FOUND,
      );
    });

    it('list 传 parentId=root 只返回一级分类', async () => {
      const roots = await categoryService.list(userId, {
        accountId: mainAccountId,
        parentId: 'root',
      });
      expect(roots.length).toBeGreaterThan(0);
      expect(roots.every((c) => c.parentId === null)).toBe(true);
    });

    it('list 传具体 parentId 返回其下二级分类', async () => {
      const parent = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '休闲娱乐X',
        type: 'expense',
      });
      await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '运动健身X',
        type: 'expense',
        parentId: parent.id,
      });

      const children = await categoryService.list(userId, {
        accountId: mainAccountId,
        parentId: parent.id,
      });
      expect(children.length).toBe(1);
      expect(children[0].name).toBe('运动健身X');
      expect(String(children[0].parentId)).toBe(String(parent.id));
    });

    it('已有子分类的分类不能再挂到别的分类下：抛 40000', async () => {
      const target = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '电子产品',
        type: 'expense',
      });
      const other = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '医疗保健',
        type: 'expense',
      });
      await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '手机X',
        type: 'expense',
        parentId: target.id,
      });

      await expectBusinessError(
        () => categoryService.update(userId, mainAccountId, target.id, { parentId: other.id }),
        ErrorCode.PARAM_INVALID,
      );
    });

    it('删除一级分类：其下二级一并删除并报告数量', async () => {
      const parent = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '待删一级',
        type: 'expense',
      });
      await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '待删二级A',
        type: 'expense',
        parentId: parent.id,
      });
      await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '待删二级B',
        type: 'expense',
        parentId: parent.id,
      });

      const result = await categoryService.delete(userId, mainAccountId, parent.id);
      expect(result.success).toBe(true);
      expect(result.deletedChildren).toBe(2);

      const remaining = await categoryService.list(userId, {
        accountId: mainAccountId,
        parentId: parent.id,
      });
      expect(remaining.length).toBe(0);
    });

    it('把二级分类提升为一级：传空 parentId 即可', async () => {
      const parent = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '提升用父',
        type: 'expense',
      });
      const child = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '提升用子',
        type: 'expense',
        parentId: parent.id,
      });

      const promoted = await categoryService.update(userId, mainAccountId, child.id, {
        parentId: '',
      });
      expect(promoted.parentId).toBeNull();
    });
  });

  describe('list — visibility 过滤', () => {
    it('默认返回全部（含隐藏的）—— 分类管理页要能看到才能取消隐藏', async () => {
      const root = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '可见性一级',
        type: 'expense',
      });
      const child = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '可见性二级',
        type: 'expense',
        parentId: root.id,
      });
      await categoryService.batchHide(userId, mainAccountId, [child.id], true);

      const all = await categoryService.list(userId, { accountId: mainAccountId, type: 'expense' });
      expect(all.some((c) => c.id === child.id && c.isHidden)).toBe(true);

      const visible = await categoryService.list(userId, {
        accountId: mainAccountId,
        type: 'expense',
        visibility: 'visible',
      });
      expect(visible.some((c) => c.id === child.id)).toBe(false);
      expect(visible.some((c) => c.id === root.id)).toBe(true);
    });

    it('父隐藏 ⇒ 其下二级也不可见，但**不写子分类的 is_hidden**', async () => {
      const root = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '父隐藏一级',
        type: 'expense',
      });
      const a = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '父隐藏子A',
        type: 'expense',
        parentId: root.id,
      });
      const b = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '父隐藏子B',
        type: 'expense',
        parentId: root.id,
      });

      await categoryService.batchHide(userId, mainAccountId, [root.id], true);

      const visible = await categoryService.list(userId, {
        accountId: mainAccountId,
        type: 'expense',
        visibility: 'visible',
      });
      expect(visible.some((c) => c.id === root.id)).toBe(false);
      expect(visible.some((c) => c.id === a.id)).toBe(false);
      expect(visible.some((c) => c.id === b.id)).toBe(false);

      // 关键：子的 is_hidden 保持 false —— 取消隐藏父级时子级能自动回来，
      // 不需要回滚任何东西（若冗余写了，这里就会漏掉而留下脏数据）
      const all = await categoryService.list(userId, { accountId: mainAccountId, type: 'expense' });
      expect(all.find((c) => c.id === a.id)!.isHidden).toBe(false);
      expect(all.find((c) => c.id === b.id)!.isHidden).toBe(false);

      await categoryService.batchHide(userId, mainAccountId, [root.id], false);
      const back = await categoryService.list(userId, {
        accountId: mainAccountId,
        type: 'expense',
        visibility: 'visible',
      });
      expect(back.some((c) => c.id === a.id)).toBe(true);
      expect(back.some((c) => c.id === b.id)).toBe(true);
    });
  });

  describe('batchDelete', () => {
    it('父子同时选中：子分类不被重复计数', async () => {
      const root = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '批删一级',
        type: 'expense',
      });
      const c1 = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '批删子1',
        type: 'expense',
        parentId: root.id,
      });
      const c2 = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '批删子2',
        type: 'expense',
        parentId: root.id,
      });

      // 故意把 c1 重复传一次
      const res = await categoryService.batchDelete(userId, mainAccountId, [
        root.id,
        c1.id,
        c2.id,
        c1.id,
      ]);
      expect(res.deleted).toBe(3); // 一级 1 个 + 被级联的 2 个，而不是 4
      expect(res.deletedChildren).toBe(2);
    });

    it('重复 id 去重，不会重复删', async () => {
      const a = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '批删重复A',
        type: 'expense',
      });
      await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '批删重复子',
        type: 'expense',
        parentId: a.id,
      });
      const res = await categoryService.batchDelete(userId, mainAccountId, [a.id, a.id, a.id]);
      expect(res.deleted).toBe(2);
      expect(res.deletedChildren).toBe(1);
    });

    it('混入不存在的 id → 整单失败，且真实分类不被删（不静默少删）', async () => {
      const keep = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '批删保留',
        type: 'expense',
      });
      await expectBusinessError(
        () => categoryService.batchDelete(userId, mainAccountId, [keep.id, '999999999']),
        ErrorCode.CATEGORY_NOT_FOUND,
      );
      expect(await categoryService.findById(userId, mainAccountId, keep.id)).toBeTruthy();
    });

    it('不能删别人的分类', async () => {
      const mine = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '批删越权',
        type: 'expense',
      });
      await expectBusinessError(
        () => categoryService.batchDelete(otherUserId, otherMainAccountId, [mine.id]),
        ErrorCode.CATEGORY_NOT_FOUND,
      );
      expect(await categoryService.findById(userId, mainAccountId, mine.id)).toBeTruthy();
    });
  });

  describe('batchHide', () => {
    it('父子同时选中：只写一级，不冗余写子', async () => {
      const root = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '批隐一级',
        type: 'expense',
      });
      const child = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '批隐子',
        type: 'expense',
        parentId: root.id,
      });

      const res = await categoryService.batchHide(userId, mainAccountId, [root.id, child.id], true);
      expect(res.updated).toBe(1); // 父被选中 ⇒ 子不重复写
      expect(res.hidden).toBe(true);

      const all = await categoryService.list(userId, { accountId: mainAccountId, type: 'expense' });
      expect(all.find((c) => c.id === root.id)!.isHidden).toBe(true);
      expect(all.find((c) => c.id === child.id)!.isHidden).toBe(false);
    });

    it('单独隐藏二级是允许的（is_hidden 会被真实写入）', async () => {
      const root = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '批隐二级父',
        type: 'expense',
      });
      const child = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '批隐二级独',
        type: 'expense',
        parentId: root.id,
      });
      const res = await categoryService.batchHide(userId, mainAccountId, [child.id], true);
      expect(res.updated).toBe(1);
      const all = await categoryService.list(userId, { accountId: mainAccountId, type: 'expense' });
      expect(all.find((c) => c.id === child.id)!.isHidden).toBe(true);
    });

    it('混入不存在的 id → 整单失败', async () => {
      const c = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '批隐校验',
        type: 'expense',
      });
      await expectBusinessError(
        () => categoryService.batchHide(userId, mainAccountId, [c.id, '888888888'], true),
        ErrorCode.CATEGORY_NOT_FOUND,
      );
      const all = await categoryService.list(userId, { accountId: mainAccountId, type: 'expense' });
      expect(all.find((x) => x.id === c.id)!.isHidden).toBe(false);
    });
  });
  describe('账本级分类（2026-09-16 新增行为）', () => {
    it('跨账本隔离：账本 A 的分类在账本 B 查不到', async () => {
      const catA = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '账本A专属',
        type: 'expense',
      });
      await expectBusinessError(
        () => categoryService.findById(userId, defaultAccountId, catA.id),
        ErrorCode.CATEGORY_NOT_FOUND,
      );
      const found = await categoryService.findById(userId, mainAccountId, catA.id);
      expect(found.id).toBe(catA.id);
    });

    it('D16：默认账本（母本）的分类不允许删除 → 40006', async () => {
      // 注册时默认账本没有分类（分类由 seed 或前端导入生成），先建一个
      const target = await categoryService.create(userId, {
        accountId: defaultAccountId,
        name: '母本分类',
        type: 'expense',
      });
      await expectBusinessError(
        () => categoryService.delete(userId, defaultAccountId, target.id),
        ErrorCode.CATEGORY_DEFAULT_PROTECTED,
      );
      await expectBusinessError(
        () => categoryService.batchDelete(userId, defaultAccountId, [target.id]),
        ErrorCode.CATEGORY_DEFAULT_PROTECTED,
      );
      expect(await categoryService.findById(userId, defaultAccountId, target.id)).toBeTruthy();
    });

    it('D10：分类下有交易时禁止移除 → 40004', async () => {
      const cat = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '有交易的分类',
        type: 'expense',
      });
      await transactionService.create(userId, {
        accountId: mainAccountId,
        type: 'expense',
        amount: '10.00',
        recordDate: '2026-09-16',
        categoryId: cat.id,
      });
      await expectBusinessError(
        () => categoryService.delete(userId, mainAccountId, cat.id),
        ErrorCode.CATEGORY_HAS_TRANSACTIONS,
      );
      expect(await categoryService.findById(userId, mainAccountId, cat.id)).toBeTruthy();
    });

    it('D10：一级分类下有交易的子分类，删一级也被拒 → 40004', async () => {
      const parent = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '有交易子类的父',
        type: 'expense',
      });
      const child = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '带交易的子',
        type: 'expense',
        parentId: parent.id,
      });
      await transactionService.create(userId, {
        accountId: mainAccountId,
        type: 'expense',
        amount: '20.00',
        recordDate: '2026-09-16',
        categoryId: child.id,
      });
      await expectBusinessError(
        () => categoryService.delete(userId, mainAccountId, parent.id),
        ErrorCode.CATEGORY_HAS_TRANSACTIONS,
      );
    });

    it('D10 反向：无交易的分类可以正常删除', async () => {
      const cat = await categoryService.create(userId, {
        accountId: mainAccountId,
        name: '无交易可删',
        type: 'expense',
      });
      const res = await categoryService.delete(userId, mainAccountId, cat.id);
      expect(res.success).toBe(true);
    });

    it('D15：不同账本可以有同名分类', async () => {
      const name = '跨账本同名';
      const a = await categoryService.create(userId, {
        accountId: mainAccountId,
        name,
        type: 'expense',
      });
      const b = await categoryService.create(userId, {
        accountId: defaultAccountId,
        name,
        type: 'expense',
      });
      expect(a.id).not.toBe(b.id);
    });

    it('D15：同一账本内同名仍然拒绝 → 40902', async () => {
      const name = '账本内重名';
      await categoryService.create(userId, { accountId: mainAccountId, name, type: 'expense' });
      await expectBusinessError(
        () => categoryService.create(userId, { accountId: mainAccountId, name, type: 'expense' }),
        ErrorCode.CATEGORY_NAME_EXISTS,
      );
    });

    it('accountId 缺失 → 40000', async () => {
      await expectBusinessError(
        () => categoryService.list(userId, {} as never),
        ErrorCode.PARAM_INVALID,
      );
    });

    it('不存在的账本 → 40403', async () => {
      await expectBusinessError(
        () => categoryService.list(userId, { accountId: '999999999' }),
        ErrorCode.ACCOUNT_NOT_FOUND,
      );
    });
  });
});
