<template>
  <view v-if="visible" class="mask" @click="close">
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
              @click="pick(item)"
            >
              <view class="icon-box" :class="{ 'icon-picked': item.id === modelValue }">
                <CategoryIcon class="icon" :name="item.icon" :size="24" />
              </view>
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
          :scroll-into-view="sideIntoView"
          scroll-with-animation
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
                :class="{ picked: item.id === modelValue }"
                @click="pick(item)"
              >
                <view class="icon-box" :class="{ 'icon-picked': item.id === modelValue }">
                  <CategoryIcon class="icon" :name="item.icon" :size="24" />
                </view>
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
                :class="{ picked: item.id === modelValue }"
                @click="pick(item)"
              >
                <view class="icon-box" :class="{ 'icon-picked': item.id === modelValue }">
                  <CategoryIcon class="icon" :name="item.icon" :size="24" />
                </view>
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
const searching = ref(false);
const keyword = ref('');
const recentIds = ref<string[]>([]);

/** 点击左侧时用于触发右侧定位 */
const mainIntoView = ref('');
/** 滚动反推时用于触发左侧定位（让左栏跟随高亮项滚动） */
const sideIntoView = ref('');

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

/** 滚动右侧 → 反推当前应当高亮的左侧项 + 更新自绘滚动条位置 */
function onMainScroll(e: any) {
  const detail = e?.detail ?? {};
  mainScrollTop.value = detail.scrollTop ?? 0;
  if (detail.scrollHeight) mainContentH.value = detail.scrollHeight;

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
  // 左栏跟随滚动，保证高亮项始终可见
  sideIntoView.value = '';
  nextTick(() => {
    sideIntoView.value = `side-anchor-${key}`;
  });
}

/** 点击左侧 → 右侧定位到该分组 */
function selectKey(key: string) {
  activeKey.value = key;
  mainIntoView.value = '';
  nextTick(() => {
    mainIntoView.value = `group-anchor-${key}`;
  });
}

/** 只能选二级分类：一级只用来切换分组 */
function pick(item: CategoryItem) {
  if (!item.parentId) return;
  saveRecent(item.id);
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
  uni.showModal({
    title: `在「${parent.name}」下新建`,
    editable: true,
    placeholderText: '输入二级分类名称',
    success: async (res) => {
      if (!res.confirm) return;
      const name = (res.content || '').trim();
      if (!name) return;
      try {
        await categoryStore.add({
          name,
          type: props.type,
          icon: 'cat-misc',
          parentId: parent.id,
        });
        await measureAnchors();
        uni.showToast({ title: '已新建', icon: 'success' });
      } catch (err) {
        console.error('[CategoryPicker] 新建失败', err);
      }
    },
  });
}

function close() {
  emit('update:visible', false);
}

/** 打开时定位到当前已选分类所属的一级 */
function syncActiveOnOpen() {
  const picked = categoryStore.byId(props.modelValue);
  const targetKey =
    picked?.parentId && roots.value.some((r) => r.id === picked.parentId)
      ? picked.parentId
      : recentItems.value.length
        ? RECENT_KEY_ANCHOR
        : (roots.value[0]?.id ?? RECENT_KEY_ANCHOR);
  activeKey.value = targetKey;
}

watch(
  () => props.visible,
  async (v) => {
    if (!v) return;
    loadRecent();
    searching.value = false;
    keyword.value = '';
    syncActiveOnOpen();

    // 等弹窗与列表渲染完再测量，并用 scroll-into-view 把右侧滚到当前一级
    await nextTick();
    setTimeout(async () => {
      await measureAnchors();
      mainIntoView.value = '';
      nextTick(() => {
        mainIntoView.value = `group-anchor-${activeKey.value}`;
      });
    }, 120);
  },
  { immediate: true },
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
}

.grid-item {
  width: 25%;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 16px;
}

.icon-box {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: $v11-bg-inset;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

/* 选中图标：与 CategoryGrid 的 .icon-active 同一套处理 ——
   浅金底（压白卡仅 1.07 可见）+ 2px 金色描边承担选中信号。不要去掉描边。 */
.icon-picked {
  background: $v11-gold-soft;
  border: 2px solid $v11-gold;
}

.icon {
  /* 压 $v11-bg-inset(#EEF1F5) 13.93:1 */
  color: $v11-text-primary;
}

.icon-picked .icon {
  /* 压 $v11-gold-soft(#FDF6EF) 4.55:1 ✅ */
  color: $v11-gold;
}

.name {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
  margin-top: 6px;
  text-align: center;
  line-height: $lh-caption;
}

.picked .name {
  color: $v11-gold;
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
