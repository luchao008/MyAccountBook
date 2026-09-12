import { defineStore } from 'pinia';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  type CategoryItem,
} from '@/api/category';

export const useCategoryStore = defineStore('category', {
  state: () => ({
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

    reset() {
      this.list = [];
      this.loaded = false;
    },
  },
});
