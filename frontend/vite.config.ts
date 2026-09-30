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
  build: {
    /*
     * ⚠️ **压低 rollup 的并行文件操作数**（2026-09-30）。
     *
     * 症状：`npm run build:h5` 随机失败在某个 `.vue` 的 `<style lang="scss">` 上，
     *   报 `[vite:css] [sass] write EPIPE` —— 而且**每次崩的文件都不一样**
     *   （实测中过 `uni-swipe-action-item` / `icon-picker` / `CategoryPicker`）。
     *   排除过的原因：内存（64G / 80% 空闲）、fd 上限（1048575）、
     *   node 版本（22 与 24 都复现）、沙箱（关掉沙箱同样复现）、
     *   依赖变动（sass 1.104.0 自 09-19 未变）。
     *   剩下最合理的解释是 **vite 5.2.8 + sass 1.104 的 legacy API 在高并发
     *   scss 编译下写通道失败** —— 本文件与页面越加越多，压力只会更大。
     *
     * 默认是 20，这里降到 2：构建慢一点，但能稳定出包（部署打包要的是"能出"）。
     * 若将来升级 vite（≥5.4 可用 `scss.api: 'modern-compiler'`）或降 sass，可以撤掉。
     */
    rollupOptions: { maxParallelFileOps: 2 },
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
