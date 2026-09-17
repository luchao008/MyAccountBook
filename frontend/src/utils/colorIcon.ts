/**
 * 彩色图标的查找入口。
 *
 * 数据分两层，**故意拆成两个文件**：
 *   `constants/color-icon-meta.ts`  —— 元数据（集合 key / Tab 名 / 网格边长 / 数量），~1 KB，**同步**可用；
 *   `constants/color-icons.ts`      —— 图标正文，600 KB+ / gzip 约 212 KB，**动态 import 分包**。
 *
 * ⚠️ 2026-09-16 阶段 5：正文从「静态 import」改成「按需拉取」，原因是实测发现
 *    它被 **15 个文件**引用（含首页），于是**首屏就要下载那 212 KB** ——
 *    而其中绝大多数图标用户一辈子不会用到（只有分类图标选择器会全量展示）。
 *
 * ⚠️ 代价与对策：索引不再是"模块加载即就绪"，所以
 *    `isColorIconKey()` 改成**按形态判定**（`<集合>:<名字>` 且集合前缀已知），
 *    不再依赖"在索引里查得到"。相应地，**陈旧 / 不存在的彩色 key 不能直接当彩色渲染**
 *    （会渲染成空白）—— 由 `CategoryIcon.vue` 在数据到位后复核一次、取不到就退回单色。
 *
 * 为什么查询逻辑单独放一个文件而不写进生成物：生成物是"数据"，随时可能被重新生成覆盖；
 * 查询逻辑是"代码"，不该跟着一起被覆盖掉。
 */
import { ref } from 'vue';
import { COLOR_ICON_SET_META } from '@/constants/color-icon-meta';

interface ColorIconEntry {
  /** SVG body */
  body: string;
  /** 该图标集自己的 viewBox 边长（各集合不同，必须连尺寸一起记住） */
  size: number;
}

/** key → 图标。**数据到位前为 null**（不是空 Map —— 空 Map 会让"没加载"和"查不到"混为一谈） */
let index: Map<string, ColorIconEntry> | null = null;

/**
 * 数据是否已就绪。
 *
 * ⚠️ 导出成响应式 ref 是**必要的**，不是在偷懒：索引本身是普通 Map，
 *    组件里 `computed(() => getColorIcon(name))` 不会因为 Map 被填充而重算 ——
 *    分包下载完成后图标会**一直空白**。让组件依赖这个 ref 才会重渲染。
 */
export const colorIconsReady = ref(false);

/** 已知的集合前缀。由元数据派生，新增集合不需要改代码 */
const SET_KEYS = new Set(COLOR_ICON_SET_META.map((s) => s.key));

let loading: Promise<void> | null = null;

/**
 * 拉取图标正文并建索引（**幂等**，重复调用共用同一个 Promise）。
 *
 * 调用点只有两处：`CategoryIcon.vue`（任何要画图标的地方）与 `icon-picker`
 * （它要的是"全部 key 列表"，不能等子组件来触发）。
 */
export function loadColorIcons(): Promise<void> {
  if (index) return Promise.resolve();
  if (!loading) {
    loading = import('@/constants/color-icons').then((mod) => {
      const map = new Map<string, ColorIconEntry>();
      for (const set of mod.COLOR_ICON_SETS) {
        for (const [key, body] of Object.entries(set.icons)) {
          map.set(key, { body, size: set.size });
        }
      }
      index = map;
      colorIconsReady.value = true;
    });
  }
  return loading;
}

/** 某个集合下的 key（图标选择器的 Tab 内展示用）。**数据未就绪时返回空数组** */
export function colorIconKeysOf(setKey: string): string[] {
  if (!index) return [];
  return [...index.keys()].filter((k) => k.startsWith(`${setKey}:`));
}

/**
 * 是不是彩色图标的 key —— **按形态判定，不查索引**。
 *
 * 为什么不能查索引：本函数在 `CategoryIcon.vue` 的渲染分支上被调用，
 * 必须是同步的；而索引要等分包下载完才有。
 *
 * 形态规则：含冒号，且冒号前的集合前缀在元数据里。
 * ⚠️ 与旧的「查得到即彩色」相比，这个判据**偏宽松**：
 *    形如 `life:不存在的名字` 也会返回 true。所以取图标时必须再复核一次真实存在性 ——
 *    见 `CategoryIcon.vue` 的 `useColor`（数据到位后取不到就退回单色渲染）。
 * ⚠️ 单色 key（`cat-food`）与 emoji（`🍔`）都不含已知前缀 + 冒号，不会被误判。
 */
export function isColorIconKey(name?: string | null): boolean {
  if (typeof name !== 'string') return false;
  const i = name.indexOf(':');
  if (i <= 0) return false;
  return SET_KEYS.has(name.slice(0, i));
}

/** 取图标的 SVG body 与其 viewBox 边长。**数据未就绪 / 查不到都返回 null** */
export function getColorIcon(name?: string | null): ColorIconEntry | null {
  if (!name || !index) return null;
  return index.get(name) ?? null;
}
