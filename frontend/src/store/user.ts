import { defineStore } from 'pinia';
import { login as apiLogin, register as apiRegister } from '@/api/auth';

interface UserInfo {
  id: string;
  username: string;
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

    async register(username: string, password: string) {
      const res = await apiRegister({ username, password });
      this.setSession(res);
      return res;
    },

    setSession(res: { token: string; user: UserInfo }) {
      this.token = res.token;
      this.userInfo = res.user;
      uni.setStorageSync('token', res.token);
      uni.setStorageSync('userInfo', res.user);
    },

    logout() {
      this.token = '';
      this.userInfo = null;
      uni.removeStorageSync('token');
      uni.removeStorageSync('userInfo');
      uni.reLaunch({ url: '/pages/login/index' });
    },
  },
});
