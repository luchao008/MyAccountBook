<template>
  <view v-show="visible" class="mask" @click="close">
    <view class="sheet" @click.stop>
      <!-- 顶部工具条 -->
      <view class="toolbar">
        <view class="tools">
          <view class="tool" @click="onCreateChild">
            <SvgIcon class="tool-icon" name="icon-plus" :size="20" />
          </view>
          <view class="tool" @click="toggleSearch">
            <SvgIcon class="tool-icon" name="icon-search" :size="20" />
          </view>
        </view>
        <view class="tool" @click="close">
          <view class="tool-icon collapse"><SvgIcon name="icon-chevron-down" :size="20" /></view>
        </view>
      </view>

      <!-- 搜索框 -->
      <view v-if="searching" class="search-bar">
        <input
          v-model="keyword"
          class="search-input"
          placeholder="搜索二级分类"
          focus
          confirm-type="search"
        />
      </view>

      <!-- 搜索结果：单独一屏，不做左右联动 -->
      <scroll-view v-if="searching" class="search-result" scroll-y>
        <view class="group">
          <text class="group-title">搜索结果</text>
          <view v-if="searchResults.length" class="grid">
            <view
              v-for="item in searchResults"
              :key="item.id"
              class="grid-item"
              :class="{ picked: item.id === modelValue }"
              @click="pick(item, item.parentId)"
            >
              <CategoryIcon class="icon" :name="item.icon" :size="iconSize" />
              <text class="name">{{ item.name }}</text>
            </view>
          </view>
          <view v-else class="empty">
            <text class="empty-text">没有匹配的二级分类</text>
          </view>
        </view>
      </scroll-view>

      <!-- 左右联动主体 -->
      <view v-else class="content">
        <!-- 左侧：最近使用 + 各一级分类 -->
        <scroll-view
          class="sidebar"
          scroll-y
        >
          <view
            id="side-anchor-recent"
            class="side-item"
            :class="{ active: activeKey === 'recent' }"
            @click="selectKey('recent')"
          >
            <text class="side-text">最近使用</text>
          </view>
          <view
            v-for="g in groups"
            :key="g.root.id"
            :id="'side-anchor-' + g.root.id"
            class="side-item"
            :class="{ active: activeKey === g.root.id }"
            @click="selectKey(g.root.id)"
          >
            <text class="side-text">{{ g.root.name }}</text>
          </view>
        </scroll-view>

        <!-- 右侧：全部分组的二级分类，滚动时反推左侧选中项 -->
        <scroll-view
          id="main-scroll"
          class="main"
          scroll-y
          :scroll-into-view="mainIntoView"
          scroll-with-animation
          @scroll="onMainScroll"
        >
          <view v-if="recentItems.length" id="group-anchor-recent" class="group">
            <text class="group-title">最近使用</text>
            <view class="grid">
              <view
                v-for="item in recentItems"
                :key="'r-' + item.id"
                class="grid-item"
                :class="{ picked: activeKey === 'recent' && item.id === modelValue }"
                @click="pick(item, 'recent')"
              >
                <CategoryIcon class="icon" :name="item.icon" :size="iconSize" />
                <text class="name">{{ item.name }}</text>
              </view>
            </view>
          </view>

          <view
            v-for="g in groups"
            :key="g.root.id"
            :id="'group-anchor-' + g.root.id"
            class="group"
          >
            <text class="group-title">{{ g.root.name }}</text>
            <view v-if="g.children.length" class="grid">
              <view
                v-for="item in g.children"
                :key="item.id"
                class="grid-item"
                :class="{ picked: activeKey === g.root.id && item.id === modelValue }"
                @click="pick(item, g.root.id)"
              >
                <CategoryIcon class="icon" :name="item.icon" :size="iconSize" />
                <text class="name">{{ item.name }}</text>
              </view>
            </view>
            <view v-else class="empty-inline">
              <text class="empty-text">暂无二级分类</text>
            </view>
          </view>
        </scroll-view>

        <!-- 自绘滚动条：绝对定位贴右侧，不依赖 uni-scroll-view 的内部 DOM -->
        <view
          v-if="barVisible"
          class="scrollbar"
          :style="{ top: barTop + 'px', height: barHeight + 'px' }"
        />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, getCurrentInstance } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';
import CategoryIcon from '@/components/CategoryIcon.vue';
import { useCategoryStore } from '@/store/category';
import type { CategoryItem } from '@/api/category';

const RECENT_KEY = 'recentCategoryIds';
/** 最近使用最多记录 10 个 */
const RECENT_MAX = 10;

/** 左侧第一项固定是「最近使用」，用一个不会与真实 ID 冲突的 key */
const RECENT_KEY_ANCHOR = 'recent';

const props = defineProps<{
  visible: boolean;
  type: 'income' | 'expense';
  modelValue: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  (e: 'update:modelValue', v: string): void;
}>();

const categoryStore = useCategoryStore();
const instance = getCurrentInstance();

const activeKey = ref<string>(RECENT_KEY_ANCHOR);

/**
 * 分类图标的显示尺寸。
 *
 * 参考图实测（402px 视口）：图标画布约 40px（用「水果零食」苹果的墨迹 20px 反推，
 * 自有素材墨迹占比 ~51% → 20/0.51 ≈ 39.8）。旧版 24px 明显偏小。
 *
 * 窄屏（<360px）降一档到 36：320px 下每格只有 ~51px，40px 的图标会把格子顶满，
 * 失去参考图"图标居中留白"的观感。
 * ⚠️ 图标尺寸与字号**解耦**（设计约定）：不随 font-size 走，200% 字号下仍是 40。
 */
const windowWidth = ref(375);
try {
  const info = uni.getSystemInfoSync();
  windowWidth.value = info.windowWidth || 375;
} catch {
  windowWidth.value = 375;
}

const iconSize = computed(() => (windowWidth.value < 360 ? 36 : 40));

const searching = ref(false);
const keyword = ref('');
const recentIds = ref<string[]>([]);

/** 点击左侧时用于触发右侧定位 */
const mainIntoView = ref('');

/** 右侧各分组的锚点 key 与相对滚动容器顶部的位置 */
const anchorKeys = ref<string[]>([]);
const anchorTops = ref<number[]>([]);

/** 自绘滚动条状态 */
const mainViewportH = ref(0);
const mainContentH = ref(0);
const mainScrollTop = ref(0);

/** 内容超出可视高度时才显示滚动条 */
const barVisible = computed(
  () => mainViewportH.value > 0 && mainContentH.value > mainViewportH.value + 1,
);

const barHeight = computed(() =>
  barVisible.value
    ? Math.max((mainViewportH.value / mainContentH.value) * mainViewportH.value, 40)
    : 0,
);

const barTop = computed(() => {
  if (!barVisible.value) return 0;
  const scrollable = mainContentH.value - mainViewportH.value;
  const range = mainViewportH.value - barHeight.value;
  return (mainScrollTop.value / scrollable) * range;
});

const roots = computed(() =>
  // 用 selectable* 而不是全量：隐藏的分类不参与记账
  categoryStore.selectableRoots(props.type)
);

/** 右侧分组：每个一级 + 其二级 */
const groups = computed(() =>
  roots.value.map((root) => ({
    root,
    children: categoryStore.selectableChildrenOf(root.id),
  }))
);

const searchResults = computed(() => {
  const kw = keyword.value.trim();
  if (!kw) return [];
  return categoryStore.list.filter(
    (c) => c.type === props.type && c.parentId && c.name.includes(kw),
  );
});

/** 最近使用：只保留当前收支类型下仍然存在的二级分类 */
const recentItems = computed(() =>
  recentIds.value
    .map((id) => categoryStore.list.find((c) => c.id === id))
    .filter((c): c is CategoryItem => !!c && c.type === props.type && !!c.parentId)
    .slice(0, RECENT_MAX),
);

function loadRecent() {
  recentIds.value = (uni.getStorageSync(RECENT_KEY) || []) as string[];
}

function saveRecent(id: string) {
  const next = [id, ...recentIds.value.filter((x) => x !== id)].slice(0, RECENT_MAX);
  recentIds.value = next;
  uni.setStorageSync(RECENT_KEY, next);
}

/**
 * 测量右侧各分组的纵向位置。
 *
 * 用 boundingClientRect 取元素相对视口的 top，再减去滚动容器的 top，
 * 得到"相对内容顶部"的偏移——这个值不随滚动变化，所以只需测一次。
 * 必须在弹窗渲染完成后调用。
 */
async function measureAnchors() {
  await nextTick();

  const keys: string[] = [];
  if (recentItems.value.length) keys.push(RECENT_KEY_ANCHOR);
  for (const g of groups.value) keys.push(g.root.id);

  const query = uni.createSelectorQuery().in(instance);
  query.select('#main-scroll').boundingClientRect();
  for (const key of keys) {
    query.select(`#group-anchor-${key}`).boundingClientRect();
  }

  query.exec((res: any[]) => {
    const container = res?.[0];
    const containerTop = container?.top ?? 0;
    // 顺便记录可视高度，供自绘滚动条计算使用
    mainViewportH.value = container?.height ?? 0;

    const tops: number[] = [];
    for (let i = 0; i < keys.length; i++) {
      const rect = res?.[i + 1];
      // 元素不存在时退化为上一个锚点位置，避免下标错乱
      tops.push(rect ? rect.top - containerTop : (tops[i - 1] ?? 0));
    }
    anchorKeys.value = keys;
    anchorTops.value = tops;
  });
}

/**
 * 程序化滚动（点左侧 → 右侧定位）的抑制窗口截止时间戳。
 *
 * 为什么需要：点左侧某项后，右侧用 `scroll-into-view` **平滑滚动**到目标分组，
 * 滚动途中会连续触发 onMainScroll —— 若照常"按当前 scrollTop 反推高亮"，
 * 滚过"最近使用"时就会把 activeKey 改回去（表现为"点了食品酒水却跳回最近使用"）。
 * 因此在这段窗口内只更新滚动条位置，**不反推 activeKey**。
 */
let suppressScrollSyncUntil = 0;

/** 滚动右侧 → 反推当前应当高亮的左侧项 + 更新自绘滚动条位置 */
function onMainScroll(e: any) {
  const detail = e?.detail ?? {};
  mainScrollTop.value = detail.scrollTop ?? 0;
  if (detail.scrollHeight) mainContentH.value = detail.scrollHeight;

  // 程序化滚动中：不反推高亮（否则会被滚动路径上的中间分组带偏）
  if (Date.now() < suppressScrollSyncUntil) return;

  if (!anchorTops.value.length) return;

  const scrollTop = mainScrollTop.value;
  let index = 0;
  for (let i = 0; i < anchorTops.value.length; i++) {
    // 减 8px 容差，避免刚好压在边界时来回跳
    if (scrollTop >= anchorTops.value[i] - 8) index = i;
  }

  const key = anchorKeys.value[index];
  if (!key || key === activeKey.value) return;

  activeKey.value = key;
  // 左栏跟随滚动，把高亮项滚到**竖直中央**
  scrollSidebarTo(key);
}

/** 侧栏滚动动画句柄：新的滚动会取消上一个，避免多个 rAF 打架 */
let sidebarAnimRAF = 0;

/**
 * 侧栏平滑滚动（easeOutCubic，约 260ms）。
 *
 * 为什么自己写：实测 `scrollTo({ behavior: 'smooth' })` 在这个内层可滚元素上
 * **不生效**（值纹丝不动），而逐帧设 `scrollTop` 有效。
 */
function animateSidebarScroll(scroller: HTMLElement, from: number, to: number) {
  if (sidebarAnimRAF) cancelAnimationFrame(sidebarAnimRAF);
  if (Math.abs(to - from) < 0.5) {
    scroller.scrollTop = to;
    return;
  }
  const DUR = 260;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / DUR);
    // easeOutCubic：起步快、收尾缓，符合"跟随焦点"的手感
    const eased = 1 - Math.pow(1 - t, 3);
    scroller.scrollTop = from + (to - from) * eased;
    sidebarAnimRAF = t < 1 ? requestAnimationFrame(step) : 0;
  };
  sidebarAnimRAF = requestAnimationFrame(step);
}

/**
 * 找某个 scroll-view 内**真正可滚**的元素。
 * ⚠️ scroll-view 外层不可滚，真实滚动在内层 div 上（实测）；
 *    判据用 scrollHeight > clientHeight，而不是 overflow:auto。
 */
function getScrollEl(selector: string): HTMLElement | undefined {
  const root = instance?.proxy?.$el as HTMLElement | undefined;
  const wrap = root?.querySelector(selector) as HTMLElement | undefined;
  return wrap
    ? (Array.from(wrap.querySelectorAll('.uni-scroll-view')).find(
        (e) => e.scrollHeight > e.clientHeight + 1,
      ) as HTMLElement | undefined)
    : undefined;
}

/**
 * 把左侧第 key 项滚动到侧栏竖直中央（"尽量"，到边界时自然停在顶/底）。
 *
 * 为什么不用 `scroll-into-view`：它只保证"可见"（滚到最近边缘），
 * 选中项会贴在顶部或底部 —— 滚动右侧列表时左栏一直在跳边。居中后
 * 左右两侧的焦点都落在中间那条线上，视觉更稳。
 *
 * 位置靠**实测**（selectAll 拿每项相对内容顶部的偏移）而不是按行高硬算：
 * 一级分类名可能换行，行高不固定。
 */
function scrollSidebarTo(key: string) {
  const idx = key === 'recent' ? 0 : groups.value.findIndex((g) => g.root.id === key) + 1;
  if (idx < 0) return;
  nextTick(() => {
    const q = uni.createSelectorQuery().in(instance);
    q.select('.sidebar').boundingClientRect();
    q.selectAll('.side-item').boundingClientRect();
    /*
     * 先找到侧栏内真正可滚的元素（`.sidebar` 内的 .uni-scroll-view 中
     * scrollHeight > clientHeight 的那个）。
     * ⚠️ 限定在 `.sidebar` 内：整个组件里右侧主列表也可滚，从 root 找会误选到它。
     * ⚠️ 直接驱动 DOM 滚动，而不是只靠 `scroll-top` 绑定 —— 实测该绑定在这个
     *    「底部弹层 + 侧栏」嵌套结构里不生效（内层元素纹丝不动）。
     */
    const scroller = getScrollEl('.sidebar');

    q.exec((res: any[]) => {
      const container = res?.[0];
      const items = res?.[1] || [];
      const it = items[idx];
      if (!container || !it) return;
      const vh = container.height ?? 0;
      /*
       * 当前滚动量用**实测值** scroller.scrollTop：设定值可能被边界 clamp、
       * 也滞后于动画，用它会累积偏差（实测 ±70px）。
       */
      const cur = scroller ? scroller.scrollTop : 0;
      // 该项相对内容顶部的偏移 = 相对视口 top − 容器 top + 当前滚动量
      const offsetInContent = it.top - container.top + cur;
      /*
       * ⚠️ 上界必须 clamp 到 maxScroll：只 clamp 下界（Math.max(0,…)）时，
       *    靠近底部的分类算出的 target 会**超过最大可滚值** —— 动画每帧设一个
       *    超范围值、浏览器再把它夹回去，表现为"明明到底了却每点一次抖一下"。
       */
      const maxScroll = scroller ? scroller.scrollHeight - scroller.clientHeight : 0;
      const target = Math.min(maxScroll, Math.max(0, offsetInContent + it.height / 2 - vh / 2));
      if (scroller) animateSidebarScroll(scroller, cur, target);
    });
  });
}

/** 点击左侧 → 右侧定位到该分组 */
function selectKey(key: string) {
  activeKey.value = key;
  // 抑制窗口：右侧平滑滚动的这几百毫秒内不反推高亮（见 onMainScroll 注释）
  suppressScrollSyncUntil = Date.now() + 600;
  mainIntoView.value = '';
  nextTick(() => {
    mainIntoView.value = `group-anchor-${key}`;
  });
  /*
   * 左侧自身也要滚：把刚点中的项滚到竖直中央。
   * ⚠️ 不调的话，点靠下的一级分类（如「人情往来」）时它贴着/超出侧栏底边，
   *    而右侧滚动被上面的抑制窗口挡着 —— 左侧就完全不动（实测反馈）。
   */
  scrollSidebarTo(key);
}

/**
 * 选中一个二级分类。
 *
 * ⚠️ **左侧高亮跟着"用户从哪个组点的"走**（luchao 确认）——
 *    从「最近使用」组点的 → 高亮「最近使用」；从某个一级组点的 → 高亮那个一级。
 *    同一个二级分类（如「手机费」）在最近使用组和一级组里各出现一次，
 *    用户从哪点，就高亮哪边（而不是永远跳到"所属一级"）。
 *
 * @param fromKey 点它的那个组的 key（'recent' 或一级 id）；搜索结果传所属一级
 */
function pick(item: CategoryItem, fromKey?: string | null) {
  if (!item.parentId) return;
  saveRecent(item.id);
  if (fromKey) activeKey.value = fromKey;
  emit('update:modelValue', item.id);
  emit('update:visible', false);
}

function toggleSearch() {
  searching.value = !searching.value;
  keyword.value = '';
  if (!searching.value) {
    nextTick(() => measureAnchors());
  }
}

function onCreateChild() {
  const key = activeKey.value;
  const parent = roots.value.find((r) => r.id === key);
  if (!parent) {
    uni.showToast({ title: '请先在左侧选择一个分类', icon: 'none' });
    return;
  }
  /*
   * 跳转到「新建分类」页去建二级分类（带 parentId + type）。
   * 不在弹层里内联输入：新建页有图标选择等完整能力，体验更一致；
   * 返回后由宿主页 onShow 重新拉分类列表（见 record/index.vue）。
   */
  uni.navigateTo({
    url: `/pages/category-new/index?parentId=${parent.id}&type=${props.type}`,
  });
}

function close() {
  emit('update:visible', false);
}

/**
 * 打开时定位左侧高亮（仅首次打开时调用，见 watch visible）。
 *
 * 规则（luchao 确认）：
 *   · 当前选中的分类**在最近使用里** → 高亮「最近使用」（初次进入的默认态）
 *   · 否则 → 高亮它所属的一级分类
 *   · 都没有 → 回退到「最近使用」或第一个一级
 */
function syncActiveOnOpen() {
  const picked = categoryStore.byId(props.modelValue);
  const inRecent = !!picked && recentItems.value.some((r) => r.id === picked.id);
  const targetKey = inRecent
    ? RECENT_KEY_ANCHOR
    : picked?.parentId && roots.value.some((r) => r.id === picked.parentId)
      ? picked.parentId
      : recentItems.value.length
        ? RECENT_KEY_ANCHOR
        : (roots.value[0]?.id ?? RECENT_KEY_ANCHOR);
  activeKey.value = targetKey;
}

/*
 * 是否已经为本次「记一笔」定位过。
 *
 * ⚠️ 只在**首次打开**时定位（syncActiveOnOpen + 滚动）；此后再点开/关闭
 *    都**保持用户浏览到的位置**，不重新定位（luchao 要求）。
 *    组件随 record 页重建（重进记一笔）或切换收支类型时复位。
 */
let positioned = false;

watch(
  () => props.visible,
  async (v) => {
    if (!v) return;
    loadRecent();
    searching.value = false;
    keyword.value = '';

    /*
     * 已定位过：保持用户浏览到的位置。
     * 弹窗用 v-show（不是 v-if），DOM 与滚动位置在关闭时都保留 ——
     * 所以这里直接 return 即可，无需手动恢复 scrollTop。
     */
    if (positioned) return;
    positioned = true;
    syncActiveOnOpen();

    // 等弹窗与列表渲染完再测量，并把右侧滚到当前一级、左栏选中项居中
    await nextTick();
    setTimeout(async () => {
      await measureAnchors();
      mainIntoView.value = '';
      nextTick(() => {
        mainIntoView.value = `group-anchor-${activeKey.value}`;
      });
      scrollSidebarTo(activeKey.value);
    }, 120);
  },
  { immediate: true },
);

// 切换收支类型：分类完全变了，定位复位（下次打开重新定位到「最近使用」/一级）
watch(
  () => props.type,
  () => {
    positioned = false;
  },
);

// 分类结构变化（如新建二级后）重新测量。
// 注意要 watch 一个稳定的字符串签名：groups 是 computed，每次求值都是新数组，
// 直接 watch(groups) 会频繁触发测量。
watch(
  () => groups.value.map((g) => `${g.root.id}:${g.children.length}`).join(','),
  () => {
    if (props.visible && !searching.value) {
      setTimeout(() => measureAnchors(), 60);
    }
  },
);
</script>

<style scoped lang="scss">
.mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 1200;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.sheet {
  background: $v11-bg-card;
  border-radius: 16px 16px 0 0;
  height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 顶部工具条 */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid $v11-line;
  flex-shrink: 0;
}

.tools {
  display: flex;
  align-items: center;
}

.tool {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 8px;
}

.tool:active {
  background: $v11-bg-inset;
}

.tool-icon {
  color: $v11-text-secondary;
}

.collapse {
  color: $v11-text-secondary;
}

.search-bar {
  padding: 8px 16px;
  border-bottom: 1px solid $v11-line;
  flex-shrink: 0;
}

.search-input {
  height: 36px;
  background: $v11-bg-inset;
  border-radius: 8px;
  padding: 0 12px;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
}

.search-result {
  flex: 1;
  padding: 12px;
}

/* 左右联动主体 */
.content {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative; /* 自绘滚动条的定位基准 */
}

.sidebar {
  width: 92px;
  background: $v11-bg-inset;
  height: 100%;
  flex-shrink: 0;
  /* 隐藏滚动条（Firefox / 旧 IE） */
  scrollbar-width: none;
}

/* 隐藏左侧边栏滚动条：uni-app H5 的 scroll-view 内部容器才有 overflow，
   scoped 样式需要 :deep 穿透 */
.sidebar :deep(::-webkit-scrollbar) {
  display: none;
  width: 0;
  height: 0;
}

/* 右侧滚动条由自绘的 .scrollbar 呈现，
   原生滚动条沿用 App.vue 的全局隐藏规则，避免出现两根 */
.scrollbar {
  position: absolute;
  right: 2px;
  width: 4px;
  min-height: 4px;
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.18);
  /* 纯位置指示器，不拦截点击/滚动 */
  pointer-events: none;
  z-index: 5;
  transition: top 0.08s linear;
}

.side-item {
  padding: 15px 10px;
  position: relative;
}

.side-item.active {
  background: $v11-bg-card;
}

.side-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 13px;
  bottom: 13px;
  width: 3px;
  background: $v11-gold-fill;
  border-radius: 0 2px 2px 0;
}

.side-text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $v11-text-secondary;
}

.side-item.active .side-text {
  color: $v11-gold;
  font-weight: $weight-medium;
}

.main {
  flex: 1;
  height: 100%;
  padding: 12px 12px 32px;
}

.group {
  margin-bottom: 20px;
}

.group-title {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $v11-text-secondary;
  display: block;
  margin-bottom: 10px;
}

.grid {
  display: flex;
  flex-wrap: wrap;
  /*
   * ⚠️ 必须 flex-start：默认的 stretch 会把每格拉到"本行最高格"的高度 ——
   *    一行里只要有一个两行名的分类（如「水电煤气宽带」），同行的单行名格子
   *    也会被撑到同样高，选中卡片就会在名称下方拖出一块空白。参考图里
   *    卡片是**贴合自身内容**的（单行名卡片明显比两行名格子矮）。
   */
  align-items: flex-start;
}

/*
 * 分类格：**图标 + 名称直排，不套背板**（2026-09-19 按参考图改版）。
 *
 * 旧版给图标套了一个 46px 灰底圆形：与设计文档 §6.3「圆形只给头像与环形图」相悖，
 * 也把彩色图标的体量感压没了。参考图的做法是图标直接落在卡片上，
 * 由**尺寸**（40px，旧版 24px 明显偏小）与**间距**承担体量感。
 * 选中信号整体上移到"格子本身"（见 .picked）——旧版"灰底圆 + 2px 金圈 + 金字"一并撤掉。
 */
.grid-item {
  width: 25%;
  display: flex;
  flex-direction: column;
  align-items: center;
  /*
   * 内边距与行距**拆成两段**：padding 保证选中卡片里图标不贴边，
   * margin 承担卡片之间的缝（6 + 4 + 6 ≈ 参考图 16px 行距）。
   */
  padding: 6px 2px;
  margin-bottom: 4px;
  border-radius: 14px;
  /* 透明描边占位：选中时才上色，避免选中瞬间整格尺寸跳动 */
  border: 1px solid transparent;
}

/*
 * 选中态：奶油底卡片 + 暖色发丝描边 + 名称加粗（三重信号，不只靠颜色）。
 *
 * ⚠️ 描边不能省：$v11-gold-soft 压白卡只有 **1.07** 的亮度差（token 文档原话
 *    "白卡上等于不存在"）—— 只铺底色等于没标。描边色沿用首页 hero 分隔线的
 *    同一款金色发丝线（rgba(143,83,18,.18)）；参考图里卡片边缘同样有浅暖描边。
 */
.grid-item.picked {
  background: $v11-gold-soft;
  border-color: rgba(143, 83, 18, 0.18);
}

/*
 * 窄屏（<360px）：侧栏收窄 + 面板内边距收紧。
 *
 * 320px 下 4 列格子只有 ~51px，4 个字的名字（12px = 48px）放不下，
 * 会断成「日常用 / 品」这种难看的 3+1 —— 收窄侧栏（92→80）与面板内边距后
 * 单行可容纳 4 字（参考图在 402px 下同样是"4 字一行"）。
 * ⚠️ 只改布局、**不缩字号**：$font-caption 12px 是中文硬下限（token 文档）。
 */
@media (max-width: 359px) {
  .sidebar {
    width: 80px;
  }

  .main {
    padding: 12px 8px 32px;
  }
}

.icon {
  /* 单色分类图标压白卡 15.85:1 ✅（无背板后不再需要"选中变金字"那一档） */
  color: $v11-text-primary;
}

/* 名称：参考图实测文字色 #222226 —— 即 $v11-text-primary（旧版用次级灰，弱一档） */
.name {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-primary;
  /*
   * ⚠️ **不要加 margin-top**（luchao 2026-09-19 定）：
   *    图标是 40px 画布、墨迹只占约一半，视觉间距本来就够；
   *    再加 6px 会让"图标—名称"之间空掉一截、卡片显得松散。
   */
  text-align: center;
}

.picked .name {
  font-weight: $weight-medium;
}

.empty,
.empty-inline {
  padding: 20px 0;
  text-align: center;
}

.empty {
  padding: 32px 0;
}

.empty-text {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
  line-height: $lh-caption;
}
</style>
