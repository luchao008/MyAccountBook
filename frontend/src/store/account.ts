import { defineStore } from 'pinia';
import { getAccounts, type AccountItem } from '@/api/account';

const CURRENT_KEY = 'currentAccountId';

/**
 * 账本 store
 *
 * 当前账本的切换方式（设计决策）：
 *   - 由**前端本地存储**记录 currentAccountId，不占后端字段。
 *     理由：切换是纯客户端偏好，后端不需要知道用户在哪个账本；
 *     代价是多端不同步（换设备会回落到默认账本），本项目 H5 单端为主，可接受。
 *   - 加载时校验：若本地记录的账本已不存在（被删/被合并走），
 *     自动回落到默认账本，避免出现"当前账本已被删除"的悬空状态。
 */
export const useAccountStore = defineStore('account', {
  state: () => ({
    list: [] as AccountItem[],
    currentId: (uni.getStorageSync(CURRENT_KEY) || '') as string,
    loaded: false,
  }),

  getters: {
    /** 当前账本对象；未加载时为 null */
    current: (state): AccountItem | null =>
      state.list.find((a) => a.id === state.currentId) || null,

    currentName: (state): string =>
      state.list.find((a) => a.id === state.currentId)?.name || '账本',

    defaultAccount: (state): AccountItem | null =>
      state.list.find((a) => a.isDefault) || null,

    count: (state): number => state.list.length,
  },

  actions: {
    /**
     * 加载账本列表，并保证 currentId 始终指向一个存在的账本。
     * 返回是否发生了「当前账本的自动回退」，调用方可据此决定要不要刷新业务数据。
     */
    async load(): Promise<{ changed: boolean }> {
      const list = await getAccounts();
      this.list = list;
      this.loaded = true;

      const prevId = this.currentId;
      const stillExists = list.some((a) => a.id === prevId);

      if (!stillExists) {
        // 回落到默认账本，没有默认标记就取第一个
        const fallback = list.find((a) => a.isDefault) || list[0];
        this.currentId = fallback ? fallback.id : '';
        if (this.currentId) {
          uni.setStorageSync(CURRENT_KEY, this.currentId);
        } else {
          uni.removeStorageSync(CURRENT_KEY);
        }
      }

      return { changed: this.currentId !== prevId };
    },

    /** 仅刷新列表，不动 currentId（合并/删除后调用） */
    async refresh() {
      this.list = await getAccounts();
    },

    /** 切换当前账本 */
    switchTo(id: string) {
      if (!this.list.some((a) => a.id === id)) return;
      this.currentId = id;
      uni.setStorageSync(CURRENT_KEY, id);
    },

    reset() {
      this.list = [];
      this.currentId = '';
      this.loaded = false;
      uni.removeStorageSync(CURRENT_KEY);
    },
  },
});
