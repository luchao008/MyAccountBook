import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import uni from '@dcloudio/vite-plugin-uni';

// 后端地址：开发时用本机，可用环境变量覆盖
const BACKEND = process.env.VITE_BACKEND || 'http://127.0.0.1:7001';

/** 分类图标目录（94 组，每组一份 `.png` + 一份 `.webp`，共 188 个文件；见 src/constants/cat-icons.ts 头部） */
const CAT_ICON_DIR = resolve(__dirname, 'src/static/cat-icons');

/**
 * 算分类图标的**构建版本号**（8 位 hex），注入给全局常量 `__CAT_ICON_VERSION__`。
 *
 * 为什么要算：`src/static/cat-icons/` 下 94 组图标的**基名**是拼音、不带内容 hash
 *   （`wucan` 这种，每组同时存在 `wucan.png` 与 `wucan.webp`；H5 用 webp、
 *    小程序/App 用 png，见 `src/utils/catIcon.ts` 的 `catIconSrc()`）。部署侧即将给
 *   这个目录加**一年长缓存**，文件名又不会随内容变
 *   —— 结果就是"以后换了图标，老用户一年内永远看老图"。所以 URL 必须自带版本号：
 *   图标一变版本号就变，URL 就是新地址，长缓存自然失效（不需要刷 CDN）。
 *
 * 参与 hash 的内容（两者缺一不可）：
 *   1. **文件名** —— 重命名（内容不变）也算变更，缓存 key 跟着变；
 *   2. **文件内容** —— 同名图重画/重新导出后必须变，否则改了图版本号不动。
 * 先逐文件算 sha256，再把「文件名:摘要」拼成清单整体算一次。这样文件名与内容的
 * 边界是明确的，不会出现「文件名尾部 + 内容开头」互相顶替、两份不同目录撞同一个 hash 的歧义。
 *
 * 确定性（必须的：图标没变 → 每次构建版本号必须一样，否则每次发布都让老用户重下全部图标）：
 *   · 排序用默认的 `sort()`（按 UTF-16 码元序，等价字节序）。**不要用 `localeCompare`**
 *     —— 它受系统 locale 影响，不同机器/不同 CI 环境下顺序可能不同，hash 就不确定。
 *   · 只统计**普通文件**、且**跳过隐藏文件**：macOS 的 `.DS_Store` 会随 Finder 浏览而变化，
 *     让它参与 hash 会导致"同一份代码在我机器和他机器上算出的版本号不同"，白刷一遍缓存。
 *     增删任何一张真正的图标（`.png` / `.webp`）仍然会变 —— 这正是我们要的。
 *     注意 hash 覆盖的是目录下**全部**文件（94 PNG + 94 WebP = 188 个），
 *     所以两套资源任意一侧重新导出，版本号都会变 —— 这是对的：
 *     URL 一变，H5 与小程序/App 各自的缓存都会一起失效。
 *   · 目录不存在/读不了就**直接抛错**（不吞）：静默给个固定值会让人以为"版本号算过了"，
 *     实际是路径写错，配上一年的长缓存就是永远更新的脏图，越早崩越好。
 *
 * ⚠️ 时机：这里在 **vite.config.ts 加载时**算一次。改图标后要重启 dev server 才会更新
 *   （dev 下静态资源本来不长缓存，影响可忽略）；`build` 每次都会重新读。
 */
function catIconVersion(): string {
  const names = readdirSync(CAT_ICON_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();

  const hash = createHash('sha256');
  for (const name of names) {
    const contentHash = createHash('sha256')
      .update(readFileSync(resolve(CAT_ICON_DIR, name)))
      .digest('hex');
    hash.update(`${name}:${contentHash}\n`);
  }
  return hash.digest('hex').slice(0, 8);
}

const CAT_ICON_VERSION = catIconVersion();

/**
 * 「哪个端用哪套图标」的**唯一**声明处（改平台策略就改这里，连同 `src/utils/catIcon.ts`）。
 *
 * 两套产物像素完全一致，只是容器不同（来龙去脉见 `scripts/gen-cat-icons.mjs` 头部）：
 *   · H5  → **WebP**：体积只有 PNG 的 11.4%（94 张 1.884 MB → 0.215 MB，省 88.6%）；
 *   · 其它端（小程序 / App / 快应用…）→ **PNG**：无法离线确认这些端能否加载**包内 webp**
 *     （`<image>` 加载包内文件走各端原生实现、不是浏览器内核，不支持时只是安静地显示空白）。
 *
 * ⚠️ 这张表必须与 `src/utils/catIcon.ts` 里 `#ifdef H5` 的条件编译**保持一致**：
 *   前者决定"产物里留哪套"，后者决定"运行时请求哪套"。两边一旦不一致，
 *   就会出现"端上请求 `.png`、而产物里只有 `.webp`" → 图标整片空白（静默失败）。
 */
const ICON_FORMATS = {
  h5: { keep: 'webp', drop: 'png' },
  other: { keep: 'png', drop: 'webp' },
} as const;

/**
 * 构建产物裁剪：删掉「本端永远不会请求」的那套图标（2026-10-01）。
 *
 * ── 为什么需要 ──────────────────────────────────────────────────────
 * uni-app 把 `src/static/` **原样**拷进每个端的产物、不按端裁剪
 * （见 `@dcloudio/vite-plugin-uni/dist/plugins/copy.js`）。于是实测（H5 干净构建）：
 *   · 不裁剪整包 **4.50 MB**，裁剪后 **2.61 MB** —— 删掉的 1.88 MB 是永远不请求的 PNG（占 42%）；
 *   · 小程序包里则多出 94 个用不到的 WebP（0.21 MB）。
 * H5 用户**实际下载**的早已只有 WebP（URL 由 `catIconSrc()` 拼），但那堆 PNG 仍会
 * 进部署目录、进 CDN、进镜像，删掉是纯赚。
 *
 * ⚠️ 为什么不用 uni 自带的平台目录（`static/<platform>/`）代替这一步：
 *   copy.js 只认「**平台名**」目录（`static/h5/`、`static/mp-weixin/`…），
 *   而我们要按**格式**切分，且"除 H5 之外的全部"这一侧没法用一个平台名表达。
 *
 * ⚠️ 为什么挂在 `closeBundle`：`static` 的拷贝发生在 `uni:copy` 的 `writeBundle`
 *   （而且它会 await 文件监听器完成）。rollup 保证**所有** `writeBundle` 跑完才进
 *   `closeBundle`，所以那一刻文件必定已就位。若写进 `writeBundle`，就是和自己的拷贝赛跑。
 *
 * ⚠️ **只动产物，绝不动源目录**：`src/static/cat-icons/` 必须始终两套齐全 ——
 *   同一个源目录要供**所有**端的构建使用，删源文件等于毁掉另一端的构建。
 *
 * ⚠️ 安全阀：只删「**同名另一套确实存在**」的文件。若某张图只有被删的那一侧
 *   （生成器出问题、手工塞进来的），就**不删、只告警** —— 宁可留一个多余文件，
 *   也不能让某个图标凭空消失（`<image>` 会安静地显示空白，是本项目反复踩过的坑）。
 */
function pruneUnusedIconFormat(): Plugin {
  let iconDir = '';
  return {
    name: 'prune-unused-cat-icon-format',
    apply: 'build',
    configResolved(config) {
      iconDir = resolve(config.root, config.build.outDir, 'static/cat-icons');
    },
    closeBundle() {
      /* 平台判定与 vite-plugin-uni 自身一致：它也用 `process.env.UNI_PLATFORM || 'h5'` 兜底 */
      const platform = process.env.UNI_PLATFORM || 'h5';
      const { keep, drop } = platform === 'h5' ? ICON_FORMATS.h5 : ICON_FORMATS.other;

      if (!existsSync(iconDir)) {
        /*
         * 目录不存在有两种可能，**都值得吵**（静默跳过会让"优化没生效"没人知道）：
         *   ① 图标没生成 / 目录改了名 → 产物里压根没有图标；
         *   ② 本插件的时机早于 uni:copy → 裁剪失效。
         */
        console.warn(`[cat-icons] 产物里没有 ${iconDir}，跳过裁剪（图标没生成？还是拷贝时机变了？）`);
        return;
      }

      const files = readdirSync(iconDir);
      const orphans: string[] = [];
      let dropped = 0;
      let freed = 0;
      for (const name of files) {
        if (!name.endsWith(`.${drop}`)) continue;
        const base = name.slice(0, -(drop.length + 1));
        if (!files.includes(`${base}.${keep}`)) {
          orphans.push(name);
          continue;
        }
        freed += statSync(resolve(iconDir, name)).size;
        rmSync(resolve(iconDir, name));
        dropped++;
      }

      console.log(
        `[cat-icons] ${platform} 产物：删除 ${dropped} 个 .${drop}` +
          `（省 ${(freed / 1024 / 1024).toFixed(2)} MB），保留 .${keep}`
      );
      if (orphans.length) {
        console.warn(
          `[cat-icons] ${orphans.length} 个 .${drop} 找不到对应的 .${keep}，已保留未删` +
            `（不该出现，请检查 scripts/gen-cat-icons.mjs）：${orphans.slice(0, 3).join('、')}`
        );
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  /*
   * ⚠️ `pruneUnusedIconFormat()` 必须排在 `uni()` **之后**：插件钩子按数组顺序执行，
   *    而它依赖 uni:copy 已经把 `static/` 拷进产物（见上面的长注释）。
   */
  plugins: [uni(), pruneUnusedIconFormat()],
  define: {
    /*
     * 分类图标的版本号，构建期文本替换进代码（见上面 catIconVersion()）。
     *
     * ⚠️ 必须 `JSON.stringify` 包一层：`define` 是**原样文本替换**，不是赋值。
     *   不加引号会替换成裸的 `1a2b3c4d`，被当成数字/标识符 → 运行时报错或语义错。
     *
     * ⚠️ 引用点只有 `src/utils/catIcon.ts` 一处，且**只在 H5 分支里**
     *   （`// #ifdef H5` 之外的地方引用它，小程序端会拿到无意义的 query，
     *    详见那里的注释）。其它端条件编译会把引用整行剥掉，这个常量等于没用到。
     */
    __CAT_ICON_VERSION__: JSON.stringify(CAT_ICON_VERSION),
  },
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
    // 后端**已配 CORS 白名单**（后端 src/config/config.default.ts 的 `cors.origin`，
    // 默认放行 localhost:5173 / 127.0.0.1:5173）。这里仍然保留代理，是为了：
    //   ① 开发时前端只认相对路径 `/api`，不必区分环境写死后端地址（见 src/utils/request.ts）；
    //   ② 真机 / 局域网调试时，连的是本机 IP，与 CORS 白名单里的 localhost 不是同一个 Origin。
    // 独立域名部署时改后端的 CORS_ORIGINS 即可，不需要动这里。
    proxy: {
      '/api': {
        target: BACKEND,
        changeOrigin: true,
      },
    },
  },
});
