import { defineStore } from 'pinia';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  batchDeleteCategories,
  batchHideCategories,
  reorderCategories,
  type CategoryItem,
} from '@/api/category';
import { useAccountStore } from '@/store/account';
import { getCategoryCandidates, importCategories } from '@/api/account';

/** 分类缓存的 storage key 前缀（按账本隔离：cache:<accountId>） */
const CACHE_PREFIX = 'categoryCache:';

/**
 * 正在飞行中的加载（**并发合并**用），按账本 id 区分。
 *
 * ⚠️ 为什么需要：`loaded` 守卫只挡得住"已经加载完之后"的重复调用，
 *    挡不住**同一时刻**的并发。实测确实存在这种并发：
 *    `HomeView.activate()` 里 `categoryStore.load()` 是"点火即忘"（没 await），
 *    用户立刻点进流水页，flow 挂载时 `loaded` 还是 false → 再发一次 `GET /categories`。
 *
 * ⚠️ 必须按 `accountId` 配对：切账本的瞬间可能有一次旧账本的请求在飞，
 *    新账本不能复用它（否则会把旧账本的分类铺到新账本上）。
 *
 * ⚠️ 放在模块作用域而不是 `state`：state 是响应式的，Promise 放进去没有意义
 *    （理由同 store/account.ts）。`reset()` 会清掉它。
 */
let inflight: { accountId: string; promise: Promise<void> } | null = null;

/**
 * 分类 store。
 *
 * ⚠️ **分类自 2026-09-16 起为账本级隔离**：每个账本有独立的一套分类。
 * 本 store 现在**绑定当前账本**（从 accountStore 取 currentId）：
 *   - 加载 / 增删改 都作用于当前账本
 *   - 切换账本时必须 reset + 重新 load（见 accountStore.switchTo 的联动）
 *
 * 对外 getter（expenseRoots / selectableRoots / byId …）保持原样，
 * 内部 list 已经是"当前账本的分类"，组件无需感知账本。
 */
export const useCategoryStore = defineStore('category', {
  state: () => ({
    /**
     * **当前账本**的全量分类（等价于接口的 `visibility=all`）。
     *
     * 刻意缓存全量而不是"可选分类"：分类管理页必须能看到被隐藏的分类，
     * 否则用户没有任何入口把它恢复显示（功能死锁）。
     */
    list: [] as CategoryItem[],
    /** 当前 list 对应的账本 id；与 accountStore.currentId 不一致时需要重载 */
    loadedAccountId: '' as string,
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

    /** 可用于记账的一级分类（自身未隐藏）。 */
    selectableRoots: (state) => (type: 'income' | 'expense'): CategoryItem[] =>
      state.list.filter((c) => c.type === type && !c.parentId && !c.isHidden),

    /** 某个一级分类下可用于记账的二级分类（父隐藏 ⇒ 返回空）。 */
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
    /** 当前账本 id（从 accountStore 取） */
    currentAccountId(): string {
      return useAccountStore().currentId;
    },

    /**
     * 加载当前账本的分类。
     * 若已加载的账本与当前账本不一致，会强制重新加载（切账本后无需手动 reset）。
     *
     * ⚠️ 2026-10-01 起**同一账本的并发调用会合并成一次请求**（见模块顶部的 `inflight`）。
     *    注意 `force` 只在"是否跳过缓存"这一步生效；一旦决定要发请求，
     *    后来的并发调用会直接搭上那一次，不会因为自己传了 force 就再发一个。
     */
    async load(force = false) {
      const accountId = this.currentAccountId();
      if (!accountId) {
        this.list = [];
        this.loaded = false;
        this.loadedAccountId = '';
        return;
      }
      if (this.loaded && !force && this.loadedAccountId === accountId) return;

      // 并发合并：同一账本已在飞 → 直接复用（先到的那个的 force 生效）
      if (inflight && inflight.accountId === accountId) return inflight.promise;

      const promise = this.doLoad(accountId);
      inflight = { accountId, promise };
      try {
        await promise;
      } finally {
        // 只清掉自己那一次，避免把后来者的 pending 覆盖掉
        if (inflight?.promise === promise) inflight = null;
      }
    },

    /**
     * 真正发请求 + 落缓存的那一段（由 `load()` 调用，不要直接调用）。
     * 拆出来是为了让"并发合并"只包住请求本身，并保住原有的离线兜底语义：
     * 请求失败时读上一次的缓存，且**把错误继续抛出去**（调用方靠它展示失败态）。
     */
    async doLoad(accountId: string) {
      try {
        const list = await getCategories(accountId);
        /*
         * ⚠️ 迟到响应保护（2026-10-01）：请求期间账本可能已经切走。
         *    `inflight` 只挡住"新账本复用旧请求"，挡不住"旧请求**晚于**新账本落地" ——
         *    那种情况下 store 里会变成账本 A 的分类、而 currentId 已是 B，
         *    用户切进 B 却看到 A 的分类（各消费点 `await load()` 后会自愈，
         *    但中间那一帧是错的，而且分类错了可能被当成 B 的分类继续用）。
         */
        if (this.currentAccountId() !== accountId) return;
        this.list = list;
        this.loaded = true;
        this.loadedAccountId = accountId;
        // 落盘缓存：离线记账时「记一笔」页需要能读到分类（否则选择器是空的）
        uni.setStorageSync(CACHE_PREFIX + accountId, this.list);
      } catch (err) {
        // 离线兜底：读上一次的缓存。没有缓存时保持空（调用方展示空选择器）
        const cached = uni.getStorageSync(CACHE_PREFIX + accountId);
        if (Array.isArray(cached) && cached.length) {
          // 同样要防迟到：这里写的是**旧账本**的缓存内容
          if (this.currentAccountId() !== accountId) throw err;
          this.list = cached;
          this.loaded = true;
          this.loadedAccountId = accountId;
        }
        throw err;
      }
    },

    /**
     * 确保当前账本有分类：**空账本**时静默从母本（默认账本）导入全部（设计 D18）。
     *
     * 场景：迁移后 57 个老的非默认账本分类为空；用户切进去记账时会看到空选择器。
     * 这里自动补齐，用户无感。母本自身不触发（它不会空）。
     */
    async ensureFromMother() {
      const accountId = this.currentAccountId();
      if (!accountId) return;
      await this.load();
      if (this.list.length > 0) return;

      const acc = useAccountStore().list.find((a) => a.id === accountId);
      if (!acc || acc.isDefault) return;

      const candidates = await getCategoryCandidates();
      if (!candidates.length) return;
      await importCategories(
        accountId,
        candidates.map((c) => c.id)
      );
      await this.load(true);
    },

    async add(data: {
      name: string;
      type: 'income' | 'expense';
      icon?: string;
      sort?: number;
      parentId?: string;
    }) {
      await createCategory({ accountId: this.currentAccountId(), ...data });
      await this.load(true);
    },

    async update(
      id: string,
      data: Partial<{ name: string; type: 'income' | 'expense'; icon: string; sort: number }>
    ) {
      await updateCategory(this.currentAccountId(), id, data);
      await this.load(true);
    },

    async remove(id: string) {
      await deleteCategory(this.currentAccountId(), id);
      await this.load(true);
    },

    async batchRemove(ids: string[]) {
      const res = await batchDeleteCategories(this.currentAccountId(), ids);
      await this.load(true);
      return res;
    },

    /** 批量隐藏（hidden=true）或恢复显示（hidden=false） */
    async batchHide(ids: string[], hidden: boolean) {
      const res = await batchHideCategories(this.currentAccountId(), ids, hidden);
      await this.load(true);
      return res;
    },

    /**
     * 拖动排序：把某一层级下的分类按 `ids` 顺序重排。
     *
     * ⚠️ **成功后强制 `load(true)` 重拉**，而不是本地改 `sort` 就完事：
     * 后端会把 `sort` 归一化成 `0..n-1`（可能与我们本地推断的值不同），
     * 本地推断一旦与服务端不一致，下次进页面顺序就会「跳」一下。
     * 重拉一次的成本是一次 GET，换来的是「屏幕上看到的顺序就是库里的顺序」。
     */
    async reorder(
      type: 'income' | 'expense',
      parentId: string | null,
      ids: string[]
    ): Promise<{ success: boolean; updated: number }> {
      const res = await reorderCategories(this.currentAccountId(), type, parentId, ids);
      await this.load(true);
      return res;
    },

    reset() {
      this.list = [];
      this.loaded = false;
      this.loadedAccountId = '';
      // 登出/切账号时把在飞的那次也丢掉，避免下一个账号复用到上一个账号的结果
      inflight = null;
    },
  },
});
