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
    // 显式绑 IPv4 回环：默认的 "localhost" 在部分 Node 版本下只监听 [::1]，
    // 导致 127.0.0.1 打不通（浏览器会自动回落，但只探 IPv4 的工具/预览面板会连不上）。
    host: '127.0.0.1',
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
