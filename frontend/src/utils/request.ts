import Request from 'luch-request';
import { MAX_ATTEMPTS, retryDelayFor, shouldRetry, sleep } from './retry';

/**
 * 请求封装
 *
 * 关键点：
 *   1. 开发环境走 Vite 代理（vite.config.ts 配了 /api -> 后端），
 *      因为后端未配置 CORS。生产环境要换成真实域名。
 *   2. 响应会剥掉 { code, data, message } 外壳，业务代码直接拿 data，
 *      不用写 res.data.data。
 *   3. 401 / code=40100 时清 token 并跳登录页。
 *   4. 传输层失败（断网 / 连接被拒 / 连接重置）且方法是 GET / HEAD 时自动重试，
 *      超时与写接口不重试 —— 判据与理由见 `utils/retry.ts`（29 条单测钉着）。
 */
/**
 * baseURL 取值优先级：
 *   1. 环境变量 VITE_API_BASE_URL（把值写进 frontend/.env.production 即可，无需改代码）
 *   2. 开发环境走 Vite 代理 '/api'（见 vite.config.ts，绕开后端未配 CORS 的问题）
 *   3. 生产默认 '/api' —— 前后端同域部署（Nginx 把 /api 反代到后端），这也是推荐部署方式
 */
const ENV_BASE = (import.meta as any)?.env?.VITE_API_BASE_URL || '';
// 生产默认同域部署（Nginx 把 /api 反代到后端）；跨域时配 VITE_API_BASE_URL 即可
const BASE_URL = ENV_BASE || '/api';

const http = new Request({
  baseURL: BASE_URL,
  timeout: 10000,
  header: { 'Content-Type': 'application/json' },
});

// 请求拦截：注入 token
http.interceptors.request.use(
  (config) => {
    const token = uni.getStorageSync('token');
    if (token) {
      config.header = {
        ...config.header,
        Authorization: `Bearer ${token}`,
      };
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截：剥外壳 + 统一错误处理
http.interceptors.response.use(
  (response) => {
    const body = response.data as any;
    // 成功：只返回 data
    if (body && body.code === 0) {
      return body.data;
    }
    // 业务失败（HTTP 仍可能是 2xx 走不到这里，保险起见保留）
    if (body?.message) {
      uni.showToast({ title: body.message, icon: 'none' });
    }
    return Promise.reject(body);
  },
  async (error) => {
    const status = error?.statusCode;
    const body = error?.data;
    const config = error?.config;

    /*
     * 失败观测（2026-10-03 新增）。
     *
     * 失败有两种完全不同的来源，但界面上只会弹同一句"网络异常"：
     *   a) 服务端答了、但状态码非 2xx  → 有 `statusCode`，没有 `errMsg`
     *   b) 根本没连上（断网 / 超时）    → 有 `errMsg`，没有 `statusCode`
     * 不记下来，排查时看不出是哪一种，也无从判断重试逻辑"为什么动/为什么没动"。
     *
     * ⚠️ 用 `warn` 而非 `error`：`console.error` 会被 H5 的错误上报通道收走，
     *    而这些失败绝大多数是**预期内的网络抖动**，不该当程序异常上报。
     */
    console.warn('[http] 请求失败', {
      method: config?.method,
      url: config?.url,
      statusCode: status,
      errMsg: error?.errMsg,
    });

    /*
     * 传输层失败自动重试（2026-10-03 新增）。
     *
     * ⚠️ 为什么必须写在**响应拦截器的失败分支内部**，而不是包在 `http.get` 外面：
     *    luch-request 把整条请求链串成 `promise.then(fulfilled, rejected)`，
     *    失败分支就是链子的最后一环。若把重试放在外层包装，
     *    下面那段"弹 toast / 401 跳登录"会在**每一次失败**都跑 ——
     *    重试 3 次就弹 3 次 toast、跳 3 次登录页。
     *    写在这里并**提前 return**，才能保证只有"最终失败"才走到提示逻辑。
     *
     * ⚠️ 重试计数为什么放在 `config.custom`：
     *    luch-request 的 `mergeConfig()` **只保留白名单字段**
     *    （`baseURL` / `method` / `url` / `params` / `custom` / `header` + 少数几个），
     *    任何自定义字段都会被它丢掉 —— `custom` 是唯一的自由通道，
     *    也是官方给出的扩展位（所以这不算猴补丁）。
     *    重发时 `http.request(config)` 会再走一遍 mergeConfig，
     *    而 `custom` 是 `{ ...globals, ...local }` 合并，因此计数能活下来。
     *
     * 判据（哪些失败值得重试 / 为什么超时不重试 / 为什么写接口不重试）
     * 全部在 `utils/retry.ts`，那边有 29 条单测钉着，这里只负责接线。
     */
    const meta = (config?.custom || {}) as { __attempt?: number };
    const attempt = Math.floor(Number(meta.__attempt)) || 1;
    if (
      config &&
      shouldRetry({
        errMsg: error?.errMsg,
        statusCode: status,
        method: config.method,
        attempt,
      })
    ) {
      const next = attempt + 1;
      const wait = retryDelayFor(attempt);
      // 必须**新建** custom 对象：config.custom 可能与实例默认值共享引用
      config.custom = { ...meta, __attempt: next };
      console.warn(
        `[http] 传输层失败，${wait}ms 后第 ${next}/${MAX_ATTEMPTS} 次尝试：${config.method} ${config.url}`
      );
      await sleep(wait);
      return http.request(config);
    }

    // ↓↓↓ 以下只在"最终失败"时执行 —— 每次请求最多到这里一次 ↓↓↓

    // token 失效（40100）或未知 401：清登录态并跳登录页。
    // 注意：登录失败码 40101/40102/40103 的 HTTP 状态也是 401，
    // 但它们属于"本次操作失败"，应弹提示而非跳转，故按业务码判断。
    if (body?.code === 40100 || (status === 401 && !body?.code)) {
      uni.removeStorageSync('token');
      uni.removeStorageSync('userInfo');
      uni.reLaunch({ url: '/pages/login/index' });
      return Promise.reject(body || error);
    }

    // 422 参数校验失败：joi 的原始报错不适合给用户看
    const message =
      status === 422 ? '输入有误，请检查后重试' : body?.message || '网络异常，请稍后重试';
    uni.showToast({ title: message, icon: 'none' });
    return Promise.reject(body || error);
  }
);

export default http;
