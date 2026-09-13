import { createApp, close } from '@midwayjs/mock';
import { IMidwayApplication } from '@midwayjs/core';
import { CategoryService } from '../src/category/category.service';
import { AuthService } from '../src/auth/auth.service';
import { ErrorCode } from '../src/common/error-code';
import { cleanupUsers, closeTestDataSource, expectBusinessError, randomUsername } from './helper';

describe('CategoryService', () => {
  let app: IMidwayApplication;
  let categoryService: CategoryService;
  let authService: AuthService;

  let userId: string;
  let otherUserId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    app = await createApp(process.cwd());
    const ctx = app.getApplicationContext();
    categoryService = await ctx.getAsync(CategoryService);
    authService = await ctx.getAsync(AuthService);

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
  });

  afterAll(async () => {
    await cleanupUsers(createdUserIds);
    await close(app);
    await closeTestDataSource();
  });

  describe('create', () => {
    it('创建成功：icon / sort 走默认值', async () => {
      const category = await categoryService.create(userId, {
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
        name: '交通',
        type: 'expense',
        icon: 'transport',
        sort: 5,
      });
      expect(category.icon).toBe('transport');
      expect(category.sort).toBe(5);
    });

    it('同一用户名下重名：抛 40902', async () => {
      await categoryService.create(userId, { name: '购物', type: 'expense' });
      await expectBusinessError(
        () => categoryService.create(userId, { name: '购物', type: 'expense' }),
        ErrorCode.CATEGORY_NAME_EXISTS,
      );
    });

    it('不同用户可以用同名分类（唯一键是 user_id + name）', async () => {
      const mine = await categoryService.create(userId, {
        name: '医疗',
        type: 'expense',
      });
      const others = await categoryService.create(otherUserId, {
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
        name: 'A零',
        type: 'income',
        sort: 1,
      });
      await categoryService.create(userId, {
        name: 'B一',
        type: 'income',
        sort: 1,
      });
      await categoryService.create(userId, {
        name: 'C二',
        type: 'income',
        sort: 0,
      });

      const list = await categoryService.list(userId, {});
      const income = list.filter((c) => c.type === 'income');
      const names = income.map((c) => c.name);

      // sort=0 的 C二 排最前，sort 相同的 A零/B一 按 id 升序
      expect(names.indexOf('C二')).toBeLessThan(names.indexOf('A零'));
      expect(names.indexOf('A零')).toBeLessThan(names.indexOf('B一'));
    });

    it('按 type 过滤', async () => {
      await categoryService.create(userId, {
        name: '工资收入',
        type: 'income',
      });
      const incomeList = await categoryService.list(userId, {
        type: 'income',
      });
      expect(incomeList.length).toBeGreaterThan(0);
      expect(incomeList.every((c) => c.type === 'income')).toBe(true);
    });

    it('数据隔离：查不到其他用户的分类', async () => {
      const mine = await categoryService.list(userId, {});
      const others = await categoryService.list(otherUserId, {});
      const mineIds = new Set(mine.map((c) => c.id));
      expect(others.every((c) => !mineIds.has(c.id))).toBe(true);
    });
  });

  describe('findById', () => {
    it('分类不存在：抛 40401', async () => {
      await expectBusinessError(
        () => categoryService.findById(userId, '999999999'),
        ErrorCode.CATEGORY_NOT_FOUND,
      );
    });

    it('其他用户的分类不可见：抛 40401', async () => {
      const others = await categoryService.create(otherUserId, {
        name: '他人分类',
        type: 'expense',
      });
      await expectBusinessError(
        () => categoryService.findById(userId, others.id),
        ErrorCode.CATEGORY_NOT_FOUND,
      );
    });
  });

  describe('update', () => {
    it('更新名称与排序', async () => {
      const category = await categoryService.create(userId, {
        name: '待改名',
        type: 'expense',
      });
      const updated = await categoryService.update(userId, category.id, {
        name: '已改名',
        sort: 20,
      });
      expect(updated.name).toBe('已改名');
      expect(updated.sort).toBe(20);
    });

    it('改名为已存在的名字：抛 40902', async () => {
      await categoryService.create(userId, { name: '甲', type: 'expense' });
      const target = await categoryService.create(userId, {
        name: '乙',
        type: 'expense',
      });
      await expectBusinessError(
        () => categoryService.update(userId, target.id, { name: '甲' }),
        ErrorCode.CATEGORY_NAME_EXISTS,
      );
    });

    it('更新不存在的分类：抛 40401', async () => {
      await expectBusinessError(
        () => categoryService.update(userId, '999999999', { name: 'x' }),
        ErrorCode.CATEGORY_NOT_FOUND,
      );
    });
  });

  describe('delete', () => {
    it('删除成功：返回 success 且再查为 40401', async () => {
      const category = await categoryService.create(userId, {
        name: '待删除',
        type: 'expense',
      });
      const result = await categoryService.delete(userId, category.id);
      expect(result.success).toBe(true);

      await expectBusinessError(
        () => categoryService.findById(userId, category.id),
        ErrorCode.CATEGORY_NOT_FOUND,
      );
    });

    it('删除不存在的分类：抛 40401', async () => {
      await expectBusinessError(
        () => categoryService.delete(userId, '999999999'),
        ErrorCode.CATEGORY_NOT_FOUND,
      );
    });
  });

  describe('两级分类', () => {
    it('创建二级分类：parentId 正确落库', async () => {
      const parent = await categoryService.create(userId, {
        name: '行车交通',
        type: 'expense',
      });
      const child = await categoryService.create(userId, {
        name: '打车租车',
        type: 'expense',
        parentId: parent.id,
      });

      expect(String(child.parentId)).toBe(String(parent.id));
      expect(child.type).toBe('expense');
    });

    it('二级分类的收支类型必须与父一致：否则 40000', async () => {
      const parent = await categoryService.create(userId, {
        name: '食品酒水',
        type: 'expense',
      });
      await expectBusinessError(
        () =>
          categoryService.create(userId, {
            name: '错误的收入子类',
            type: 'income',
            parentId: parent.id,
          }),
        ErrorCode.PARAM_INVALID,
      );
    });

    it('最多两级：不能挂在二级分类下：抛 40000', async () => {
      const root = await categoryService.create(userId, {
        name: '居家物业',
        type: 'expense',
      });
      const sub = await categoryService.create(userId, {
        name: '水电煤气宽带',
        type: 'expense',
        parentId: root.id,
      });

      await expectBusinessError(
        () =>
          categoryService.create(userId, {
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
            name: '孤儿分类',
            type: 'expense',
            parentId: '999999999',
          }),
        ErrorCode.CATEGORY_NOT_FOUND,
      );
    });

    it('list 传 parentId=root 只返回一级分类', async () => {
      const roots = await categoryService.list(userId, { parentId: 'root' });
      expect(roots.length).toBeGreaterThan(0);
      expect(roots.every((c) => c.parentId === null)).toBe(true);
    });

    it('list 传具体 parentId 返回其下二级分类', async () => {
      const parent = await categoryService.create(userId, {
        name: '休闲娱乐X',
        type: 'expense',
      });
      await categoryService.create(userId, {
        name: '运动健身X',
        type: 'expense',
        parentId: parent.id,
      });

      const children = await categoryService.list(userId, { parentId: parent.id });
      expect(children.length).toBe(1);
      expect(children[0].name).toBe('运动健身X');
      expect(String(children[0].parentId)).toBe(String(parent.id));
    });

    it('已有子分类的分类不能再挂到别的分类下：抛 40000', async () => {
      const target = await categoryService.create(userId, {
        name: '电子产品',
        type: 'expense',
      });
      const other = await categoryService.create(userId, {
        name: '医疗保健',
        type: 'expense',
      });
      await categoryService.create(userId, {
        name: '手机X',
        type: 'expense',
        parentId: target.id,
      });

      await expectBusinessError(
        () => categoryService.update(userId, target.id, { parentId: other.id }),
        ErrorCode.PARAM_INVALID,
      );
    });

    it('删除一级分类：其下二级一并删除并报告数量', async () => {
      const parent = await categoryService.create(userId, {
        name: '待删一级',
        type: 'expense',
      });
      await categoryService.create(userId, {
        name: '待删二级A',
        type: 'expense',
        parentId: parent.id,
      });
      await categoryService.create(userId, {
        name: '待删二级B',
        type: 'expense',
        parentId: parent.id,
      });

      const result = await categoryService.delete(userId, parent.id);
      expect(result.success).toBe(true);
      expect(result.deletedChildren).toBe(2);

      const remaining = await categoryService.list(userId, { parentId: parent.id });
      expect(remaining.length).toBe(0);
    });

    it('把二级分类提升为一级：传空 parentId 即可', async () => {
      const parent = await categoryService.create(userId, {
        name: '提升用父',
        type: 'expense',
      });
      const child = await categoryService.create(userId, {
        name: '提升用子',
        type: 'expense',
        parentId: parent.id,
      });

      const promoted = await categoryService.update(userId, child.id, { parentId: '' });
      expect(promoted.parentId).toBeNull();
    });
  });

  describe('list — visibility 过滤', () => {
    it('默认返回全部（含隐藏的）—— 分类管理页要能看到才能取消隐藏', async () => {
      const root = await categoryService.create(userId, { name: '可见性一级', type: 'expense' });
      const child = await categoryService.create(userId, {
        name: '可见性二级',
        type: 'expense',
        parentId: root.id,
      });
      await categoryService.batchHide(userId, [child.id], true);

      const all = await categoryService.list(userId, { type: 'expense' });
      expect(all.some((c) => c.id === child.id && c.isHidden)).toBe(true);

      const visible = await categoryService.list(userId, {
        type: 'expense',
        visibility: 'visible',
      });
      expect(visible.some((c) => c.id === child.id)).toBe(false);
      expect(visible.some((c) => c.id === root.id)).toBe(true);
    });

    it('父隐藏 ⇒ 其下二级也不可见，但**不写子分类的 is_hidden**', async () => {
      const root = await categoryService.create(userId, { name: '父隐藏一级', type: 'expense' });
      const a = await categoryService.create(userId, {
        name: '父隐藏子A',
        type: 'expense',
        parentId: root.id,
      });
      const b = await categoryService.create(userId, {
        name: '父隐藏子B',
        type: 'expense',
        parentId: root.id,
      });

      await categoryService.batchHide(userId, [root.id], true);

      const visible = await categoryService.list(userId, {
        type: 'expense',
        visibility: 'visible',
      });
      expect(visible.some((c) => c.id === root.id)).toBe(false);
      expect(visible.some((c) => c.id === a.id)).toBe(false);
      expect(visible.some((c) => c.id === b.id)).toBe(false);

      // 关键：子的 is_hidden 保持 false —— 取消隐藏父级时子级能自动回来，
      // 不需要回滚任何东西（若冗余写了，这里就会漏掉而留下脏数据）
      const all = await categoryService.list(userId, { type: 'expense' });
      expect(all.find((c) => c.id === a.id)!.isHidden).toBe(false);
      expect(all.find((c) => c.id === b.id)!.isHidden).toBe(false);

      await categoryService.batchHide(userId, [root.id], false);
      const back = await categoryService.list(userId, {
        type: 'expense',
        visibility: 'visible',
      });
      expect(back.some((c) => c.id === a.id)).toBe(true);
      expect(back.some((c) => c.id === b.id)).toBe(true);
    });
  });

  describe('batchDelete', () => {
    it('父子同时选中：子分类不被重复计数', async () => {
      const root = await categoryService.create(userId, { name: '批删一级', type: 'expense' });
      const c1 = await categoryService.create(userId, {
        name: '批删子1',
        type: 'expense',
        parentId: root.id,
      });
      const c2 = await categoryService.create(userId, {
        name: '批删子2',
        type: 'expense',
        parentId: root.id,
      });

      // 故意把 c1 重复传一次
      const res = await categoryService.batchDelete(userId, [root.id, c1.id, c2.id, c1.id]);
      expect(res.deleted).toBe(3); // 一级 1 个 + 被级联的 2 个，而不是 4
      expect(res.deletedChildren).toBe(2);
    });

    it('重复 id 去重，不会重复删', async () => {
      const a = await categoryService.create(userId, { name: '批删重复A', type: 'expense' });
      await categoryService.create(userId, {
        name: '批删重复子',
        type: 'expense',
        parentId: a.id,
      });
      const res = await categoryService.batchDelete(userId, [a.id, a.id, a.id]);
      expect(res.deleted).toBe(2);
      expect(res.deletedChildren).toBe(1);
    });

    it('混入不存在的 id → 整单失败，且真实分类不被删（不静默少删）', async () => {
      const keep = await categoryService.create(userId, { name: '批删保留', type: 'expense' });
      await expectBusinessError(
        () => categoryService.batchDelete(userId, [keep.id, '999999999']),
        ErrorCode.CATEGORY_NOT_FOUND,
      );
      expect(await categoryService.findById(userId, keep.id)).toBeTruthy();
    });

    it('不能删别人的分类', async () => {
      const mine = await categoryService.create(userId, { name: '批删越权', type: 'expense' });
      await expectBusinessError(
        () => categoryService.batchDelete(otherUserId, [mine.id]),
        ErrorCode.CATEGORY_NOT_FOUND,
      );
      expect(await categoryService.findById(userId, mine.id)).toBeTruthy();
    });
  });

  describe('batchHide', () => {
    it('父子同时选中：只写一级，不冗余写子', async () => {
      const root = await categoryService.create(userId, { name: '批隐一级', type: 'expense' });
      const child = await categoryService.create(userId, {
        name: '批隐子',
        type: 'expense',
        parentId: root.id,
      });

      const res = await categoryService.batchHide(userId, [root.id, child.id], true);
      expect(res.updated).toBe(1); // 父被选中 ⇒ 子不重复写
      expect(res.hidden).toBe(true);

      const all = await categoryService.list(userId, { type: 'expense' });
      expect(all.find((c) => c.id === root.id)!.isHidden).toBe(true);
      expect(all.find((c) => c.id === child.id)!.isHidden).toBe(false);
    });

    it('单独隐藏二级是允许的（is_hidden 会被真实写入）', async () => {
      const root = await categoryService.create(userId, { name: '批隐二级父', type: 'expense' });
      const child = await categoryService.create(userId, {
        name: '批隐二级独',
        type: 'expense',
        parentId: root.id,
      });
      const res = await categoryService.batchHide(userId, [child.id], true);
      expect(res.updated).toBe(1);
      const all = await categoryService.list(userId, { type: 'expense' });
      expect(all.find((c) => c.id === child.id)!.isHidden).toBe(true);
    });

    it('混入不存在的 id → 整单失败', async () => {
      const c = await categoryService.create(userId, { name: '批隐校验', type: 'expense' });
      await expectBusinessError(
        () => categoryService.batchHide(userId, [c.id, '888888888'], true),
        ErrorCode.CATEGORY_NOT_FOUND,
      );
      const all = await categoryService.list(userId, { type: 'expense' });
      expect(all.find((x) => x.id === c.id)!.isHidden).toBe(false);
    });
  });
});
