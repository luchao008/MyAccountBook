<template>
  <view class="page">
    <!-- ══════ 收起态：顶栏 + swiper 单月 + 当日明细 ══════ -->
    <view class="nav" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="nav-inner">
        <view class="nav-btn" @click="goBack"><SvgIcon name="icon-chevron-left" :size="20" /></view>
        <view class="nav-title-wrap" @click="expand">
          <text class="nav-title">{{ titleText }}</text>
          <SvgIcon class="nav-title-arrow" name="icon-chevron-down" :size="12" />
        </view>
        <view class="nav-btn">
          <!-- 「今天」只在没选中当天时出现 -->
          <view v-if="!isSelectedToday" class="today-btn" @click="goToday">
            <text class="today-text">今天</text>
          </view>
        </view>
      </view>
    </view>

    <!--
      收起态用 swiper 实现左右滑动切月：原生手势与惯性，不用自己处理边界回弹。
      固定 3 个 item（前/当前/后），滑完把 current 复位到中间 —— 这样"无限滑动"
      只需要换数据，不需要真的渲染无限个 item。
      ⚠️ 复位不是改个 ref 就完事（uni 的 swiper 内部 current 不会回写），
         整套时序与坑都写在 `onSwipeSettle` 的注释里，动之前先读。
    -->
    <swiper
      class="month-swiper"
      :current="swiperIndex"
      :duration="swipeDuration"
      @animationfinish="onSwipeSettle"
    >
      <swiper-item v-for="(m, i) in swiperMonths" :key="i">
        <view class="swiper-month">
          <MonthGrid
            :year="m.year"
            :month="m.month"
            :day-agg="dayAgg"
            :selected-date="selectedDate"
            :today-str="todayStr"
            @select="selectDate"
          />
        </view>
      </swiper-item>
    </swiper>

    <!-- 当日明细 -->
    <view class="detail">
      <view v-if="loadingDetail">
        <view v-for="n in 4" :key="n" class="sk-txn">
          <Skeleton circle :h="28" />
          <view class="sk-txn-main">
            <Skeleton w="72" h="14" />
            <Skeleton w="104" h="11" />
          </view>
          <Skeleton w="64" h="14" />
        </view>
      </view>
      <EmptyState
        v-else-if="!dayItems.length"
        icon="icon-inbox"
        text="无流水"
        sub-text="点击右下角加号可快速记账"
      />
      <template v-else>
        <uni-swipe-action v-for="t in dayItems" :key="t.id">
          <uni-swipe-action-item :right-options="SWIPE_OPTIONS" @click="onSwipe($event, t)">
            <view class="txn" @click="editTransaction(t.id)">
              <CategoryIcon class="txn-icon" :name="t.category?.icon || 'cat-misc'" :size="28" />
              <view class="txn-main">
                <text class="txn-name">{{ t.category?.name || '未分类' }}</text>
                <text class="txn-meta">{{ txnMeta(t) }}</text>
              </view>
              <text class="txn-amount" :class="t.type === 'income' ? 'income' : 'expense'">
                {{ t.type === 'income' ? '+' : '-' }}{{ formatMoney(t.amount) }}
              </text>
            </view>
          </uni-swipe-action-item>
        </uni-swipe-action>
      </template>
    </view>

    <!-- 右下角 FAB：快速记账 -->
    <view class="fab" @click="goRecord">
      <SvgIcon name="icon-plus" :size="28" />
    </view>

    <!--
      ══════ 展开态：整屏日历 + 虚拟列表 ══════
      用 fixed 覆盖层 + transform/opacity 过渡，做出"从顶向下展开"的渐变效果。
      translateY 从 -100% 到 0，同时透明度 0→1，两者共用 0.28s 缓动。
    -->
    <view
      class="expand-panel"
      :class="{ open: expanded }"
      :style="{ paddingTop: statusBarHeight + 'px' }"
    >
      <view class="nav-inner">
        <view class="nav-btn" @click="goBack"><SvgIcon name="icon-chevron-left" :size="20" /></view>
        <view class="nav-title-wrap" @click="collapse">
          <text class="nav-title">{{ titleText }}</text>
          <SvgIcon class="nav-title-arrow" name="icon-chevron-up" :size="12" />
        </view>
        <view class="nav-btn">
          <view v-if="!isSelectedToday" class="today-btn" @click="goToday">
            <text class="today-text">今天</text>
          </view>
        </view>
      </view>

      <view class="week-row">
        <text v-for="(w, i) in WEEK_LABELS" :key="i" class="week-label">{{ w }}</text>
      </view>

      <!--
        虚拟列表：只渲染视口内 ±1 个月，其余用占位高度撑开。
        每个月的**高度不固定**（4/5/6 行），所以用前缀和算偏移量，
        再按 scrollTop 二分查找可视区间 —— 比"固定 6 行"少一排空白，
        也比"全部渲染"省掉几百个 DOM。
      -->
      <scroll-view
        class="month-list"
        scroll-y
        :style="{ height: listHeight + 'px' }"
        :scroll-top="listScrollTop"
        @scroll="onListScroll"
        @scrolltolower="onListScrollEnd"
      >
        <view class="month-list-inner" :style="{ height: totalHeight + 'px' }">
          <view
            v-for="m in renderedMonths"
            :key="m.key"
            class="month-block"
            :style="{ top: m.top + 'px' }"
          >
            <text class="month-title">{{ m.label }}</text>
            <MonthGrid
              :year="m.year"
              :month="m.month"
              :day-agg="dayAgg"
              :selected-date="selectedDate"
              :today-str="todayStr"
              @select="selectDate"
            />
          </view>
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 日历页（流水页顶栏第二个图标跳转进入）。
 *
 * 两种形态：
 *   · **收起态**：swiper 单月（左右滑动切月）+ 当日明细 + FAB。
 *   · **展开态**：整屏可滚动日历（虚拟列表），点日期即选中并自动收起。
 *
 * 数据策略（关键）：
 *   格子上只需要"每天的收入/支出"，不需要明细 —— 所以用
 *   `GET /transactions/summary?unit=day` **一次覆盖多个月**，缓存进
 *   `dayAgg`（日期 → 收支）。滚动到哪就补拉哪一段，避免 600 个月各发一次请求。
 *   只有"选中某天"时才去拉那天的明细列表（`GET /transactions`）。
 *
 * 范围：2000-01 ~ 2049-12（600 个月）。配合虚拟列表，滑动接近"无限"。
 */
import { ref, reactive, computed, onMounted, nextTick } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import SvgIcon from '@/components/SvgIcon.vue';
import CategoryIcon from '@/components/CategoryIcon.vue';
import EmptyState from '@/components/EmptyState.vue';
import MonthGrid from '@/components/MonthGrid.vue';
import Skeleton from '@/components/Skeleton.vue';
import { useAccountStore } from '@/store/account';
import { getTransactions, getTransactionSummary, type TransactionItem } from '@/api/transaction';
import { useTxnSwipe } from '@/utils/txnSwipe';
import { formatMoney } from '@/utils/format';

const WEEK_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** 日历可滚动范围 */
const RANGE_START_YEAR = 2000;
const MONTH_COUNT = 600; // 2000-01 ~ 2049-12

/** 每块的固定构成（用于前缀和算偏移） */
const TITLE_H = 36;
const ROW_H = 74;

const accountStore = useAccountStore();

const statusBarHeight = ref(0);
const windowHeight = ref(812);
try {
  const info = uni.getSystemInfoSync();
  statusBarHeight.value = info.statusBarHeight || 0;
  windowHeight.value = info.windowHeight || 812;
} catch {
  /* 用默认值 */
}

const pad = (n: number) => String(n).padStart(2, '0');
const now = new Date();
const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

/* ── 选中状态 ── */
const selectedYear = ref(now.getFullYear());
const selectedMonth = ref(now.getMonth());
const selectedDay = ref(now.getDate());

const selectedDate = computed(
  () => `${selectedYear.value}-${pad(selectedMonth.value + 1)}-${pad(selectedDay.value)}`
);
const isSelectedToday = computed(() => selectedDate.value === todayStr);
const titleText = computed(
  () => `${selectedYear.value}年${selectedMonth.value + 1}月${selectedDay.value}日`
);

/* ── 全量「日期 → 收支」缓存 ── */
const dayAgg = ref<Record<string, { income: number; expense: number }>>({});
/** 已拉取过的月份（避免重复请求） */
const loadedMonths = new Set<string>();

/* ── 收起态 swiper：固定 3 项（前 / 当前 / 后），滑完复位到中线再换数据 ── */
/** 切月动画时长（ms） */
const SWIPE_MS = 220;
/** swiper 下标：0/1/2 = 前 / 当前 / 后。平时恒为 1（中线），只在滑动动画期间短暂偏离 */
const swiperIndex = ref(1);
/** swiper 动画时长；复位那一帧临时置 0 → 瞬移（见 onSwipeSettle） */
const swipeDuration = ref(SWIPE_MS);

/**
 * 三格各自 = 选中月 + swiperOffsets[i]，平时 [-1, 0, 1]（前 / 当前 / 后月）。
 * （本页另有一个 `offsets`（展开态虚拟列表的前缀和），故这里加 `swiper` 前缀区分。）
 *
 * ⚠️ 滑动落定后会**临时**把落点那一格也拉回基准月（[-1,0,0] / [0,0,1]）：
 *    复位要隔一帧才落到 DOM 上，那一帧视口还停在落点上，让落点与中线显示同一个月，
 *    这一帧里用户看到的就是正确的月份。
 */
const swiperOffsets = ref([-1, 0, 1]);
const swiperMonths = computed(() =>
  swiperOffsets.value.map((d) => {
    const idx = selectedYear.value * 12 + selectedMonth.value + d;
    return { year: Math.floor(idx / 12), month: ((idx % 12) + 12) % 12 };
  })
);

/** 换月：改年月、把「日」收敛到新月的月末、补齐相邻月数据、刷新当日明细 */
function shiftMonthBy(delta: number) {
  const idx = selectedYear.value * 12 + selectedMonth.value + delta;
  selectedYear.value = Math.floor(idx / 12);
  selectedMonth.value = ((idx % 12) + 12) % 12;
  // 选中的"日"在新月份可能不存在（如 31 日 → 2 月），收敛到月末
  const daysInNew = new Date(selectedYear.value, selectedMonth.value + 1, 0).getDate();
  if (selectedDay.value > daysInNew) selectedDay.value = daysInNew;
  ensureMonthsAround(selectedYear.value, selectedMonth.value);
  loadDetail();
}

/**
 * 手指滑动落定（惯性动画结束）→ 换月 + 把 swiper 复位回中线。
 *
 * ⚠️ 挂 `animationfinish` 而**不是** `change`：uni-app 的 swiper 在手指离开的同一帧
 *    就派发 change，惯性动画还要再滑 ~220ms。此时改数据，正在滑出/滑入的邻格内容会
 *    当场变化 —— 用户看到的是月历错位/重影。
 *
 * ⚠️ 复位必须分两步：uni 的 swiper 内部 `current` 滑到 0/2 后就停在那儿，
 *    只改自己的 ref 不会把它拉回来（prop 值没变 → 内部不回写）。
 *    ① 先把 prop 同步成真实下标 ② 再改回 1 触发内部回流；②还要 0 时长瞬移。
 *
 * ⚠️ 2026-09-24 修：早先挂在 `change` 上、且复位只改了 ref，结果**滑动后视口里那张月历
 *    比标题差一个月**（标题 10 月、格子却是 11 月）。`scripts/verify-calendar.mjs` 的
 *    「滑动换月」用例就是为它补的。
 */
function onSwipeSettle(e: any) {
  const i = e.detail.current;

  // current = 1：复位动画落定（或"没滑够"的回弹）→ 恢复常规三格与滑动时长
  if (i === 1) {
    swiperOffsets.value = [-1, 0, 1];
    swipeDuration.value = SWIPE_MS;
    return;
  }

  shiftMonthBy(i === 0 ? -1 : 1);
  // 落点那一格先复制基准月：它正显示用户刚滑到的那个月，复制后"换月"在这一格上看不出变化
  swiperOffsets.value = i === 2 ? [-1, 0, 0] : [0, 0, 1];
  swiperIndex.value = i; // ① prop 追上真实下标
  nextTick(() => {
    swipeDuration.value = 0; // ② 0 时长瞬移回中线
    swiperIndex.value = 1;
  });
}

/** 选中某天（收起态点格子 / 展开态点格子） */
function selectDate(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  selectedYear.value = y;
  selectedMonth.value = m - 1;
  selectedDay.value = d;
  loadDetail();
  // 展开态下选完自动收起（用户已确认）
  if (expanded.value) collapse();
}

function goToday() {
  selectedYear.value = now.getFullYear();
  selectedMonth.value = now.getMonth();
  selectedDay.value = now.getDate();
  loadDetail();
  if (expanded.value) {
    scrollToMonth(selectedYear.value, selectedMonth.value);
  } else {
    ensureMonthsAround(selectedYear.value, selectedMonth.value);
  }
}

/* ── 当日明细 ── */
const dayItems = ref<TransactionItem[]>([]);
const loadingDetail = ref(false);

async function loadDetail() {
  loadingDetail.value = true;
  try {
    const page = await getTransactions({
      start: selectedDate.value,
      end: selectedDate.value,
      size: 100,
      accountId: accountStore.currentId || undefined,
    });
    dayItems.value = page.list;
  } catch (err) {
    console.error('[calendar] 明细加载失败', err);
    dayItems.value = [];
  } finally {
    loadingDetail.value = false;
  }
}

function txnMeta(t: TransactionItem): string {
  const parts: string[] = [];
  if (t.account?.name) parts.push(t.account.name);
  if (t.note) parts.push(t.note);
  if (t.recordTime) parts.push(t.recordTime.slice(0, 5));
  return parts.join(' · ');
}

/* ── 数据按需加载 ── */
/** 月份 key → 该月起止日期 */
function monthRange(y: number, m0: number): { start: string; end: string; key: string } {
  const key = `${y}-${pad(m0 + 1)}`;
  const last = new Date(y, m0 + 1, 0).getDate();
  return { start: `${key}-01`, end: `${key}-${pad(last)}`, key };
}

/** 确保 [fromY,fromM] ~ [toY,toM] 区间的日聚合已加载 */
async function ensureRange(fromY: number, fromM0: number, toY: number, toM0: number) {
  // 找出所有未加载的月份，合成**一段**区间去请求（一次覆盖多个月）
  let firstMissing: { y: number; m: number } | null = null;
  let lastMissing: { y: number; m: number } | null = null;
  const cursor = new Date(fromY, fromM0, 1);
  const end = new Date(toY, toM0, 1);
  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const { key } = monthRange(y, m);
    if (!loadedMonths.has(key)) {
      if (!firstMissing) firstMissing = { y, m };
      lastMissing = { y, m };
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
  if (!firstMissing || !lastMissing) return;

  const s = monthRange(firstMissing.y, firstMissing.m);
  const e = monthRange(lastMissing.y, lastMissing.m);
  try {
    const rows = await getTransactionSummary({
      unit: 'day',
      start: s.start,
      end: e.end,
      accountId: accountStore.currentId || undefined,
    });
    const next = { ...dayAgg.value };
    for (const r of rows) {
      next[r.key] = { income: Number(r.income), expense: Number(r.expense) };
    }
    dayAgg.value = next;
    // 标记已加载
    const cur = new Date(firstMissing.y, firstMissing.m, 1);
    const stop = new Date(lastMissing.y, lastMissing.m, 1);
    while (cur <= stop) {
      loadedMonths.add(monthRange(cur.getFullYear(), cur.getMonth()).key);
      cur.setMonth(cur.getMonth() + 1);
    }
  } catch (err) {
    console.error('[calendar] 汇总加载失败', err);
  }
}

/** 确保某月及其前后各 1 个月已加载（收起态用） */
function ensureMonthsAround(y: number, m0: number) {
  const base = y * 12 + m0;
  const a = base - 1;
  const b = base + 1;
  ensureRange(Math.floor(a / 12), ((a % 12) + 12) % 12, Math.floor(b / 12), ((b % 12) + 12) % 12);
}

/* ── 展开态：虚拟列表 ── */
const expanded = ref(false);
const listScrollTop = ref(0);
const listHeight = computed(() => Math.max(240, windowHeight.value - statusBarHeight.value - 44 - 24));

/** 每个月的行数（4/5/6），用于前缀和 */
const monthRows = (idx: number): number => {
  const y = RANGE_START_YEAR + Math.floor(idx / 12);
  const m0 = idx % 12;
  const firstDow = new Date(y, m0, 1).getDay();
  const days = new Date(y, m0 + 1, 0).getDate();
  return Math.ceil((firstDow + days) / 7);
};

/** 前缀和：offsets[i] = 第 i 个月块顶部的 y 坐标 */
const offsets = computed(() => {
  const arr = new Array(MONTH_COUNT);
  let acc = 0;
  for (let i = 0; i < MONTH_COUNT; i++) {
    arr[i] = acc;
    acc += TITLE_H + monthRows(i) * ROW_H;
  }
  return arr;
});
const totalHeight = computed(() => offsets.value[MONTH_COUNT - 1] + TITLE_H + monthRows(MONTH_COUNT - 1) * ROW_H);

/** 二分查找：y 坐标落在第几个月块内 */
function monthAtY(y: number): number {
  const off = offsets.value;
  let lo = 0;
  let hi = MONTH_COUNT - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (off[mid] <= y) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const startIdx = ref(0);
const endIdx = ref(2);

const renderedMonths = computed(() => {
  const out: { key: string; label: string; top: number; year: number; month: number }[] = [];
  for (let i = startIdx.value; i <= endIdx.value; i++) {
    const y = RANGE_START_YEAR + Math.floor(i / 12);
    const m0 = i % 12;
    out.push({
      key: `${y}-${pad(m0 + 1)}`,
      label: `${y}年 ${m0 + 1}月`,
      top: offsets.value[i],
      year: y,
      month: m0,
    });
  }
  return out;
});

function onListScroll(e: any) {
  const top = e.detail.scrollTop;
  const first = monthAtY(top);
  const last = monthAtY(top + listHeight.value);
  const s = Math.max(0, first - 1);
  const en = Math.min(MONTH_COUNT - 1, last + 1);
  if (s !== startIdx.value) startIdx.value = s;
  if (en !== endIdx.value) endIdx.value = en;
  ensureRange(
    RANGE_START_YEAR + Math.floor(s / 12),
    s % 12,
    RANGE_START_YEAR + Math.floor(en / 12),
    en % 12
  );
}

function onListScrollEnd() {
  // 滚到底：补拉后面一段（为后续扩展留钩子）
}

/** 展开并定位到选中月 */
function expand() {
  const idx = (selectedYear.value - RANGE_START_YEAR) * 12 + selectedMonth.value;
  const safe = Math.max(0, Math.min(MONTH_COUNT - 1, idx));
  startIdx.value = Math.max(0, safe - 1);
  endIdx.value = Math.min(MONTH_COUNT - 1, safe + 1);
  // 先设 scrollTop，再显示面板 —— 避免"先看到旧位置再跳动"
  listScrollTop.value = offsets.value[safe];
  ensureRange(selectedYear.value, selectedMonth.value, selectedYear.value, selectedMonth.value);
  nextTick(() => {
    expanded.value = true;
    // 设成同值时 scroll-view 不会重新滚动，这里错开 1px 强制生效
    nextTick(() => {
      listScrollTop.value = offsets.value[safe] + 1;
    });
  });
}

function collapse() {
  expanded.value = false;
}

/** 展开态里「今天」要滚到当月 */
function scrollToMonth(y: number, m0: number) {
  const idx = Math.max(0, Math.min(MONTH_COUNT - 1, (y - RANGE_START_YEAR) * 12 + m0));
  startIdx.value = Math.max(0, idx - 1);
  endIdx.value = Math.min(MONTH_COUNT - 1, idx + 1);
  listScrollTop.value = offsets.value[idx] + 1;
}

/* ── 导航 ── */
function goBack() {
  const pages = getCurrentPages();
  if (pages.length > 1) uni.navigateBack();
  else uni.reLaunch({ url: '/pages/main/index' });
}

function goRecord() {
  uni.navigateTo({ url: '/pages/record/index' });
}

function editTransaction(id: string) {
  uni.navigateTo({ url: `/pages/record/index?id=${id}` });
}

/**
 * 左滑操作（复制 / 删除）—— 与流水页共用同一套逻辑（见 utils/txnSwipe.ts）。
 * 早先为避免与月份 swiper 的 `@change` 处理器重名曾解构成 `onTxnSwipe`；
 * 那个处理器已改成 `onSwipeSettle`（挂在 animationfinish 上），重名冲突不复存在。
 */
const { SWIPE_OPTIONS, onSwipe } = useTxnSwipe(() => {
  // 刷新当日明细（金额 / 笔数变了）
  loadDetail();
});

onMounted(async () => {
  await accountStore.load();
  ensureMonthsAround(selectedYear.value, selectedMonth.value);
  loadDetail();
});

/**
 * 从「记账页」（新增 / 编辑 / 复制）返回时刷新。
 *
 * ⚠️ **必须用 `onShow`，不能只靠 `onMounted`**（2026-09-17 修复）。
 * `uni.navigateBack()` 返回时当前页面实例并没有被销毁，`onMounted` 只跑一次 ——
 * 用户看到的就是「编辑完回来，日历格子与当日明细都还是旧的」。
 *
 * ⚠️ 光调 `loadDetail()` 不够：它只刷**当日明细列表**，
 *    而日历格子读的是 `dayAgg`（按月的日聚合缓存）。改金额 / 改日期都会动到聚合值，
 *    且**改日期时影响的是两个月**（原日期少一笔、新日期多一笔），
 *    所以这里直接把缓存清掉重拉 —— 比"只失效某一个 key"更难写错。
 *    实测代价：一次覆盖 3 个月的 summary 请求（收起态）。
 *
 * 首次进入由上面的 `onMounted` 负责（它要先 `accountStore.load()`，顺序不能变），
 * 这里用 `firstShow` 跳过，避免同一页加载两次。
 */
let firstShow = true;
onShow(() => {
  if (firstShow) {
    firstShow = false;
    return;
  }
  // ① 当日明细
  loadDetail();
  // ② 日聚合缓存整体失效，按当前形态重新拉可见范围
  dayAgg.value = {};
  loadedMonths.clear();
  if (expanded.value) {
    ensureRange(
      RANGE_START_YEAR + Math.floor(startIdx.value / 12),
      startIdx.value % 12,
      RANGE_START_YEAR + Math.floor(endIdx.value / 12),
      endIdx.value % 12
    );
  } else {
    ensureMonthsAround(selectedYear.value, selectedMonth.value);
  }
});
</script>

<style scoped lang="scss">
.page {
  min-height: $page-min-height;
  background: $v11-bg-page;
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

/* ── 顶栏（两种形态共用同一套布局，过渡时才显得连续）── */
.nav {
  background: $v11-bg-page;
}

.nav-inner {
  height: 44px;
  display: flex;
  align-items: center;
  padding: 0 $space-2;
}

.nav-btn {
  width: $touch-target-min;
  height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $v11-text-primary;
}

.nav-title-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $space-1;
}

.nav-title {
  font-size: $font-h2;
  line-height: $lh-h2;
  font-weight: $weight-semibold;
  color: $v11-text-primary;
}

.nav-title-arrow {
  color: $v11-text-secondary;
}

.today-btn {
  padding: 0 $space-2;
  height: 28px;
  display: flex;
  align-items: center;
  border: 1px solid $v11-gold;
  border-radius: $radius-pill;
}

.today-text {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-gold;
}

/* ── 收起态 swiper ── */
.month-swiper {
  height: 486px;
  border-bottom: 1px solid $v11-line;
}

.swiper-month {
  padding: 0 $space-2;
}

/* ── 展开态面板 ── */
.expand-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 200;
  background: $v11-bg-page;
  display: flex;
  flex-direction: column;
  /*
   * 从顶向下展开：translateY(-100%) → 0，同时透明度 0 → 1。
   * 两者共用同一条缓动，视觉上就是"渐变地展开"。
   */
  transform: translateY(-100%);
  opacity: 0;
  pointer-events: none;
  transition:
    transform 0.28s ease,
    opacity 0.28s ease;
}

.expand-panel.open {
  transform: translateY(0);
  opacity: 1;
  pointer-events: auto;
}

.week-row {
  display: flex;
  padding: 0 $space-2;
  border-bottom: 1px solid $v11-line;
}

.week-label {
  flex: 1;
  text-align: center;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
  padding-bottom: $space-1;
}

.month-list {
  flex: 1;
  min-height: 0;
}

/* 虚拟列表容器：绝对定位的子块靠 top 偏移排布 */
.month-list-inner {
  position: relative;
}

.month-block {
  position: absolute;
  left: 0;
  right: 0;
  padding: 0 $space-2;
}

.month-title {
  display: block;
  height: 36px;
  line-height: 36px;
  font-size: $font-body-lg;
  font-weight: $weight-medium;
  color: $v11-text-secondary;
}

/* ── 当日明细 ── */
.detail {
  min-height: 240px;
}

.state {
  padding: $space-8 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 明细骨架：照抄 .txn 的行几何（图标 + 两行文字 + 金额），
   数据到位时布局几乎不跳 */
.sk-txn {
  display: flex;
  align-items: center;
  padding: $space-3 $space-4;
  border-bottom: 1px solid $v11-line;
}

.sk-txn-main {
  flex: 1;
  min-width: 0;
  margin-left: $space-3;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.state-text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $v11-text-secondary;
}

.txn {
  display: flex;
  align-items: center;
  padding: $space-3 $space-4;
  border-bottom: 1px solid $v11-line;
}

.txn-icon {
  margin-right: $space-3;
  flex-shrink: 0;
}

.txn-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.txn-name {
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-primary;
  @include text-safe;
}

.txn-meta {
  margin-top: 2px;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
  @include text-safe;
}

.txn-amount {
  flex-shrink: 0;
  margin-left: $space-3;
  @include tabular-nums;
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  font-weight: $weight-medium;
}

.income {
  color: $v11-income-amount;
}

.expense {
  color: $v11-teal-amount;
}

/* ── FAB ── */
.fab {
  position: fixed;
  right: $space-5;
  bottom: calc(#{$space-5} + env(safe-area-inset-bottom));
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: $v11-gold;
  color: $text-inverse;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.fab:active {
  background: $v11-gold-pressed;
}
</style>
