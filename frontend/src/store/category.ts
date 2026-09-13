import { defineStore } from 'pinia';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  batchDeleteCategories,
  batchHideCategories,
  type CategoryItem,
} from '@/api/category';

export const useCategoryStore = defineStore('category', {
  state: () => ({
    /**
     * **全量**分类（等价于接口的 `visibility=all`）。
     *
     * 刻意缓存全量而不是"可选分类"：分类管理页必须能看到被隐藏的分类，
     * 否则用户没有任何入口把它恢复显示（功能死锁）。
     * 「记账时能选哪些」是全量的一个**子集**，由下面的 selectable* getter 现算 ——
     * 存两份列表反而会带来"两份数据不同步"的新问题。
     */
    list: [] as CategoryItem[],
    loaded: false,
  }),

  getters: {
    /** 支出类一级分类 */
    expenseRoots: (state): CategoryItem[] =>
      state.list.filter((c) => c.type === 'expense' && !c.parentId),

    /** 收入类一级分类 */
    incomeRoots: (state): CategoryItem[] =>
      state.list.filter((c) => c.type === 'income' && !c.parentId),

    /** 取某个一级分类下的二级分类 */
    childrenOf: (state) => (parentId: string | null): CategoryItem[] =>
      parentId ? state.list.filter((c) => c.parentId === parentId) : [],

    byId: (state) => (id: string | null) =>
      state.list.find((c) => c.id === id) || null,

    /**
     * 可用于记账的一级分类（自身未隐藏）。
     *
     * ⚠️ 这条规则在后端也有一份（`GET /categories?visibility=visible`）。
     *   两处必须一致 —— `scripts/verify-category-batch.mjs` 断言后端那侧，
     *   页面级用例断言本侧，任何一处改了另一处没改都会被测试抓到。
     */
    selectableRoots: (state) => (type: 'income' | 'expense'): CategoryItem[] =>
      state.list.filter((c) => c.type === type && !c.parentId && !c.isHidden),

    /**
     * 某个一级分类下可用于记账的二级分类。
     *
     * **「父隐藏 ⇒ 子不可选」这条规则的落点就在这里** —— 父隐藏时整组返回空数组。
     * 之所以不在写 is_hidden 时冗余标记子分类：取消隐藏父级时就不需要回滚任何东西，
     * 不存在"漏回滚导致父可见、子却还隐藏着"的脏数据。
     */
    selectableChildrenOf: (state) => (parentId: string | null): CategoryItem[] => {
      if (!parentId) return [];
      const parent = state.list.find((c) => c.id === parentId);
      if (!parent || parent.isHidden) return [];
      return state.list.filter((c) => c.parentId === parentId && !c.isHidden);
    },

    /** 取某个分类的显示名：二级分类返回"一级 / 二级" */
    fullNameOf: (state) => (id: string | null): string => {
      if (!id) return '未分类';
      const self = state.list.find((c) => c.id === id);
      if (!self) return '未分类';
      if (!self.parentId) return self.name;
      const parent = state.list.find((c) => c.id === self.parentId);
      return parent ? `${parent.name} / ${self.name}` : self.name;
    },
  },

  actions: {
    async load(force = false) {
      if (this.loaded && !force) return;
      // 一次性拿全量（含 parentId），由 getters 组装层级
      this.list = await getCategories();
      this.loaded = true;
    },

    async add(data: {
      name: string;
      type: 'income' | 'expense';
      icon?: string;
      sort?: number;
      parentId?: string;
    }) {
      await createCategory(data);
      await this.load(true);
    },

    async update(
      id: string,
      data: Partial<{ name: string; type: 'income' | 'expense'; icon: string; sort: number }>
    ) {
      await updateCategory(id, data);
      await this.load(true);
    },

    async remove(id: string) {
      await deleteCategory(id);
      await this.load(true);
    },

    /**
     * 批量删除。
     *
     * 不做前端预去重、也不过滤"父已被选中"的子分类 —— 那套判断在后端，
     * 前端照原样把用户选中的 id 传过去即可（后端返回实际删除数供提示）。
     */
    async batchRemove(ids: string[]) {
      const res = await batchDeleteCategories(ids);
      await this.load(true);
      return res;
    },

    /** 批量隐藏（hidden=true）或恢复显示（hidden=false） */
    async batchHide(ids: string[], hidden: boolean) {
      const res = await batchHideCategories(ids, hidden);
      await this.load(true);
      return res;
    },

    reset() {
      this.list = [];
      this.loaded = false;
    },
  },
});
