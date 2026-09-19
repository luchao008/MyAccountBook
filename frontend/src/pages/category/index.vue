<template>
  <view class="page">
    <!-- ═══ 顶部栏：普通态（返回 / 标题 / 搜索）═══ -->
    <view v-if="!batchMode && !sortMode" class="navbar">
      <view class="nav-btn" @click="goBack">
        <SvgIcon name="icon-chevron-left" :size="20" />
      </view>
      <text class="nav-title">{{ typeLabel }}分类管理</text>
      <view class="nav-btn" @click="searching = !searching">
        <SvgIcon :name="searching ? 'icon-close' : 'icon-search'" :size="20" />
      </view>
    </view>

    <!-- ═══ 顶部栏：批量态（取消 / 选择XX分类 / 全选）═══ -->
    <view v-else-if="batchMode" class="navbar">
      <text class="nav-action" @click="exitBatch">取消</text>
      <text class="nav-title">选择{{ typeLabel }}分类</text>
      <text class="nav-action" @click="toggleAll">{{ allSelected ? '取消全选' : '全选' }}</text>
    </view>

    <!-- ═══ 顶部栏：排序态（取消 / 标题 / 占位）═══ -->
    <view v-else class="navbar">
      <text class="nav-action" @click="exitSort">取消</text>
      <text class="nav-title">{{ typeLabel }}分类排序</text>
      <text class="nav-action" />
    </view>

    <!--
      排序态说明条。
      「点完成才提交」这个约定必须写出来 —— 否则用户会以为松手就存了，
      直接点取消，改动全丢。
    -->
    <view v-if="sortMode" class="sort-hint">
      <text class="sort-hint-text">按住右侧把手上下拖动排序；点「完成」保存，点「取消」放弃</text>
    </view>

    <!-- 搜索条：点放大镜展开（批量态 / 排序态的顶栏被占满，不显示） -->
    <view v-if="searching && !batchMode && !sortMode" class="search-bar">
      <SvgIcon class="search-icon" name="icon-search" :size="16" />
      <input
        v-model="keyword"
        class="search-input"
        placeholder="搜索分类名称"
        confirm-type="search"
      />
    </view>

    <!--
      list-inner 是**测量用的内容壳**：拖动时要算 maxScroll（内容高 − 可视高），
      而 scroll-view 自身的 boundingClientRect 给的是可视框、不是内容高。
      多套一层就能一次量到两个数。
    -->
    <scroll-view
      class="list"
      scroll-y
      :scroll-top="listScrollTop"
      @scroll="onListScroll"
    >
      <view class="list-inner">
        <EmptyState
          v-if="!displayRoots.length"
          icon="icon-tag"
          :text="keyword ? '没有匹配的分类' : '还没有分类，在下面新建一个吧'"
        />

        <view v-for="root in displayRoots" :key="root.id" class="group">
          <!-- 一级分类行 -->
          <view
            :id="'row-' + root.id"
            class="row root-row"
            :class="{ 'row-dragging-source': drag.id === root.id }"
            @click="onRootRowClick(root)"
          >
            <SvgIcon
              class="caret"
              :class="{ open: isExpanded(root.id) }"
              name="icon-chevron-down"
              :size="14"
            />
            <CategoryIcon :name="root.icon" :size="24" />
            <text class="root-name" :class="{ dimmed: root.isHidden }">{{ root.name }}</text>
            <text v-if="root.isHidden" class="hidden-tag">已隐藏</text>
            <view class="row-tail">
              <view v-if="batchMode" class="check" :class="{ on: isPicked(root.id) }">
                <SvgIcon v-if="isPicked(root.id)" name="icon-check" :size="14" />
              </view>
              <view
                v-else-if="sortMode"
                class="grip"
                @touchstart.stop="onGripStart($event, root, null)"
                @mousedown.stop="onGripStart($event, root, null)"
              >
                <SvgIcon name="icon-grip" :size="20" />
              </view>
              <view v-else class="icon-btn" @click.stop="goEdit(root)">
                <SvgIcon name="icon-pencil" :size="18" />
              </view>
            </view>
          </view>

          <!-- 二级分类 -->
          <view v-if="isExpanded(root.id)" class="children">
            <view
              v-for="child in displayChildrenOf(root.id)"
              :key="child.id"
              :id="'row-' + child.id"
              class="row child-row"
              :class="{ 'row-dragging-source': drag.id === child.id }"
              @click="batchMode && togglePick(child.id)"
            >
              <!-- image-scale=2：图片图标是位图插画，同尺寸下观感偏小（2026-09-19 luchao 要求翻倍） -->
              <CategoryIcon :name="child.icon" :size="20" :image-scale="2" />
              <text class="child-name" :class="{ dimmed: child.isHidden }">{{ child.name }}</text>
              <text v-if="child.isHidden" class="hidden-tag">已隐藏</text>
              <view class="row-tail">
                <view v-if="batchMode" class="check" :class="{ on: isPicked(child.id) }">
                  <SvgIcon v-if="isPicked(child.id)" name="icon-check" :size="14" />
                </view>
                <view
                  v-else-if="sortMode"
                  class="grip"
                  @touchstart.stop="onGripStart($event, child, root.id)"
                  @mousedown.stop="onGripStart($event, child, root.id)"
                >
                  <SvgIcon name="icon-grip" :size="20" />
                </view>
                <view v-else class="icon-btn" @click.stop="goEdit(child)">
                  <SvgIcon name="icon-pencil" :size="18" />
                </view>
              </view>
            </view>

            <view
              v-if="!batchMode && !sortMode && !keyword"
              class="add-child"
              @click="goAddChild(root)"
            >
              <SvgIcon class="add-child-icon" name="icon-plus" :size="14" />
              <text class="add-child-text">新建二级分类</text>
            </view>
          </view>
        </view>

        <view class="list-tail" />
      </view>
    </scroll-view>

    <!--
      拖动浮层：**必须放在 scroll-view 外面**。
      scroll-view 在 H5 上是 overflow 容器，放在里面的行一旦 translate 出边界就会被裁掉
      （拖到列表顶部/底部时整行消失）。所以被拖的行在流内隐藏（占位不塌），
      由这个固定定位的浮层来跟随手指。
    -->
    <view
      v-if="drag.id && drag.item"
      class="drag-ghost"
      :class="drag.parentId === null ? 'drag-ghost-root' : 'drag-ghost-child'"
      :style="{ top: drag.fixedTop + drag.dy + 'px' }"
    >
      <SvgIcon
        v-if="drag.parentId === null"
        class="caret open"
        name="icon-chevron-down"
        :size="14"
      />
      <!-- 与列表行一致：二级用 image-scale=2，一级（emoji）保持原样 -->
      <CategoryIcon
        :name="drag.item.icon"
        :size="drag.parentId === null ? 24 : 20"
        :image-scale="drag.parentId === null ? 1 : 2"
      />
      <text :class="drag.parentId === null ? 'root-name' : 'child-name'">
        {{ drag.item.name }}
      </text>
      <view class="row-tail">
        <view class="grip"><SvgIcon name="icon-grip" :size="20" /></view>
      </view>
    </view>

    <!--
      落点提示线。
      用 position: fixed 是因为量出来的行位置本来就是**视口坐标**；
      换成列表内绝对定位反而要把滚动量减回去，多一个出错点。
    -->
    <view
      v-if="dropLineTop !== null"
      class="drop-line"
      :style="{ top: dropLineTop + 'px' }"
    />

    <!-- ═══ 底部固定栏 ═══ -->
    <view class="bottom-bar">
      <!--
        普通态：三格图标栅格（排序 / 批量操作 / 新建分类）。
        与批量态共用同一套 .batch-act 样式 —— 三种模式的底栏高度因此完全一致，
        切换时页面不会上下跳。
      -->
      <template v-if="!batchMode && !sortMode">
        <view class="batch-act" @click="enterSort">
          <view class="batch-act-icon"><SvgIcon name="icon-sort" :size="22" /></view>
          <text class="batch-act-label">排序</text>
        </view>
        <view class="batch-act" @click="enterBatch">
          <view class="batch-act-icon"><SvgIcon name="icon-list-check" :size="22" /></view>
          <text class="batch-act-label">批量操作</text>
        </view>
        <view class="batch-act" @click="goAddRoot">
          <view class="batch-act-icon"><SvgIcon name="icon-plus" :size="22" /></view>
          <text class="batch-act-label">新建分类</text>
        </view>
      </template>

      <!-- 排序态：单个「完成」。min-height 与图标栅格对齐，高度不跳 -->
      <template v-else-if="sortMode">
        <view class="sort-done" :class="{ disabled: saving }" @click="onSortDone">
          <text class="sort-done-text">{{ saving ? '保存中…' : '完成' }}</text>
        </view>
      </template>

      <!-- 批量态：三个操作。按选中项的实际状态自动禁用不适用的那个 -->
      <template v-else>
        <view
          class="batch-act"
          :class="{ disabled: !canDelete }"
          @click="onBatchDelete"
        >
          <view class="batch-act-icon"><SvgIcon name="icon-trash" :size="22" /></view>
          <text class="batch-act-label">删除</text>
        </view>
        <view class="batch-act" :class="{ disabled: !canHide }" @click="onBatchHide(true)">
          <view class="batch-act-icon"><SvgIcon name="icon-eye-off" :size="22" /></view>
          <text class="batch-act-label">隐藏</text>
        </view>
        <view class="batch-act" :class="{ disabled: !canUnhide }" @click="onBatchHide(false)">
          <view class="batch-act-icon"><SvgIcon name="icon-eye" :size="22" /></view>
          <text class="batch-act-label">恢复显示</text>
        </view>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 分类管理。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 与「参考图」有关的取舍（写在这里免得下次有人以为是漏做）：
 *
 * ① **收支类型是页面级参数**（\`?type=expense|income\`），页内不再放支出/收入开关。
 *    类型属于「你从哪进来的」，不属于「进来之后还能切」。
 *
 * ② **拖拽手柄只在「排序」态出现**。普通态每行右侧仍是铅笔编辑 ——
 *    手柄与编辑入口**不共存**：参考图把两者塞在同一行，但那要求用户先分辨
 *    「哪个是拖、哪个是点」，而这两件事的手势（按住拖 vs 轻点）完全不同。
 *    用模式切换把它们分开，普通态永远不会被误拖。
 *
 * ③ **每行保留编辑入口**（普通态）。「改名 / 换图标」无法用批量操作表达，
 *    去掉会让这个能力彻底没有入口。编辑复用「新建分类」页（\`?id=xxx\`）。
 * ────────────────────────────────────────────────────────────────────────
 *
 * 排序的九条设计决定（2026-09-17，逐条与 luchao 确认过）：
 *
 *   D1 按住把手**立刻**进入拖动（不做长按等待）。
 *   D2 排序态默认**全部折叠** —— 让「屏幕上只有正在排的那一层」成为不变式。
 *   D3 拖到列表边缘时**自动滚动**。
 *   D4 拖动只改本地，点「完成」才**统一提交**（所以顶栏必须有「取消」）。
 *   D5 跨层级提交是串行的，**遇错即停、已成功的保留**，提示说清哪层没存。
 *   D6 拖动中列表**不重排**，用一条落点提示线表示「松手后会插在哪」。
 *   D7 一级与二级把手**共存**，但一次只展开一个组。
 *   D8 排序态**点一级行**展开/折叠（展开新的自动收起旧的）。
 *   D9 开始拖一级时**自动收起**它的二级 —— 让「被拖的永远是一个单行」成立。
 * ────────────────────────────────────────────────────────────────────────
 */
import { ref, reactive, computed, getCurrentInstance, nextTick } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import EmptyState from '@/components/EmptyState.vue';
import SvgIcon from '@/components/SvgIcon.vue';
import CategoryIcon from '@/components/CategoryIcon.vue';
import { useCategoryStore } from '@/store/category';
import type { CategoryItem } from '@/api/category';

const categoryStore = useCategoryStore();

/** \`uni.createSelectorQuery().in()\` 需要一个组件实例才能限定查询范围 */
const instance = getCurrentInstance();

const type = ref<'income' | 'expense'>('expense');
const typeLabel = computed(() => (type.value === 'income' ? '收入' : '支出'));

/** 批量模式 */
const batchMode = ref(false);
const selected = ref<string[]>([]);

/** 排序模式 */
const sortMode = ref(false);
/** 提交中：禁用「完成」防重复提交 */
const saving = ref(false);

/** 展开的一级分类 id 集合 */
const expanded = ref<string[]>([]);

/** 搜索（仅普通态可用：批量态 / 排序态的顶栏被占满） */
const searching = ref(false);
const keyword = ref('');

const rootsRaw = computed(() =>
  type.value === 'expense' ? categoryStore.expenseRoots : categoryStore.incomeRoots
);

const filteredRoots = computed(() => {
  const kw = keyword.value.trim();
  if (!kw) return rootsRaw.value;
  return rootsRaw.value.filter((r) => r.name.includes(kw));
});

/* ══════════════════════════════════════════════════════════════════════
 * 待提交的排序（D4）
 *
 * 拖动**不直接改 store** —— store 是服务端数据的缓存，往里写「还没落库的顺序」
 * 会让别处读到脏数据（「记一笔」的分类选择器也读它）。
 * 所以改的是这一层「待提交覆盖」：层级 key → 该层级的目标 id 顺序。
 * 点「完成」时才逐层提交，点「取消」直接丢掉。
 * ══════════════════════════════════════════════════════════════════════ */
const pendingOrders = ref<Record<string, string[]>>({});

/** 层级 key：一级层用固定串，二级层用它父的 id */
function levelKey(parentId: string | null): string {
  return parentId ?? '__root__';
}

/** 把待提交顺序应用到一份列表上；没有待提交就原样返回 */
function applyPending(list: CategoryItem[], parentId: string | null): CategoryItem[] {
  const order = pendingOrders.value[levelKey(parentId)];
  if (!order) return list;
  const pos = new Map(order.map((id, i) => [id, i]));
  return [...list].sort((a, b) => {
    const pa = pos.has(a.id) ? pos.get(a.id)! : Number.MAX_SAFE_INTEGER;
    const pb = pos.has(b.id) ? pos.get(b.id)! : Number.MAX_SAFE_INTEGER;
    return pa - pb;
  });
}

/**
 * 列表实际渲染的一级分类。
 *
 * 排序态**忽略搜索词**（进排序态时已把搜索关掉）：提交时后端要求 ids 是该层级的
 * **全集**，拿一份被搜索过滤过的子集去排会被 40013 拒绝。
 */
const displayRoots = computed(() => applyPending(filteredRoots.value, null));

/** 组内的二级分类：搜索时不做二级过滤（命中一级就展示整组，避免「搜到一级却看不到内容」） */
function displayChildrenOf(parentId: string): CategoryItem[] {
  return applyPending(categoryStore.childrenOf(parentId), parentId);
}

/** 该层级当前的全部 id（顺序即屏幕顺序，已含待提交改动） */
function levelIds(parentId: string | null): string[] {
  const list = parentId ? categoryStore.childrenOf(parentId) : rootsRaw.value;
  return applyPending(list, parentId).map((c) => c.id);
}

/* ── 批量态 ── */

/** 当前列表里全部分类的 id（用于「全选」） */
const allIds = computed(() => {
  const ids: string[] = [];
  for (const r of filteredRoots.value) {
    ids.push(r.id);
    for (const c of categoryStore.childrenOf(r.id)) ids.push(c.id);
  }
  return ids;
});

const allSelected = computed(
  () => allIds.value.length > 0 && allIds.value.every((id) => selected.value.includes(id))
);

/** 选中的分类实体（含隐藏状态，用于判断三个操作各自是否可用） */
const selectedItems = computed(() =>
  selected.value.map((id) => categoryStore.byId(id)).filter((c): c is CategoryItem => !!c)
);

const canDelete = computed(() => selectedItems.value.length > 0);
/**
 * 三个按钮**按选中项的实际状态自动禁用**，而不是点了没反应。
 * 选中的全是已隐藏分类时，「隐藏」禁用；全是可见的时，「恢复显示」禁用。
 * 混合选中时两个都可用 —— 各自只作用于状态匹配的那部分。
 */
const canHide = computed(() => selectedItems.value.some((c) => !c.isHidden));
const canUnhide = computed(() => selectedItems.value.some((c) => c.isHidden));

function isPicked(id: string): boolean {
  return selected.value.includes(id);
}

function isExpanded(id: string): boolean {
  return expanded.value.includes(id);
}

/** 普通态 / 批量态：默认展开全部一级分类，避免用户以为没有二级分类 */
function expandAll() {
  expanded.value = rootsRaw.value.map((r) => r.id);
}

function toggleGroup(id: string) {
  expanded.value = isExpanded(id)
    ? expanded.value.filter((x) => x !== id)
    : [...expanded.value, id];
}

/** 排序态专用（D8）：一次只展开一个组，展开新的自动收起旧的 */
function toggleGroupExclusive(id: string) {
  expanded.value = isExpanded(id) ? [] : [id];
}

function togglePick(id: string) {
  selected.value = isPicked(id)
    ? selected.value.filter((x) => x !== id)
    : [...selected.value, id];
}

function toggleAll() {
  selected.value = allSelected.value ? [] : [...allIds.value];
}

onLoad(async (opts?: Record<string, string>) => {
  type.value = opts?.type === 'income' ? 'income' : 'expense';
  // 分类管理页必须拿到**全量**（含已隐藏）——否则用户没有任何入口把隐藏的恢复回来。
  // store 缓存的本来就是全量，这里 force 一次是为了拿到别处改动后的最新状态。
  await categoryStore.load(true);
  expandAll();
});

function goBack() {
  uni.navigateBack();
}

function enterBatch() {
  batchMode.value = true;
  selected.value = [];
  searching.value = false;
  keyword.value = '';
  expandAll();
}

function exitBatch() {
  batchMode.value = false;
  selected.value = [];
}

/** 进入排序态（D2）：全部折叠、清掉搜索、丢掉上一轮的待提交改动 */
function enterSort() {
  sortMode.value = true;
  batchMode.value = false;
  selected.value = [];
  searching.value = false;
  keyword.value = '';
  expanded.value = [];
  pendingOrders.value = {};
}

/** 退出排序态 = 取消：丢掉全部待提交改动（D4）。拖动中 / 提交中不许退出 */
function exitSort() {
  if (drag.id || saving.value) return;
  sortMode.value = false;
  expanded.value = [];
  pendingOrders.value = {};
}

/* ══════════════════════════════════════════════════════════════════════
 * 拖动（D1 / D3 / D6 / D9）
 *
 * 几何模型，四条不变式（写清楚免得改坏）：
 *
 *   ① **被拖的永远是一个单行**。D9 在拖一级时先收起它的二级，
 *      所以不存在「拖一个七行的块」这种几何 —— 落点算法只有一套。
 *
 *   ② drag.fixedTop 是按下瞬间那一行的**视口 top，永不改变**。
 *      浮层位置 = fixedTop + dy，其中 dy = clientY - startClientY。
 *      也就是浮层**只跟手指**：自动滚动时手指不动，浮层就不动，
 *      列表在它下面滚 —— 这正是「拖」该有的手感。
 *
 *   ③ drag.rects 是各行**当前的**视口位置，随自动滚动而整体平移。
 *      落点判定拿浮层中心与它比较，所以滚动时手指不动、落点会自己往前走。
 *
 *   ④ 行位置**不做每帧重测**。滚动 s 像素 = 所有行的视口位置整体上移 s，
 *      所以自动滚动的每一步直接把 rects 平移即可 —— 精确且没有异步时序问题。
 *      （每帧 createSelectorQuery 会与渲染抢时序，那正是抖动的来源。）
 * ══════════════════════════════════════════════════════════════════════ */

/** 一个被测量的行：视口坐标下的上下边，用来判断落点下标 */
interface RowRect {
  id: string;
  top: number;
  bottom: number;
}

interface DragState {
  /** 正在拖的分类 id；空串 = 没在拖 */
  id: string;
  /** 正在拖的分类实体（浮层要渲染它） */
  item: CategoryItem | null;
  /** 所属层级：null = 一级分类层 */
  parentId: string | null;
  /** 按下时它在同层里的下标 */
  index: number;
  /** 当前落点下标（决定松手后插到哪） */
  targetIndex: number;
  /** 按下时的指针纵坐标 */
  startClientY: number;
  /** 最新指针纵坐标（自动滚动每帧要用） */
  clientY: number;
  /** 纯视觉位移：只影响浮层位置，不动数据 */
  dy: number;
  /** 按下瞬间那一行的视口 top（浮层定位基准，永不改变） */
  fixedTop: number;
  /** 行高的一半（落点判定用，量一次） */
  halfHeight: number;
  /** 各行当前的视口位置（随自动滚动整体平移） */
  rects: RowRect[];
  /** 列表可视区上下边（视口坐标），决定边缘触发的判定 */
  viewportTop: number;
  viewportBottom: number;
  /** 最大可滚动距离 = 内容高 − 可视高 */
  maxScroll: number;
}

const drag = reactive<DragState>({
  id: '',
  item: null,
  parentId: null,
  index: -1,
  targetIndex: -1,
  startClientY: 0,
  clientY: 0,
  dy: 0,
  fixedTop: 0,
  halfHeight: 0,
  rects: [],
  viewportTop: 0,
  viewportBottom: 0,
  maxScroll: 0,
});

/**
 * 拖动结束后的一小段时间内忽略行的 click。
 *
 * 为什么需要：把手在行内部，H5 上按住拖动松手后会照常合成一次 click
 * 冒泡到行上 → 触发展开/折叠，表现为「拖完顺手把组开关了一下」。
 * 300ms 远小于人再次点击的间隔、又大于 click 合成的延迟。
 */
let suppressClickUntil = 0;

/** 落点提示线的视口 top；没在拖、或落点就是原位时返回 null（不画） */
const dropLineTop = computed(() => {
  if (!drag.id || drag.targetIndex < 0) return null;
  if (drag.targetIndex === drag.index) return null;
  const rect = drag.rects[drag.targetIndex];
  if (!rect) return null;
  // 往下拖画在目标行**下边**、往上拖画在**上边** ——
  // 线所在的缝，就是松手后它会占据的那条缝。
  return drag.targetIndex > drag.index ? rect.bottom : rect.top;
});

/** 一级行的点击：排序态展开/折叠（D8）；普通态展开/折叠；批量态选中 */
function onRootRowClick(root: CategoryItem) {
  if (Date.now() < suppressClickUntil) return; // 刚拖完，这次 click 是合成的
  if (sortMode.value) {
    toggleGroupExclusive(root.id);
    return;
  }
  if (batchMode.value) {
    togglePick(root.id);
    return;
  }
  toggleGroup(root.id);
}

/**
 * 按下把手：进入拖动（D1 —— 立刻，不等长按）。
 *
 * 位置测量放在**按下这一瞬间**一次做完。之后整段手势里不再重测（见不变式 ④）。
 */
async function onGripStart(e: any, item: CategoryItem, parentId: string | null) {
  if (drag.id || saving.value) return;

  const point = e?.touches?.[0] ?? e?.changedTouches?.[0] ?? e;
  const clientY = Number(point?.clientY ?? 0);

  // D9：拖一级时先收起它下面的二级，让「被拖的永远是一个单行」成立。
  // 必须先收起再测量 —— 否则量到的是收起前的旧布局。
  if (parentId === null && expanded.value.length) {
    expanded.value = [];
    await nextTick();
  }

  const ids = levelIds(parentId);
  const index = ids.indexOf(item.id);
  if (index < 0) return;

  const geo = await measureDrag(ids);
  if (!geo) return; // 量不到就不进拖动：宁可没反应，也不要跳一下

  drag.id = item.id;
  drag.item = item;
  drag.parentId = parentId;
  drag.index = index;
  drag.targetIndex = index;
  drag.startClientY = clientY;
  drag.clientY = clientY;
  drag.dy = 0;
  drag.fixedTop = geo.rects[index].top;
  drag.halfHeight = (geo.rects[index].bottom - geo.rects[index].top) / 2;
  drag.rects = geo.rects;
  drag.viewportTop = geo.viewportTop;
  drag.viewportBottom = geo.viewportBottom;
  drag.maxScroll = geo.maxScroll;

  suppressClickUntil = Number.MAX_SAFE_INTEGER; // 拖动期间禁掉行的 click

  window.addEventListener('touchmove', onDragMove, { passive: false });
  window.addEventListener('touchend', onDragEnd);
  window.addEventListener('touchcancel', onDragEnd);
  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('mouseup', onDragEnd);
  if (!autoScrollTimer) autoScrollTimer = window.setInterval(autoScrollTick, 16);
}

/** 量：这些行的视口位置 + 列表可视框 + 内容高（算 maxScroll） */
async function measureDrag(ids: string[]) {
  return new Promise<{
    rects: RowRect[];
    viewportTop: number;
    viewportBottom: number;
    maxScroll: number;
  } | null>((resolve) => {
    const query = uni.createSelectorQuery().in(instance);
    ids.forEach((rowId) => query.select('#row-' + rowId).boundingClientRect());
    query.select('.list').boundingClientRect();
    query.select('.list-inner').boundingClientRect();
    query.exec((res: any[]) => {
      const rows = (res || []).slice(0, ids.length);
      const listRect = res?.[ids.length];
      const innerRect = res?.[ids.length + 1];

      const rects: RowRect[] = [];
      rows.forEach((rect, i) => {
        if (rect && typeof rect.top === 'number') {
          rects.push({ id: ids[i], top: rect.top, bottom: rect.bottom });
        }
      });

      if (rects.length !== ids.length || !listRect || !innerRect) {
        resolve(null);
        return;
      }
      resolve({
        rects,
        viewportTop: listRect.top,
        viewportBottom: listRect.bottom,
        maxScroll: Math.max(0, innerRect.height - listRect.height),
      });
    });
  });
}

/** 拖动中：更新视觉位移与落点（不含自动滚动，那是 tick 的事） */
function onDragMove(e: any) {
  if (!drag.id) return;
  // 阻止 scroll-view 跟着手指滚：否则列表滚动与被拖的行是两层位移，看着像乱跳。
  // 触摸事件在 touchstart 时 target 已固定，所以这里能拦住整段手势的默认滚动。
  if (e?.cancelable) e.preventDefault();

  const point = e?.touches?.[0] ?? e;
  const clientY = Number(point?.clientY ?? 0);
  if (!clientY) return;

  drag.clientY = clientY;
  drag.dy = clientY - drag.startClientY;
  updateTargetIndex();
}

/** 落点 = 浮层中心离哪一行的中线最近（rects 是各行的**当前位置**） */
function updateTargetIndex() {
  if (!drag.rects.length) return;
  const center = drag.fixedTop + drag.dy + drag.halfHeight;

  let next = drag.index;
  let best = Number.POSITIVE_INFINITY;
  drag.rects.forEach((rect, i) => {
    const mid = (rect.top + rect.bottom) / 2;
    const dist = Math.abs(center - mid);
    if (dist < best) {
      best = dist;
      next = i;
    }
  });
  drag.targetIndex = next;
}

/* ── 自动滚动（D3） ── */

/** 距列表边缘多少 px 内开始自动滚 */
const AUTO_SCROLL_EDGE = 72;
/** 每帧（约 16ms）最多滚多少 px */
const AUTO_SCROLL_MAX_SPEED = 14;

let autoScrollTimer = 0;
/** 列表真实滚动位置（@scroll 同步，自动滚动也写它） */
let scrollPos = 0;

function autoScrollTick() {
  if (!drag.id) return;

  const y = drag.clientY;
  let dir = 0;
  let depth = 0;

  if (y < drag.viewportTop + AUTO_SCROLL_EDGE) {
    dir = -1;
    depth = (drag.viewportTop + AUTO_SCROLL_EDGE - y) / AUTO_SCROLL_EDGE;
  } else if (y > drag.viewportBottom - AUTO_SCROLL_EDGE) {
    dir = 1;
    depth = (y - (drag.viewportBottom - AUTO_SCROLL_EDGE)) / AUTO_SCROLL_EDGE;
  }
  if (!dir) return;

  // 越靠边越快，但留一个下限（贴着边缘慢慢挪也比完全不动好）
  const speed = Math.max(2, Math.round(AUTO_SCROLL_MAX_SPEED * Math.min(1, depth)));
  const next = Math.min(Math.max(scrollPos + dir * speed, 0), drag.maxScroll);
  const applied = next - scrollPos;
  if (!applied) return; // 已经贴到边界了

  scrollPos = next;
  listScrollTop.value = next;

  // 不变式 ④：滚动 = 所有行的视口位置整体平移，不必重测
  drag.rects = drag.rects.map((r) => ({
    id: r.id,
    top: r.top - applied,
    bottom: r.bottom - applied,
  }));
  updateTargetIndex();
}

/** 松手：卸监听 → 把顺序写进待提交层（不落库，D4） */
function onDragEnd() {
  if (!drag.id) return;

  window.removeEventListener('touchmove', onDragMove);
  window.removeEventListener('touchend', onDragEnd);
  window.removeEventListener('touchcancel', onDragEnd);
  window.removeEventListener('mousemove', onDragMove);
  window.removeEventListener('mouseup', onDragEnd);
  if (autoScrollTimer) {
    clearInterval(autoScrollTimer);
    autoScrollTimer = 0;
  }

  const { parentId, index, targetIndex } = drag;

  // 先收干净拖动状态，再改数据 —— 否则浮层会在改动生效后还挂在手指位置
  drag.id = '';
  drag.item = null;
  drag.dy = 0;
  drag.rects = [];
  drag.index = -1;
  drag.targetIndex = -1;
  suppressClickUntil = Date.now() + 300;

  if (index === targetIndex || index < 0 || targetIndex < 0) return;

  const ids = levelIds(parentId);
  if (index >= ids.length || targetIndex >= ids.length) return;

  const next = [...ids];
  const [movedId] = next.splice(index, 1);
  next.splice(targetIndex, 0, movedId);

  pendingOrders.value = { ...pendingOrders.value, [levelKey(parentId)]: next };
}

/* ── 列表滚动 ── */

const listScrollTop = ref(0);

function onListScroll(e: any) {
  const top = Number(e?.detail?.scrollTop ?? 0);
  scrollPos = top;
  // 同步受控值：让下一次「程序化滚动」相对真实位置生效。
  // 值相同时框架不会真的滚动，所以不会形成回环。
  if (listScrollTop.value !== top) listScrollTop.value = top;
}

/* ── 提交（D4 / D5） ── */

/**
 * 点「完成」：逐层串行提交。
 *
 * D5：**遇错即停，已成功的保留**。所以失败时不能说笼统的「保存失败」——
 * 用户需要知道到底哪一层生效了、哪一层没有，否则他不知道该重试什么。
 */
async function onSortDone() {
  if (saving.value || drag.id) return;

  const entries = Object.entries(pendingOrders.value);
  if (!entries.length) {
    exitSort();
    return;
  }

  saving.value = true;
  let done = 0;
  let failedLabel = '';

  for (const [key, ids] of entries) {
    const parentId = key === '__root__' ? null : key;
    try {
      await categoryStore.reorder(type.value, parentId, ids);
      done += 1;
    } catch (err) {
      console.error('[category] 排序保存失败', err);
      failedLabel = parentId
        ? categoryStore.byId(parentId)?.name ?? '某组二级分类'
        : typeLabel.value + '一级分类';
      break;
    }
  }

  saving.value = false;
  pendingOrders.value = {};
  sortMode.value = false;
  expanded.value = [];

  if (failedLabel) {
    uni.showModal({
      title: '部分排序未保存',
      content: done
        ? '已保存 ' + done + ' 层；「' + failedLabel + '」保存失败，该层仍是原顺序。'
        : '「' + failedLabel + '」保存失败，排序未生效。',
      showCancel: false,
    });
    return;
  }
  uni.showToast({ title: '已保存 ' + done + ' 层排序', icon: 'none' });
}

/* ── 新建 / 编辑 ── */

/**
 * 新建 / 编辑都跳同一个页面：
 *   无 id 无 parentId → 新建一级
 *   有 parentId      → 新建二级
 *   有 id            → 编辑（名称 + 图标）
 */
function goAddRoot() {
  uni.navigateTo({ url: '/pages/category-new/index?type=' + type.value });
}

function goAddChild(root: CategoryItem) {
  uni.navigateTo({
    url: '/pages/category-new/index?parentId=' + root.id + '&type=' + root.type,
  });
}

function goEdit(item: CategoryItem) {
  uni.navigateTo({ url: '/pages/category-new/index?id=' + item.id });
}

/* ── 批量操作 ── */

/** 批量删除：提示里要区分「直接删的」和「被级联删掉的」 */
function onBatchDelete() {
  if (!canDelete.value) return;

  const items = selectedItems.value;
  const rootsPicked = items.filter((c) => !c.parentId);
  const pickedIds = new Set(items.map((c) => c.id));
  const loneChildren = items.filter((c) => c.parentId && !pickedIds.has(c.parentId));
  // 会被级联删掉的二级数量（与后端算法一致：仅统计「一级被选中」的那些组）
  const cascaded = rootsPicked.reduce(
    (n, r) => n + categoryStore.childrenOf(r.id).length,
    0
  );
  const direct = rootsPicked.length + loneChildren.length;

  uni.showModal({
    title: '删除分类',
    content:
      '将删除 ' +
      direct +
      ' 个分类' +
      (cascaded ? '，并连同其下 ' + cascaded + ' 个二级分类一并删除' : '') +
      '。相关账单会变为「未分类」，且无法撤销。',
    confirmText: '删除',
    confirmColor: '#D92D20',
    success: async (res) => {
      if (!res.confirm) return;
      try {
        const result = await categoryStore.batchRemove(selected.value);
        exitBatch();
        expandAll();
        uni.showToast({
          title: result.deletedChildren
            ? '已删除 ' + result.deleted + ' 个（含 ' + result.deletedChildren + ' 个二级）'
            : '已删除 ' + result.deleted + ' 个',
          icon: 'none',
        });
      } catch (err) {
        console.error('[category] 批量删除失败', err);
      }
    },
  });
}

/** 批量隐藏 / 恢复显示 */
async function onBatchHide(hidden: boolean) {
  if (hidden ? !canHide.value : !canUnhide.value) return;
  try {
    const result = await categoryStore.batchHide(selected.value, hidden);
    exitBatch();
    expandAll();
    uni.showToast({
      title: hidden
        ? '已隐藏 ' + result.updated + ' 个分类'
        : '已恢复 ' + result.updated + ' 个分类',
      icon: 'none',
    });
  } catch (err) {
    console.error('[category] 批量隐藏失败', err);
  }
}
</script>

<style scoped lang="scss">
/* 自绘顶栏 + 内部 scroll-view 滚动 ⇒ 容器必须有**确定高度**，
   min-height 下 flex 子项会按内容撑开、把底栏顶出屏幕（icon-picker 踩过） */
.page {
  height: $page-min-height;
  background: $v11-bg-page;
  display: flex;
  flex-direction: column;
}

/* ═══ 顶栏 ═══ */
.navbar {
  flex: none;
  height: 44px;
  display: flex;
  align-items: center;
  padding: 0 $space-3;
  border-bottom: 1px solid $v11-line;
}

.nav-btn {
  width: $touch-target-min;
  height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $v11-text-primary;
}

.nav-title {
  flex: 1;
  min-width: 0;
  text-align: center;
  font-size: $font-h2;
  line-height: $lh-h2;
  font-weight: $weight-semibold;
  color: $v11-text-primary;
}

.nav-action {
  min-width: 64px;
  text-align: center;
  padding: $space-2 0;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-gold;
}

/* ═══ 排序态说明条 ═══ */
.sort-hint {
  flex: none;
  padding: $space-2 $space-4;
  background: $v11-bg-inset;
}

.sort-hint-text {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
}

/* ═══ 搜索条 ═══ */
.search-bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: $space-2;
  padding: $space-2 $space-4;
  border-bottom: 1px solid $v11-line;
}

.search-icon {
  flex: none;
  color: $v11-text-secondary;
}

.search-input {
  flex: 1;
  min-width: 0;
  height: 36px;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-primary;
}

/* ═══ 列表 ═══ */
.list {
  flex: 1;
  min-height: 0;
}

.list-tail {
  height: 24px;
}

.group + .group {
  border-top: 8px solid $v11-bg-inset;
}

.row {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-3 $space-4;
  min-height: 56px;
}

.root-row {
  padding-left: $space-3;
}

.caret {
  flex: none;
  color: $v11-text-secondary;
  transition: transform 0.2s;
}

.caret.open {
  transform: rotate(180deg);
}

.root-name {
  flex: 1;
  min-width: 0;
  /* 折行而不是 ellipsis：×2 字号下「柴米油盐蔬菜瓜果」需要 224px 而只剩下约 217px，
     截断等于把分类名吃掉一截（WCAG 1.4.4）。行变高是正确的降级。 */
  overflow-wrap: anywhere;
  font-size: $font-body;
  line-height: $lh-body;
  font-weight: $weight-medium;
  color: $v11-text-primary;
}

.children {
  border-top: 1px solid $v11-line;
}

.child-row {
  padding-left: 46px;
  border-bottom: 1px solid $v11-line;
}

.child-name {
  flex: 1;
  min-width: 0;
  /* 折行而不是 ellipsis：×2 字号下「柴米油盐蔬菜瓜果」需要 224px 而只剩下约 217px，
     截断等于把分类名吃掉一截（WCAG 1.4.4）。行变高是正确的降级。 */
  overflow-wrap: anywhere;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $v11-text-secondary;
}

/* 隐藏态用换色而不是 opacity：文字加透明度会静默吃掉对比度 */
.dimmed {
  color: $v11-text-secondary;
}

.hidden-tag {
  flex: none;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $badge-neutral-text;
  background: $badge-neutral-bg;
  border-radius: $radius-sm;
  padding: 1px 6px;
}

.row-tail {
  flex: none;
  display: flex;
  align-items: center;
}

.icon-btn {
  width: $touch-target-min;
  height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $v11-text-secondary;
}

/*
 * 拖拽把手（只在排序态出现）。
 * touch-action: none 让浏览器知道「这里是拖、不是滚」——
 * 否则移动端会先按滚动处理，第一次 touchmove 就被当成滚动手势收走。
 */
.grip {
  width: $touch-target-min;
  height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $v11-text-disabled;
  touch-action: none;
}

.grip:active {
  color: $v11-gold;
}

/*
 * 拖动中的源行：用 visibility 而不是 display 隐藏 ——
 * 前者保留占位（列表不重排），后者会让下面的行整体上移一下，看着像跳。
 * 真正跟着手指的是 scroll-view 外面的 .drag-ghost。
 */
.row-dragging-source {
  visibility: hidden;
}

/* 拖动浮层：固定定位，不随列表滚动、也不会被 scroll-view 裁掉 */
.drag-ghost {
  position: fixed;
  left: 0;
  right: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-3 $space-4;
  min-height: 56px;
  background: $v11-bg-card;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
}

/* 与源行的左边距对齐：一级行 12px、二级行 46px */
.drag-ghost-root {
  padding-left: $space-3;
}

.drag-ghost-child {
  padding-left: 46px;
}

/* 落点提示线：横在「松手后它会占据的那条缝」上 */
.drop-line {
  position: fixed;
  left: 0;
  right: 0;
  height: 2px;
  z-index: 35;
  background: $v11-gold;
  pointer-events: none;
}

/* 选择框：24×24，选中后实心 + 白勾 */
.check {
  width: 24px;
  height: 24px;
  border-radius: $radius-sm;
  border: 1.5px solid $border-input;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-inverse;
}

.check.on {
  background: $v11-gold;
  border-color: $v11-gold;
}

.add-child {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $space-1;
  padding: $space-3 0;
  min-height: 44px;
}

.add-child-icon {
  color: $v11-gold;
}

.add-child-text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $v11-gold;
}

/* ═══ 底部固定栏 ═══ */
.bottom-bar {
  flex: none;
  display: flex;
  /*
   * ×2 字号下三格文案（「批量操作」「新建分类」各 4 字）在 320px 视口里
   * 每格只剩约 106px，正好卡住 → 允许换行作为兜底。
   * 正常字号下三格共需约 296px，320px 放得下，wrap 是 no-op。
   */
  flex-wrap: wrap;
  align-items: center;
  border-top: 1px solid $v11-line;
  background: $v11-bg-page;
  padding-bottom: env(safe-area-inset-bottom);
}

/*
 * 一格操作（图标 + 文案）。
 *
 * 普通态（排序 / 批量操作 / 新建分类）与批量态（删除 / 隐藏 / 恢复显示）
 * 共用这一套 —— 三种模式的底栏高度因此完全一致，切换时页面不上下跳。
 */
.batch-act {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $space-1;
  padding: $space-2 0 $space-3;
  min-height: 64px;
}

.batch-act-icon {
  width: 40px;
  height: 40px;
  border-radius: $radius-md;
  background: $v11-bg-inset;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $v11-text-primary;
}

.batch-act-label {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
}

/* 禁用态：换色而不是 opacity（同 .dimmed 的理由） */
.batch-act.disabled .batch-act-icon {
  color: $v11-text-disabled;
}

.batch-act.disabled .batch-act-label {
  color: $v11-text-disabled;
}

/* 排序态底栏的「完成」：min-height 与图标栅格对齐 */
.sort-done {
  flex: 1;
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sort-done-text {
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  font-weight: $weight-medium;
  color: $v11-gold;
}

.sort-done.disabled .sort-done-text {
  color: $v11-text-disabled;
}
</style>
