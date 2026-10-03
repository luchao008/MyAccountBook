/**
 * 传输层失败重试判据的单测（2026-10-03）
 *
 * 这份测试的重点**不是**"正常情况返回 true"，而是**边界与负向**：
 * 每一次"不重试"的决定都必须有样本钉住，否则判据会退化成"永远重试"
 * （那比不重试更糟：写接口会被重复提交、超时会变成 30 秒）。
 *
 * 样本里的 `errMsg` 文案取自 `@dcloudio/uni-h5` 的 `invokeFail()` 源码，
 * 不是编的 —— 详见 `frontend/src/utils/retry.ts` 文件头的表。
 */
import {
  MAX_ATTEMPTS,
  RETRY_BACKOFF_MS,
  isRetriableNetworkFailure,
  retryDelayFor,
  shouldRetry,
} from '../frontend/src/utils/retry';

/** H5 断网 / 连接被拒（xhr.onerror → reject(void 0)） */
const FAIL_NET = 'request:fail';
/** H5 超时（内部 setTimeout 到时后 abort） */
const FAIL_TIMEOUT = 'request:fail timeout';
/** H5 请求被中断 */
const FAIL_ABORT = 'request:fail abort';
/** 微信小程序端的连接超时文案 */
const FAIL_MP_TIMED_OUT = 'request:fail -118:net::ERR_CONNECTION_TIMED_OUT';

describe('isRetriableNetworkFailure —— 该重试的（正向）', () => {
  test('断网 / 连接被拒：无状态码 + request:fail ⇒ 重试', () => {
    expect(
      isRetriableNetworkFailure({ errMsg: FAIL_NET, statusCode: undefined, method: 'GET' }),
    ).toBe(true);
  });

  test('请求被中断 ⇒ 重试', () => {
    expect(
      isRetriableNetworkFailure({ errMsg: FAIL_ABORT, statusCode: undefined, method: 'GET' }),
    ).toBe(true);
  });

  test('HEAD 也是幂等读 ⇒ 重试', () => {
    expect(
      isRetriableNetworkFailure({ errMsg: FAIL_NET, statusCode: undefined, method: 'HEAD' }),
    ).toBe(true);
  });

  test('方法名大小写不敏感：小写 get ⇒ 重试', () => {
    expect(
      isRetriableNetworkFailure({ errMsg: FAIL_NET, statusCode: undefined, method: 'get' }),
    ).toBe(true);
  });

  test('状态码是 0（部分端网络失败的取值）视为"没拿到" ⇒ 重试', () => {
    expect(isRetriableNetworkFailure({ errMsg: FAIL_NET, statusCode: 0, method: 'GET' })).toBe(
      true,
    );
  });

  test('状态码是 null 视为"没拿到" ⇒ 重试', () => {
    expect(isRetriableNetworkFailure({ errMsg: FAIL_NET, statusCode: null, method: 'GET' })).toBe(
      true,
    );
  });
});

describe('isRetriableNetworkFailure —— 不该重试的（负向，逐条钉住）', () => {
  test('HTTP 500：服务端已明确回答 ⇒ 不重试', () => {
    expect(isRetriableNetworkFailure({ errMsg: undefined, statusCode: 500, method: 'GET' })).toBe(
      false,
    );
  });

  test('HTTP 502 / 503 / 504 也不重试（本策略只覆盖传输层，见文件头）', () => {
    for (const code of [502, 503, 504]) {
      expect(isRetriableNetworkFailure({ statusCode: code, method: 'GET' })).toBe(false);
    }
  });

  test('HTTP 401：交给拦截器跳登录，不重试', () => {
    expect(isRetriableNetworkFailure({ statusCode: 401, method: 'GET' })).toBe(false);
  });

  test('HTTP 200 的业务失败（code!==0）：没有 errMsg，不重试', () => {
    expect(isRetriableNetworkFailure({ statusCode: 200, method: 'GET', errMsg: undefined })).toBe(
      false,
    );
  });

  test('超时：用户已等满 10s，再重试是负体验 ⇒ 不重试', () => {
    expect(
      isRetriableNetworkFailure({ errMsg: FAIL_TIMEOUT, statusCode: undefined, method: 'GET' }),
    ).toBe(false);
  });

  test('小程序的 ERR_CONNECTION_TIMED_OUT 同样按超时处理 ⇒ 不重试', () => {
    expect(
      isRetriableNetworkFailure({
        errMsg: FAIL_MP_TIMED_OUT,
        statusCode: undefined,
        method: 'GET',
      }),
    ).toBe(false);
  });

  test('POST：写接口重试会重复提交 ⇒ 不重试', () => {
    expect(
      isRetriableNetworkFailure({ errMsg: FAIL_NET, statusCode: undefined, method: 'POST' }),
    ).toBe(false);
  });

  test('PUT / DELETE：同上 ⇒ 不重试', () => {
    for (const m of ['PUT', 'DELETE']) {
      expect(
        isRetriableNetworkFailure({ errMsg: FAIL_NET, statusCode: undefined, method: m }),
      ).toBe(false);
    }
  });

  test('errMsg 不以 request:fail 开头（非请求失败）⇒ 不重试', () => {
    expect(
      isRetriableNetworkFailure({
        errMsg: 'some other error',
        statusCode: undefined,
        method: 'GET',
      }),
    ).toBe(false);
    // 只差一点点：把前缀写错（少了冒号）也该被拦住
    expect(
      isRetriableNetworkFailure({ errMsg: 'request fail', statusCode: undefined, method: 'GET' }),
    ).toBe(false);
  });

  test('errMsg 缺失或不是字符串 ⇒ 不重试（宁可漏重试，不可误重试）', () => {
    expect(isRetriableNetworkFailure({ statusCode: undefined, method: 'GET' })).toBe(false);
    expect(isRetriableNetworkFailure({ errMsg: null, statusCode: undefined, method: 'GET' })).toBe(
      false,
    );
    expect(
      isRetriableNetworkFailure({
        errMsg: { msg: FAIL_NET },
        statusCode: undefined,
        method: 'GET',
      }),
    ).toBe(false);
  });

  test('method 缺失 ⇒ 不重试（无法确认幂等）', () => {
    expect(isRetriableNetworkFailure({ errMsg: FAIL_NET, statusCode: undefined })).toBe(false);
  });
});

describe('shouldRetry —— 次数上限', () => {
  const base = { errMsg: FAIL_NET, statusCode: undefined, method: 'GET' } as const;

  test('首次失败（attempt=1）⇒ 重试', () => {
    expect(shouldRetry({ ...base, attempt: 1 })).toBe(true);
  });

  test('第二次失败（attempt=2）⇒ 还有额度，重试', () => {
    expect(shouldRetry({ ...base, attempt: 2 })).toBe(true);
  });

  test(`第三次失败（attempt=${MAX_ATTEMPTS}）⇒ 额度用尽，不重试`, () => {
    expect(shouldRetry({ ...base, attempt: 3 })).toBe(false);
  });

  test('attempt 缺失时按 1 处理（首轮调用方不传）', () => {
    expect(shouldRetry({ ...base })).toBe(true);
  });

  test('attempt 是脏值（非数字）时按 1 处理，不会因 NaN 变成"永远重试"', () => {
    expect(shouldRetry({ ...base, attempt: 'abc' })).toBe(true);
    // NaN 与 3 比较恒为 false ⇒ 会重试；这里断言的是"不会抛且按 1 走"
    expect(shouldRetry({ ...base, attempt: NaN, maxAttempts: 1 })).toBe(false);
  });

  test('次数用尽时不重试 —— 即使失败性质完全符合', () => {
    expect(shouldRetry({ ...base, attempt: 5, maxAttempts: 3 })).toBe(false);
  });

  test('天然不可重试的失败：次数没到也不重试（次数不是唯一门槛）', () => {
    expect(shouldRetry({ errMsg: FAIL_TIMEOUT, method: 'GET', attempt: 1 })).toBe(false);
    expect(shouldRetry({ errMsg: FAIL_NET, method: 'POST', attempt: 1 })).toBe(false);
    expect(shouldRetry({ errMsg: FAIL_NET, method: 'GET', statusCode: 500, attempt: 1 })).toBe(
      false,
    );
  });
});

describe('retryDelayFor —— 退避序列', () => {
  test('第 1 次失败后等 300ms，第 2 次后等 900ms', () => {
    expect(retryDelayFor(1)).toBe(300);
    expect(retryDelayFor(2)).toBe(900);
  });

  test('超出表长沿用最后一档，不会返回 undefined', () => {
    expect(retryDelayFor(3)).toBe(900);
    expect(retryDelayFor(99)).toBe(900);
  });

  test('脏值（0 / 负数 / 非数字）回落到第一档，不会返回 undefined', () => {
    expect(retryDelayFor(0)).toBe(300);
    expect(retryDelayFor(-3)).toBe(300);
    expect(retryDelayFor(NaN)).toBe(300);
  });
});

describe('常量契约', () => {
  test('MAX_ATTEMPTS = 3（首次 + 2 次重试），与退避表长度自洽', () => {
    expect(MAX_ATTEMPTS).toBe(3);
    // 退避表必须能覆盖到"最后一次重试之前"的所有等待次数：
    // attempt=1 等一次、attempt=2 等一次 ⇒ 表长应为 MAX_ATTEMPTS - 1
    expect(RETRY_BACKOFF_MS.length).toBe(MAX_ATTEMPTS - 1);
  });

  test('退避是递增的（不是固定间隔）', () => {
    for (let i = 1; i < RETRY_BACKOFF_MS.length; i++) {
      expect(RETRY_BACKOFF_MS[i]).toBeGreaterThan(RETRY_BACKOFF_MS[i - 1]);
    }
  });
});
