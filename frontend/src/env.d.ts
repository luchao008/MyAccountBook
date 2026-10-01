/// <reference types="vite/client" />

/**
 * 构建期注入的全局常量（由 `vite.config.ts` 的 `define` 提供，
 * 值的算法见那里的 `catIconVersion()`）。
 *
 * = `src/static/cat-icons/` 目录内容的 hash，8 位 hex。
 *
 * ⚠️ 必须在这里声明：它是**构建期文本替换**出来的，源码里并不存在真正的全局变量，
 *   TS 看不到定义，不声明 `npm run type-check`（vue-tsc）会报
 *   `Cannot find name '__CAT_ICON_VERSION__'`。本文件没有 export，是全局声明作用域，
 *   所以直接 `declare const` 即可被所有源码看到。
 *
 * 引用点只有 `src/utils/catIcon.ts` 一处，且只在 H5 条件编译分支里（见那里的注释）。
 */
declare const __CAT_ICON_VERSION__: string;

declare module '*.vue' {
  import { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  const component: DefineComponent<{}, {}, any>
  export default component
}
