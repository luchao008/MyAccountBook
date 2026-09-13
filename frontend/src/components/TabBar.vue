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
      <SvgIcon v-else :name="item.icon" :size="22" />
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
 *   ② **导航模式** —— 不传 `current`。点击按 `item.url` 走页面跳转
 *      （账本选择页用它：首页=本页、我的=进主容器）。
 *
 * 导航模式下为避免页面栈无限增长，采用：
 *   目标页已在栈中 → navigateBack 回退（复用实例）
 *   目标页不在栈中 → navigateTo
 *
 * 中间凸起项（`raised: true`，「记一笔」）：
 *   它是一个**动作**而非视图，所以没有选中态；渲染成圆按钮向上越出底栏顶边，
 *   文字与其它项同处一行（参考图「流水 / 报表 / 记一笔 / 成员 / 设置」的形态）。
 *   点击行为与其它项一致地 `emit('change')` / 按 url 跳转，语义由父级决定 ——
 *   本组件不硬编码"记一笔要去哪"。
 */

export interface TabItem {
  /** 视图/页面标识 */
  key: string;
  text: string;
  icon: string;
  /** 导航模式必填；受控模式忽略 */
  url?: string;
  /**
   * 中间凸起项（「记一笔」）。
   *
   * 它不是视图、也不会被选中 —— 渲染成圆形按钮向上越出底栏顶边，
   * 文字仍与其它项同处一行（所以整体靠底对齐，圆形靠负空间凸出去）。
   */
  raised?: boolean;
}

const DEFAULT_ITEMS: TabItem[] = [
  { key: 'home', text: '记账', icon: 'icon-home' },
  { key: 'detail', text: '明细', icon: 'icon-receipt' },
  // 中间凸起：四项视图 + 中间一个动作，与参考图「流水 / 报表 / 记一笔 / 成员 / 设置」同构
  { key: 'record', text: '记一笔', icon: 'icon-plus', raised: true },
  { key: 'statistics', text: '统计', icon: 'icon-chart-bar' },
  { key: 'mine', text: '我的', icon: 'icon-user' },
];

const props = withDefaults(
  defineProps<{
    /** 覆盖默认四项（账本选择页只用两项） */
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
  // 受控模式：由 current 决定
  if (props.current !== undefined) return item.key === props.current;
  // 导航模式：由当前路由决定
  if (!item.url) return false;
  // 带 query 的 url 只比对路径部分
  const [path] = item.url.split('?');
  return currentPath.value === path;
}

function go(item: TabItem) {
  if (isActive(item)) return;

  // 受控模式：交给父级处理
  if (props.current !== undefined) {
    emit('change', item.key);
    return;
  }

  if (!item.url) return;

  const [path] = item.url.split('?');
  const pages = getCurrentPages();
  const idx = pages.findIndex((p) => '/' + (p.route || '') === path);

  if (idx >= 0) {
    uni.navigateBack({ delta: pages.length - 1 - idx });
    return;
  }

  uni.navigateTo({ url: item.url });
}
</script>

<style scoped lang="scss">
.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  background: $bg-canvas;
  border-top: 1px solid $line;
  z-index: 100;
  /*
   * 高度必须**写死**，不能用 min-height。
   *
   * 踩过：先前写 min-height: 56px，凸起项的内容（48 圆 + 2 间距 + 17 文字 + 10 内边距 = 77）
   * 比其它项高，于是把底栏一起撑到 79px —— 圆被整个"吞"进底栏里，实测 overhang = −1。
   * 固定高度后，凸起项的内容改为向上溢出，圆才真的越出顶边。
   */
  height: 56px;
  overflow: visible;
}

.tabbar--safe {
  padding-bottom: env(safe-area-inset-bottom);
}

.tab-item {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  /*
   * 这 5px 是**为了和凸起项的文字对齐**算出来的，不是随手加的：
   * 普通项内容 22 + 2 + 17 = 41，居中后文字底距底栏 7.5px；
   * 凸起项的 padding-bottom 是 10px，两者差 2.5px →
   * 这里补 5px 下内边距，普通项文字底距正好也落到 10px（实测差 ≤1px）。
   */
  padding-bottom: 5px;
  gap: 2px;
  color: $text-tertiary;
}

/*
 * 凸起项靠底对齐 —— 这是圆能"免费"凸出去的原因。
 *
 * 文字贴在与其它项同一行的位置，48px 的圆放不下就自然向上越出底栏顶边，
 * 不需要负 margin（负 margin 会在 flex 里留下"占位 22px"这种与肉眼不符的账）。
 * 实测凸出 ≈ 21px = 56 − 10 − 17 − 2 − 48。
 */
.tab-item.raised {
  justify-content: flex-end;
  padding-bottom: 10px;
}

.raised-btn {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  /*
   * 必须禁掉收缩。
   *
   * 踩过：底栏高度固定后，凸起项的内容是"溢出"状态，
   * 而 flex 子项默认 flex-shrink: 1 —— 圆会被压扁到 25px 高（实测），
   * 看着像个小药丸，而且照样凸不出去。
   */
  flex-shrink: 0;
  /* 白色加号压 brand-600 = 4.52:1 ✅（brand-500 只有 2.84:1，不能承载白字） */
  background: $brand-600;
  color: $text-inverse;
  display: flex;
  align-items: center;
  justify-content: center;
}

.raised-btn:active {
  background: $brand-800;
}

.tab-text {
  font-size: $font-caption;
  line-height: $lh-caption;
}

/* 选中态：颜色 + 字重同时变化 */
.tab-item.active {
  color: $brand-700;
  font-weight: $weight-medium;
}

/* 凸起项不是视图，文字固定用次级深灰（压白底 5.55:1 ✅） */
.tab-item.raised .tab-text {
  color: $text-secondary;
}
</style>
