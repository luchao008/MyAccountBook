import { defineStore } from 'pinia';
import { getAccounts, type AccountItem } from '@/api/account';

const CURRENT_KEY = 'currentAccountId';

/**
 * 正在飞行中的加载（**并发合并**用）。
 *
 * ⚠️ 刻意放在模块作用域、**不放进 `state`**：state 是响应式的，把 Promise 塞进去
 *    会被包成响应式代理，既没有意义又给 devtools 添乱。全应用只有一个 pinia 实例、
 *    store 也就是单例，模块变量在这里等价于实例字段，且 `reset()` 会显式清掉它。
 */
let inflight: Promise<{ changed: boolean }> | null = null;

/**
 * 已发出的请求序号（自增）。**只让最新一次请求的结果落地。**
 *
 * ⚠️ 为什么需要它：`load(true)` 绕过了 in-flight 合并（见 `load()`），于是可能出现
 *    「A：删除前的旧请求还在飞」+「B：删除后发出的 force 请求」同时存在。
 *    两个响应**到达顺序无法保证** —— 若 A 晚于 B 落地，`this.list` 会被旧列表覆盖，
 *    而 `doLoad` 里的「当前账本是否还存在」正是靠这个列表判断的，
 *    结果就是 currentId 停在已被删除的账本上、且不会回退（用户看到空数据）。
 *    用序号把"过期响应"整个丢掉，比赌到达顺序可靠。
 */
let reqSeq = 0;

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
     *
     * ⚠️ 2026-10-01 起本方法**带缓存与并发合并**，语义变化如下：
     *   · 已加载过（`loaded`）且未传 `force` 时**直接返回** `{ changed: false }`，
     *     **不再发请求**。此前每次调用都真发一次 `GET /accounts`，
     *     而全站有 19 个调用点，典型路径（首页 → 流水 → 记一笔 → 返回 → 首页）
     *     实测发 14 个请求、其中 **5 个是重复的 `/accounts`**（占 36%）。
     *   · 同一时刻的并发调用**共用同一个请求**（见模块顶部的 `inflight`）——
     *     各页面 onShow/onMounted 几乎同时触发的情况很常见。
     *   · 需要「一定拿最新」的调用点请显式传 `force = true`。
     *     **`force` 会绕过并发合并**（否则"删完账本后的回退校验"可能复用到删除前
     *     就已发出的那次响应，校验的是过期列表），并由请求序号保证只有最新结果落地。
     *     合并/删除账本后请继续用 `refresh()`（它不动 currentId，语义不同）。
     */
    async load(force = false): Promise<{ changed: boolean }> {
      // ① 已加载过就直接命中缓存（这是省掉绝大多数重复请求的那一道）
      if (this.loaded && !force) return { changed: false };

      /*
       * ② 并发合并。
       * ⚠️ `&& !force` 不能省：force 的语义是"必须是本次调用之后拿到的数据"，
       *    而正在飞的那一次可能是在某个 mutation **之前**发出的（典型场景：删账本
       *    后要重跑"当前账本是否还存在"的校验），搭上它就是拿过期数据做校验。
       */
      if (inflight && !force) return inflight;

      const p = this.doLoad(++reqSeq);
      inflight = p;
      try {
        return await p;
      } finally {
        // 只清掉自己那一次，避免把后来者的 pending 覆盖掉
        if (inflight === p) inflight = null;
      }
    },

    /**
     * 真正发请求并落库的那一段（由 `load()` 调用，不要直接调用）。
     * 单独拆出来是为了让「并发合并」只包住请求本身，而 `load()` 的守卫/箭头保持干净。
     *
     * `seq` 是本次请求的序号：落地前比对全局最新序号，**过期响应直接丢弃**
     * （理由见模块顶部 `reqSeq` 的注释）。
     */
    async doLoad(seq: number): Promise<{ changed: boolean }> {
      const list = await getAccounts();

      // 已经有更新的请求发出去了 → 本次结果过期，不写 state、也不做回退校验
      if (seq !== reqSeq) return { changed: false };

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
      // 登出/切账号时把在飞的那次也丢掉，避免下一个账号复用到上一个账号的结果；
      // 同时推进序号，让"登出前发出、登出后才回来"的响应落地前就被判定为过期
      inflight = null;
      reqSeq++;
      uni.removeStorageSync(CURRENT_KEY);
    },
  },
});
