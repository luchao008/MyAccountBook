/**
 * 传输层失败的重试策略（2026-10-03）
 *
 * ## 为什么需要它
 *
 * 手机在电梯里、地铁进隧道、Wi‑Fi 切 4G 的瞬间，一次 GET 会直接失败。
 * 用户看到的是"网络异常，请稍后重试"，但其实**半秒后再发一次就好了**。
 * 这里做的就是把这一次"其实可以自己救回来"的失败救回来。
 *
 * ## 为什么判据不只看 HTTP 状态码
 *
 * luch-request 的所有失败（含超时、断网）都从 adapter 的 `complete`
 * 汇聚到 `settle()`，而 `settle()` 只看 `response.statusCode`：
 *
 * ```js
 * if (status && (!validateStatus || validateStatus(status))) resolve(response)
 * else reject(response)
 * ```
 *
 * 于是"传输层失败"的特征就是 **`statusCode` 为空**。但仅凭这一点不够——
 * 业务失败（HTTP 200 但 `code !== 0`）在响应拦截器的**成功分支**里被 reject，
 * 它同样没有 `statusCode`。所以必须结合 `errMsg` 一起判断。
 *
 * ## H5 上失败对象的真实形状（读 `@dcloudio/uni-h5` 源码得到，非推测）
 *
 * uni-h5 的 `uni.request` 在失败时走 `invokeFail()`，产出 `{ errMsg }`：
 *
 * | 场景 | errMsg |
 * |---|---|
 * | 断网 / DNS 失败 / 连接被拒（`xhr.onerror`）| `request:fail` |
 * | 超时（内部 `setTimeout` 到时后 `abort()`）| `request:fail timeout` |
 * | 请求被中断（`xhr.onabort`）| `request:fail abort` |
 *
 * ⚠️ 这三种**都没有 `statusCode`**，且 `errCode` 被 `invokeFail` 显式 `delete` 掉。
 * 也就是说：**光看 `statusCode` 无法区分「超时」与「断网」**，必须读 `errMsg`。
 *
 * ## 为什么超时不重试
 *
 * 本项目的 `timeout` 是 10s。超时意味着用户**已经干等了 10 秒**，
 * 此时再重试 2 次就是 30 秒才给出反馈 —— 那比直接报错更糟。
 * 重试预算应该留给**瞬时失败**（断网、连接被拒、连接重置）：
 * 这类失败几乎立即返回，重试的额外等待成本很小（几百毫秒的退避），
 * 却能把一次"网络异常"的提示变成一次成功。
 */

/** 最多尝试次数（含首次）。3 = 首次 + 2 次重试。 */
export const MAX_ATTEMPTS = 3;

/**
 * 第 n 次失败后等待多久再重试（下标 = attempt - 1）。
 *
 * 退避而不是立刻重发：网络刚断的瞬间立刻重发大概率还是失败，
 * 稍微等一等能让"切基站 / 重连 Wi‑Fi"这类切换有时间完成。
 * 总等待 1.2s 是可接受的（用户仍会觉得"只是稍微慢了一下"）。
 */
export const RETRY_BACKOFF_MS = [300, 900];

/** 第 n 次失败后应等待的毫秒数。超出表长则沿用最后一档。 */
export function retryDelayFor(attempt: number): number {
  const i = Math.max(0, Math.floor(Number(attempt) || 1) - 1);
  return RETRY_BACKOFF_MS[Math.min(i, RETRY_BACKOFF_MS.length - 1)];
}

/** 等待 `ms` 毫秒。 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 这次失败**是不是**「值得重试的传输层失败」——只看失败的性质，不看次数。
 *
 * 判定顺序即优先级，任何一条不满足就立刻返回 false：
 *
 * 1. **拿到 HTTP 状态码的一律不重试。** `undefined` / `null` / `0` 视为"没拿到"，
 *    其余（4xx / 5xx / 甚至 2xx 业务失败）都说明服务端**已经明确回答了**：
 *    4xx 是请求本身的问题、5xx 是确定性错误、业务失败更是重试一百次也一样。
 *    ⚠️ 用 `if (statusCode)` 而不是 `=== undefined` 是有意的：H5 的失败对象
 *    没有该字段（`undefined`），而某些端可能给 `0`，两者都该放行。
 * 2. **必须确认是"请求失败"**（uni 的失败对象以 `request:fail` 开头），
 *    而不是别的异常（参数校验、代码抛出的错）—— 那些重试也没有意义。
 * 3. **超时不重试**（理由见文件头）。同时匹配 `timeout` 与 `timed_out`，
 *    因为部分端（如微信小程序）的文案是 `net::ERR_CONNECTION_TIMED_OUT`。
 * 4. **只重试幂等读（GET / HEAD）。** POST/PUT/DELETE 一旦在服务端已经生效，
 *    重试就会造成重复写入。本项目 `createTransaction` 虽然有 `clientId` 幂等键，
 *    但并非所有写接口都有 —— 与其逐个甄别，不如一律不重试（范围收窄优先）。
 */
export function isRetriableNetworkFailure(opts: {
  errMsg?: unknown;
  statusCode?: unknown;
  method?: unknown;
}): boolean {
  const { errMsg, statusCode, method } = opts;

  if (statusCode) return false;

  if (typeof errMsg !== 'string' || !errMsg.startsWith('request:fail')) return false;

  if (/timeout|timed_out/i.test(errMsg)) return false;

  const m = String(method || '').toUpperCase();
  return m === 'GET' || m === 'HEAD';
}

/**
 * 综合判据：这次失败**现在就该重试**吗（含次数上限）。
 *
 * `attempt` 是**已经尝试过的次数**（首次 = 1）。
 * 于是 `attempt >= maxAttempts` 表示"已经没有重试额度了"。
 */
export function shouldRetry(opts: {
  errMsg?: unknown;
  statusCode?: unknown;
  method?: unknown;
  /** 已尝试次数（首次为 1） */
  attempt?: unknown;
  maxAttempts?: number;
}): boolean {
  const attempt = Math.floor(Number(opts.attempt)) || 1;
  const maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS;
  if (attempt >= maxAttempts) return false;
  return isRetriableNetworkFailure(opts);
}
