<template>
  <view class="tabbar" :class="{ 'tabbar--safe': safeArea }">
    <view
      v-for="item in resolvedItems"
      :key="item.key"
      class="tab-item"
      :class="{ active: isActive(item), raised: item.raised }"
      @click="go(item)"
    >
      <!--
        凸起项：圆形按钮。它靠底对齐（见 .tab-item.raised），
        因此圆的上半部分会自然越出底栏顶边 —— 不需要负 margin。
      -->
      <view v-if="item.raised" class="raised-btn">
        <SvgIcon :name="item.icon" :size="24" />
      </view>
      <!-- 图标与文字同时变色：不依赖单一颜色区分（WCAG 1.4.1） -->
      <SvgIcon v-else :name="item.icon" :size="24" />
      <text class="tab-text">{{ item.text }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import SvgIcon from '@/components/SvgIcon.vue';

/**
 * 自定义底部导航栏（替代原生 tabBar）
 *
 * 两种工作模式：
 *   ① **受控模式** —— 传入 `current`。点击只 `emit('change', key)`，由父级切换视图。
 *      容器页 `pages/main` 用它实现单页多视图，导航栏**只实例化一次**，
 *      转场彻底消失（原生 tabBar 与"每页各放一个"的做法都会有滑动感）。
 *   ② **导航模式** —— 不传 `current`。点击按 `item.url` 走页面跳转。
 *
 * **`item.url` 与上面的模式正交**：带 url 的项，在**任何一种模式下**都走页面跳转。
 *   这解决了一类真实需求：某一格的内容不适合放进单页容器（需要自己的页面栈、
 *   返回按钮、独立刷新），但它又必须在底栏有一格。本项目的「报表」就是这种情况 ——
 *   它是独立页面 `pages/statistics/index`，不是 `pages/main` 的视图。
 *   ⚠️ 于是一格底栏有两种语义：**"切视图"（无 url）** 与 **"离开本页"（有 url）**。
 *   判断依据只看 url 有没有，不看模式 —— 少一个需要对齐的状态，就少一处会写错的地方。
 *
 * 跨页跳转为避免页面栈无限增长，采用：
 *   目标页已在栈中 → navigateBack 回退（复用实例）
 *   目标页不在栈中 → navigateTo
 *
 * 中间凸起项（`raised: true`，「记一笔」）：
 *   它是一个**动作**而非视图，所以没有选中态；渲染成圆按钮向上越出底栏顶边，
 *   文字与其它项同处一行。
 *   点击行为与其它项一致地 `emit('change')` / 按 url 跳转，语义由父级决定 ——
 *   本组件不硬编码"记一笔要去哪"。
 */

export interface TabItem {
  /** 视图/页面标识 */
  key: string;
  text: string;
  icon: string;
  /**
   * 目标页面地址。**有 url 即走页面跳转**（两种模式都成立，见文件头说明）。
   *
   * 用法上它是"这一格不是本容器的视图"的声明：典型是「报表」——
   * 内容有自己的独立页面，需要返回按钮与自己的页面栈，不适合塞进单页容器。
   */
  url?: string;
  /**
   * 中间凸起项（「记一笔」）。
   *
   * 它不是视图、也不会被选中 —— 渲染成圆形按钮向上越出底栏顶边，
   * 文字仍与其它项同处一行（所以整体靠底对齐，圆形靠负空间凸出去）。
   */
  raised?: boolean;
}

/**
 * 默认底栏 —— **3 格**（记账 / 报表 / 记一笔）。
 *
 * 结构沿革：
 *   · 2026-09-13「明细」退出底栏并下线；「统计」改为独立页「报表」（带 url 跳转）。
 *   · 2026-09-14 **「我的」从本容器移除** —— 容器的 `mine` 视图一并下线，
 *     「我的」改由**账本选择页**（启动页）的底栏提供入口，避免留下"没有入口的视图"。
 *
 * ✅ **凸起项必须排在正中间那一格才居中**：3 格时槽中心是 16.7% / **50%** / 83.3%。
 *    「记一笔」放在中间 → 落在 **50%**，真正居中。
 *    ⚠️ 放在最后一格会落到 83.3%，**比 4 格时的 62.5% 还偏** ——
 *       "3 格就能居中"是个错误直觉，居不居中取决于**它排第几**，不是总数少。
 */
const DEFAULT_ITEMS: TabItem[] = [
  /*
   * 「流水」是跨页项（带 url）—— 它不是 `pages/main` 的视图。
   * 2026-09-14 起：原本的「记账」改为「流水」，点击**跳转**到流水页
   * （而不是切换本容器视图），与「报表」同一套机制。
   * 记账页本身仍是容器唯一的视图，由账本选择页 `navigateTo` 进入。
   */
  { key: 'flow', text: '流水', icon: 'icon-receipt', url: '/pages/flow/index' },
  // 凸起项放正中（见上方注释：位置由"排第几"决定，不由格子总数决定）
  { key: 'record', text: '记一笔', icon: 'icon-plus', raised: true },
  /*
   * 「报表」是跨页项（带 url）—— 它不是 `pages/main` 的视图。
   * 图标沿用原「统计」的 icon-chart-bar：承载的内容是同一套统计视图，
   * 变的只是承载方式（容器内视图 → 独立页面）。
   */
  { key: 'report', text: '报表', icon: 'icon-chart-bar', url: '/pages/statistics/index' },
];

const props = withDefaults(
  defineProps<{
    /** 覆盖默认项（账本选择页用自己的两项） */
    items?: TabItem[];
    /** 受控模式下的当前项；传入即启用受控模式 */
    current?: string;
    /** 是否留出底部安全区，默认留 */
    safeArea?: boolean;
  }>(),
  { items: undefined, current: undefined, safeArea: true },
);

const emit = defineEmits<{ (e: 'change', key: string): void }>();

const resolvedItems = computed(() => props.items ?? DEFAULT_ITEMS);

/** 导航模式下用于高亮：当前页面路径 */
const currentPath = ref('');

function readCurrentPath() {
  const pages = getCurrentPages();
  if (!pages.length) return '';
  return '/' + (pages[pages.length - 1].route || '');
}

function sync() {
  currentPath.value = readCurrentPath();
}

onMounted(sync);
onShow(sync);

function isActive(item: TabItem): boolean {
  // 凸起项是「动作」不是「视图」，没有选中态可言
  if (item.raised) return false;
  // 受控模式：由 current 决定。
  // 跨页项（如带 url 的「报表」）在这里**永远返回 false** —— 它不属于本容器的视图集合，
  // 而且它自己的页面在上层时本容器根本不可见，不存在"该高亮哪一格"的问题。
  if (props.current !== undefined) return item.key === props.current;
  // 导航模式：由当前路由决定
  if (!item.url) return false;
  // 带 query 的 url 只比对路径部分
  const [path] = item.url.split('?');
  return currentPath.value === path;
}

function go(item: TabItem) {
  if (isActive(item)) return;

  /*
   * ① 带 url 的项 = **离开当前页面**去另一个页面。
   *
   * 这一支必须放在受控模式判断**之前**。反过来的话，受控模式下「报表」会被
   * 当成一个本容器并不存在的视图 emit 出去，父级 switchTo 里没有对应分支
   * → 点了没反应（而且不报错，只是"死按钮"）。
   */
  if (item.url) {
    const [path] = item.url.split('?');
    const pages = getCurrentPages();
    const idx = pages.findIndex((p) => '/' + (p.route || '') === path);

    // 目标页已在栈中 → 回退复用（避免页面栈无限增长）
    if (idx >= 0) {
      uni.navigateBack({ delta: pages.length - 1 - idx });
      return;
    }

    uni.navigateTo({ url: item.url });
    return;
  }

  /*
   * ② 受控模式：本容器内的视图切换，交给父级。
   * 无 url 且非受控模式（导航模式下漏配 url）→ 什么都不做，等价于旧实现的 `if (!item.url) return`。
   */
  if (props.current !== undefined) {
    emit('change', item.key);
  }
}
</script>

<style scoped lang="scss">
/*
 * v1.1「iOS 原生观感 · 暖金调」底栏。
 *
 * 高度由 56 → 76（内容区 75，另 1px 顶边线）。**这个改动会连带改变凸起圆的越出量**，
 * 详见 .tab-item.raised 的几何说明 —— 圆的长大（48→50，仅 +2）远不及底栏长高（+20），
 * 若 padding-bottom 不动，越出量会从 22px 掉到 5px，"凸起"这个设计意图基本消失。
 */
.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  /*
   * 毛玻璃材质（iOS 17–18 式）。@include ios-material 自带 @supports 降级 ——
   * 小程序端 backdrop-filter 支持度参差，没有降级会出现"底栏纯透明、文字叠在内容上"。
   * 底栏是 fixed，页面内容会滚到它下面，所以这里的半透明是真的看得见的。
   * ⚠️ 有意不做 iOS 26 的 Liquid Glass（理由见设计文档 §2.4）。
   */
  @include ios-material;
  border-top: 1px solid $v11-line;
  z-index: 100;
  /*
   * 高度必须**写死**，不能用 min-height。
   *
   * 踩过：先前写 min-height: 56px，凸起项的内容比其它项高，于是把底栏一起撑到 79px ——
   * 圆被整个"吞"进底栏里，实测 overhang = −1。固定高度后，凸起项的内容改为向上溢出，
   * 圆才真的越出顶边。
   */
  height: 76px;
  overflow: visible;
}

/*
 * ⚠️ 底部安全区**必须加进 height 本身**，不能用 padding 挤内容。
 *
 * 踩过（Safari 全屏 / 添加到主屏幕）：`.tabbar` 是 `box-sizing: border-box` + 固定
 * `height`，而 border-box 下 **height 是包含 padding 的** ——
 * 再加 `padding-bottom: 34px`（iPhone home indicator 的 safe-area）后，
 * 内容区只剩 `76 − 34 − 1(border) = 41px`，凸起项 50px 的圆会被压扁。
 *
 * 正解：height 也跟着安全区长（`76 + safe`），padding 只负责把内容顶上去。
 * 这样 border-box 下内容区恒为 `75px`，与无安全区时完全一致。
 *
 * 先写不带 env 的 height 作**兜底**：不支持 `env()` 的浏览器会整条丢弃 calc 声明，
 * 有兜底才不会连高度都没了。
 */
.tabbar--safe {
  height: 76px;
  height: calc(76px + env(safe-area-inset-bottom, 0px));
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.tab-item {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  /*
   * 这 5px 是**为了和凸起项的文字对齐**调出来的，不是随手加的。
   *
   * ✅ v1.1 实测：普通项与凸起项的文字底距**都是 18px**（完全对齐）。
   *    脚本 scripts/verify-safe-area.mjs 与 /tmp 探针均可复现。
   * ⚠️ 不要凭公式反推这个值 —— 居中算法受 padding / gap / 行高三者共同影响，
   *    推导很容易得出一个和实测不符的数（本文件此前就写错过一次）。
   *    **对齐与否只认实测。**
   */
  padding-bottom: 5px;
  gap: 2px;
  color: $v11-text-secondary;
}

/*
 * 凸起项靠底对齐 —— 这是圆能"免费"凸出去的原因。
 *
 * 文字贴在与其它项同一行的位置，50px 的圆放不下就自然向上越出底栏顶边，
 * 不需要负 margin（负 margin 会在 flex 里留下"占位 22px"这种与肉眼不符的账）。
 *
 * ⚠️ padding-bottom 由 10 → **18**，这是底栏长高后的必要补偿：
 *    · 旧几何（高 56 / 圆 48 / pad 10）：圆顶距项底 78，越出 78 − 55 = **22px**
 *    · 只长高不补 pad（高 76 / 圆 50 / pad 10）：圆顶距项底 80，越出 80 − 75 = **5px**
 *      → 圆几乎被吞进底栏，"凸起"消失
 *    · 实际采用（高 76 / 圆 50 / pad 18）：越出 **12px**（实测值）
 *
 * ⚠️ 是 12 而不是 13：项高 75 是**含 1px 顶边线**的内容区，而圆越出的是底栏
 *    border-box 的顶边，所以要再减掉那 1px。实测 overhang = 12
 *    （脚本 scripts/verify-safe-area.mjs，含负向验证）。
 * ✅ 实测凸起项与普通项的文字底距**都是 18px**（完全对齐）。
 */
.tab-item.raised {
  justify-content: flex-end;
  padding-bottom: 18px;
}

.raised-btn {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  /*
   * 必须禁掉收缩。
   *
   * 踩过：底栏高度固定后，凸起项的内容是"溢出"状态，
   * 而 flex 子项默认 flex-shrink: 1 —— 圆会被压扁到 25px 高（实测），
   * 看着像个小药丸，而且照样凸不出去。
   */
  flex-shrink: 0;
  /* 白色加号压 $v11-gold = 4.87:1 ✅（对比度对称：白底金字同样是 4.87） */
  background: $v11-gold;
  color: $text-inverse;
  display: flex;
  align-items: center;
  justify-content: center;
  /*
   * 品牌金投影 —— ⚠️ 阴影不是装饰色，而是「品牌色的淡化」，
   * 色值必须跟随 $v11-gold 一起改。
   * 漏了这一步就会出现"金色按钮配橙色光晕"（旧值是 rgba(207,74,18)）。
   */
  box-shadow: 0 4px 14px $v11-gold-shadow;
}

.raised-btn:active {
  background: $v11-gold-pressed;
}

.tab-text {
  font-size: $font-caption;
  line-height: $lh-caption;
}

/* 选中态：颜色 + 字重同时变化（不依赖单一颜色区分，WCAG 1.4.1） */
.tab-item.active {
  color: $v11-gold;
  font-weight: $weight-medium;
}

/* 凸起项不是视图，文字固定用次级灰（压白卡 5.29:1 ✅ / 压 #F8F8F8 4.98:1 ✅） */
.tab-item.raised .tab-text {
  color: $v11-text-secondary;
}
</style>
