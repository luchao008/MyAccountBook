import { defineStore } from 'pinia';
import {
  login as apiLogin,
  register as apiRegister,
  type RegisterResult,
} from '@/api/auth';
import { useAccountStore } from '@/store/account';
import { useCategoryStore } from '@/store/category';

interface UserInfo {
  id: string;
  username: string;
}

/**
 * 丢掉「上一个会话」留下的业务缓存（账本 / 分类）。
 *
 * ⚠️ 为什么必须做（2026-10-01）：账本与分类两个 store 现在都带**缓存守卫**
 *    （`loaded` 为真就不再发请求，见 store/account.ts 与 store/category.ts）。
 *    在此之前它们每次都真发请求，所以"换了用户但缓存没清"这件事会**自愈** ——
 *    缓存化之后不会了：`setSession` 之后第一次 `load()` 会直接命中上一个用户的
 *    账本列表，账本选择页会显示别人的账本，`switchTo()` 甚至能在旧列表里命中、
 *    把旧 accountId 写进本地存储。
 *
 * 放在会话的**出入口**而不是各个页面：登出、登录、以及 401 后重新登录
 *   （utils/request.ts 的拦截器只清 token 与 storage，不走 `logout()`），
 *   最终都会经过 `setSession()` 或 `logout()`，这里收敛成一处就不会漏。
 */
function clearSessionCaches() {
  useAccountStore().reset();
  useCategoryStore().reset();
}

export const useUserStore = defineStore('user', {
  state: () => ({
    token: (uni.getStorageSync('token') || '') as string,
    userInfo: (uni.getStorageSync('userInfo') || null) as UserInfo | null,
  }),

  getters: {
    isLogin: (state): boolean => !!state.token,
    username: (state): string => state.userInfo?.username || '',
  },

  actions: {
    /** 登录并持久化 token（注册与登录返回结构一致，处理逻辑相同） */
    async login(username: string, password: string) {
      const res = await apiLogin({ username, password });
      this.setSession(res);
      return res;
    },

    /**
     * 注册（申请制）：仅提交申请，不签发 token、不写登录态。
     * 新用户处于 pending，需管理员在中台审批后才能登录。
     */
    async register(username: string, password: string): Promise<RegisterResult> {
      return apiRegister({ username, password });
    },

    setSession(res: { token: string; user: UserInfo }) {
      // 先清上一个会话的缓存，再落新会话（顺序反了会留下一个窗口期）
      clearSessionCaches();
      this.token = res.token;
      this.userInfo = res.user;
      uni.setStorageSync('token', res.token);
      uni.setStorageSync('userInfo', res.user);
    },

    logout() {
      clearSessionCaches();
      this.token = '';
      this.userInfo = null;
      uni.removeStorageSync('token');
      uni.removeStorageSync('userInfo');
      uni.reLaunch({ url: '/pages/login/index' });
    },
  },
});
