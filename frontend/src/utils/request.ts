import Request from 'luch-request';

/**
 * 请求封装
 *
 * 关键点：
 *   1. 开发环境走 Vite 代理（vite.config.ts 配了 /api -> 后端），
 *      因为后端未配置 CORS。生产环境要换成真实域名。
 *   2. 响应会剥掉 { code, data, message } 外壳，业务代码直接拿 data，
 *      不用写 res.data.data。
 *   3. 401 / code=40100 时清 token 并跳登录页。
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
  (error) => {
    const status = error?.statusCode;
    const body = error?.data;

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
