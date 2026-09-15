import { defineConfig } from 'vite';
import { resolve } from 'path';
import uni from '@dcloudio/vite-plugin-uni';

// 后端地址：开发时用本机，可用环境变量覆盖
const BACKEND = process.env.VITE_BACKEND || 'http://127.0.0.1:7001';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    /*
     * 监听所有网卡（含局域网），便于**真机 / 同网段设备**访问开发服务。
     *
     * ⚠️ 为什么不是 `'localhost'` 也不是 `'127.0.0.1'`：
     *    - `'localhost'` 在部分 Node 版本下只监听 IPv6 回环 [::1]，导致 127.0.0.1 打不通；
     *    - `'127.0.0.1'` 只监听 IPv4 回环，**局域网设备连不上**。
     *    `'0.0.0.0'` 同时覆盖回环与所有网卡，两个问题一起解决。
     *    想只给自己用，把这里改回 `'127.0.0.1'` 即可。
     */
    host: '0.0.0.0',
    // 端口被占用时直接报错，避免静默换到 5174 让代理配置对不上
    strictPort: true,
    // 后端未配置 CORS，H5 开发时用代理绕过跨域。
    // 前端请求 /api 即可，不要写死后端地址（见 src/utils/request.ts）
    proxy: {
      '/api': {
        target: BACKEND,
        changeOrigin: true,
      },
    },
  },
});
