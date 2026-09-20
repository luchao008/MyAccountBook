import { defineConfig } from '@vben/vite-config';

export default defineConfig(async () => {
  return {
    application: {},
    vite: {
      server: {
        proxy: {
          '/api': {
            changeOrigin: true,
            // 直连本地 Midway 后端（7001），保留 /api 前缀
            target: 'http://localhost:7001',
            ws: true,
          },
        },
      },
    },
  };
});
