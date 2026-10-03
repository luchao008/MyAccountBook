/**
 * 「最后写入者胜」守卫 —— 页面级异步加载防竞态。
 *
 * ── 它解决什么问题 ──────────────────────────────────────────────────
 * 同一处加载被连续触发两次时（快速切 Tab、连点 `▶`、连续改筛选条件、切粒度），
 * **先发的请求可能后返回**，于是旧结果盖掉新结果。
 *
 * 表现出来不是"慢"，是**错**：报表页会把旧时段的数据 `Object.assign` 回 `report`，
 * 而界面上的 `period` 已经是新的 —— 用户看到「8 月的标题 + 6 月的数字」，
 * 而且**不报任何错**。流水页则是列表与筛选条件不一致。
 *
 * ── 为什么单独抽一个文件（而不是三处各写一遍）────────────────────────
 * 这条规则要同时管四件事：
 *   ① 结果**只让最新一次**落地；
 *   ② 失败**只在最新时**上报（过期请求的失败弹 toast 会让人莫名其妙）；
 *   ③ `onSettled` **只在最新时**跑 —— 否则旧请求的 `finally` 会把
 *      新请求刚设上的 `loading` / `skeleton` 提前关掉；
 *   ④ 页面卸载后到期的响应不再触发任何 UI 副作用。
 * 三个调用点各写一遍 = **三倍漏掉其中一个的机会**。收口到一处，调用点只表达"要做什么"。
 * （本项目已有前科：改外键时只测了"清空"、没测"改成另一个值"，接口 200、响应体还是旧值，
 *   界面毫无察觉。同一处逻辑写两遍，就是同一类漏洞的两倍概率。）
 *
 * ── 与 store 层已有守卫的分工 ────────────────────────────────────────
 *   `store/account.ts` 的 `reqSeq`、`store/category.ts` 的迟到响应保护
 *   解决的是 **store 内部全局状态**的竞态；
 *   本文件解决的是 **页面级局部加载**的竞态。
 *   形状相同、作用域不同，**不要互相替代**。
 *
 * ── 它不是"取消请求" ────────────────────────────────────────────────
 * 请求照发、照收，只是过期的那份**结果被丢掉**。
 * 真省流量要走 `AbortController`（需改请求封装 + 各 API 签名 + 注意各端对 signal
 * 的支持差异）。本文件只做"结果过滤"，因为它零侵入、且在所有端行为一致。
 *
 * ⚠️ 本文件**不 import Vue / uni-app**，是纯闭包 + Promise —— 为了能直接被根目录
 *    jest 覆盖（与 `utils/amountExpr.ts` 同一路数）。
 */

export interface LatestHandlers<T> {
  /** 真正要跑的任务（通常是发请求） */
  task: () => Promise<T>;
  /** 任务成功**且仍是最后一次调用**时执行 */
  onSuccess: (data: T) => void;
  /** 任务失败**且仍是最后一次调用**时执行 */
  onError?: (err: unknown) => void;
  /**
   * 收尾 —— **只在最新一次时**执行。
   *
   * ⚠️ 用它的理由：调用点普遍要写 `loading.value = false; skeleton.value = false`。
   *    这一段若放进无条件 `finally`，一个过期的慢请求返回时会把**新请求**的加载态关掉，
   *    于是界面提前显示"加载完成"，数据却还没到。
   */
  onSettled?: () => void;
}

export interface LatestGuard {
  /**
   * 跑一个"最后一个胜"的异步任务。
   *
   * ⚠️ **本方法永不 reject**：调用点大多是 `void load()`（点火即忘），
   *    reject 会变成 unhandled rejection 而没人接。错误必须通过 `onError` 处理。
   *
   * ⚠️ 过期请求的**失败会被静默丢掉**（不打日志、不弹提示）。这是刻意的：
   *    既然结果已经作废，它的失败也不该惊动用户。若需要观测，
   *    在请求层统一埋日志，而不是在业务回调里各自打点。
   */
  run<T>(handlers: LatestHandlers<T>): Promise<void>;

  /** 领取本次调用的序号（`run` 之外的用法：需要自己控制 try/finally 时） */
  begin(): number;

  /** 给定的序号是否仍是最新一次 */
  isCurrent(token: number): boolean;

  /**
   * 让当前所有在飞的调用**全部作废**。
   *
   * 用在页面卸载（`onUnload`）—— 否则离开页面后到期的响应仍会跑 `onError`，
   * 弹出一个属于上一页的 toast。
   */
  invalidate(): void;
}

export function createLatest(): LatestGuard {
  /** 单调递增；"最新"= 等于它。只比大小关系、不做取模，不存在回绕问题 */
  let seq = 0;

  return {
    begin() {
      return ++seq;
    },

    isCurrent(token) {
      return token === seq;
    },

    invalidate() {
      // 只推进序号、不重置为 0：重置会让"正好拿到 0 的旧调用"重新变成合法
      seq++;
    },

    async run<T>({ task, onSuccess, onError, onSettled }: LatestHandlers<T>): Promise<void> {
      const token = ++seq;
      try {
        const data = await task();
        // 过期：结果整个丢掉，连 onSuccess 都不进
        if (token !== seq) return;
        onSuccess(data);
      } catch (err) {
        // 过期：失败也不该打扰用户（理由见接口注释）
        if (token !== seq) return;
        if (onError) onError(err);
      } finally {
        if (token === seq && onSettled) onSettled();
      }
    },
  };
}
