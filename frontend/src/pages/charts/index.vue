<template>
  <view class="page">
    <!--
      ══════ 自绘顶栏 ══════
      中间标题**可点**（切换统计口径），所以它不能挂 `pointer-events: none`
      （那条约定针对"纯展示的居中标题会挡住右侧动作键"）。
      这里改用 `left: 50% + translateX(-50%)` 居中：同样是"在屏幕里居中"，
      但**宽度只占内容**，不会横铺到返回键上。
    -->
    <view class="nav" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="nav-inner">
        <view class="nav-back" @click="goBack">
          <SvgIcon name="icon-chevron-left" :size="20" />
        </view>
        <view class="nav-center" @click="openDim">
          <text class="nav-center-text">{{ DIM_LABEL[dim] }}</text>
          <SvgIcon class="nav-caret" name="icon-chevron-down" :size="12" />
        </view>
      </view>
    </view>

    <view class="body">
      <view v-if="loading && !rows.length" class="state">
        <text class="state-text">加载中…</text>
      </view>
      <EmptyState v-else-if="!rows.length" icon="icon-pie" :text="emptyText" />

      <!-- ══ 饼图视图 ══ -->
      <template v-else-if="view === 'pie'">
        <!--
          环 + 白色三角指示器（参考图 1）。

          ⚠️ 交互是**转盘**：三角**固定在正下方（6 点方向）不动**，环跟着手指转，
             三角指到哪个扇区就选中哪个 —— 而不是"点击扇区"。
             所以候选高亮由 `pickedIndex`（由旋转角算出）驱动，见 script。
        -->
        <view class="pie-area">
          <view
            class="ring-holder"
            @touchstart="onRingTouchStart"
            @touchmove="onRingTouchMove"
            @touchend="onRingTouchEnd"
            @mousedown="onRingMouseDown"
          >
            <!--
              旋转层：**整体用 CSS 转**，而不是把角度塞进 SVG 的 transform 属性 ——
              松手后要吸附到"选中扇区正对三角"，那一步需要平滑过渡，
              而 SVG 的 transform **属性**做不了 CSS transition。
              ⚠️ 拖拽中要摘掉 transition（`.dragging`），否则手指还没松开，环就在追动画。
            -->
            <view
              class="ring-rotator"
              :class="{ dragging }"
              :style="{ transform: `rotate(${rotation}deg)` }"
            >
              <RingChart
                :items="ringItems"
                :size="ringSize"
                :thickness="36"
                :selected-index="pickedIndex"
                @select="selectByIndex"
              />
            </view>

            <!--
              中心「总计」：**不能跟着转**，所以画在旋转层之外。
              （RingChart 自带的 centerLabel/centerValue 在旋转层里面，会一起转。）
              `pointer-events: none` 是必须的 —— 否则它盖在环上，拖拽起不来。
            -->
            <view class="ring-total">
              <text class="ring-total-label">总计</text>
              <text class="ring-total-value">{{ totalText }}</text>
            </view>

            <!--
              白色三角：尖端朝上，指向环的下缘。
              它**必须**压在有色的环上才看得见 —— 白卡上放白三角是隐形的（项目踩过同类）。
            -->
            <view class="ring-pointer" />
          </view>
        </view>

        <!--
          选中项（参考图：环形图下方单独一块，占比胶囊 + 「分类名 金额 >」）。
          ⚠️ 金额与箭头都只在**可跳转**时才有意义 —— 未分类点进去会看到
             "不带分类筛选的全部流水"，与预期不符（与首页排行同一个约定），
             所以"未分类"这一行不给箭头、也不响应点击。
        -->
        <view v-if="picked" class="picked">
          <view class="picked-ratio">
            <text class="picked-ratio-text">{{ picked.ratioText }}%</text>
          </view>
          <view
            class="picked-row"
            :class="{ 'picked-row-link': picked.clickable }"
            @click="goFlow(picked)"
          >
            <text class="picked-name">{{ picked.name }}</text>
            <text class="picked-amount" :class="amountClass">{{ formatMoney(picked.value) }}</text>
            <SvgIcon
              v-if="picked.clickable"
              class="picked-arrow"
              name="icon-chevron-right"
              :size="14"
            />
          </view>
        </view>
      </template>

      <!-- ══ 条形图视图 ══ -->
      <template v-else>
        <!--
          总额块：滚动时**缩小并吸顶**在顶栏下方（参考图 5 的观感）。
          `scrolled` 由 onPageScroll 驱动（见 script）。
        -->
        <view class="total-block" :class="{ compact: scrolled }" :style="compactStyle">
          <text class="total-label">{{ totalLabel }}</text>
          <text class="total-value" :class="amountClass">{{ totalText }}</text>
        </view>

        <view class="rank">
          <view
            v-for="(r, i) in rows"
            :key="r.key"
            class="rank-item"
            :class="{ 'rank-item-link': r.clickable }"
            @click="goFlow(r)"
          >
            <view class="rank-line">
              <CategoryIcon class="rank-icon" :name="r.icon" :size="30" />
              <text class="rank-name">{{ r.name }}</text>
              <text class="rank-ratio">{{ r.ratioText }}%</text>
              <text class="rank-amount">{{ formatMoney(r.value) }}</text>
              <SvgIcon v-if="r.clickable" class="rank-arrow" name="icon-chevron-right" :size="14" />
            </view>
            <view class="bar-track">
              <view
                class="bar-fill"
                :style="{ width: barWidth(r.ratio), background: colorAt(i) }"
              />
            </view>
          </view>
        </view>
      </template>
    </view>

    <!--
      ══════ 底部固定条 ══════
      左：`‹ 区间文案 ›`（点文案弹时间粒度弹层；箭头按当前粒度前后翻一期）
      右：「饼图 | 条形图」切换（参考图 4/5 的右下角）
    -->
    <view class="bar">
      <view class="bar-left">
        <view class="bar-arrow" :class="{ 'bar-arrow-off': !shiftable }" @click="shift(-1)">
          <SvgIcon name="icon-chevron-left" :size="14" />
        </view>
        <text class="bar-text" @click="openTime">{{ rangeLabel }}</text>
        <view class="bar-arrow" :class="{ 'bar-arrow-off': !shiftable }" @click="shift(1)">
          <SvgIcon name="icon-chevron-right" :size="14" />
        </view>
      </view>
      <view class="bar-right">
        <text class="bar-tab" :class="{ active: view === 'pie' }" @click="view = 'pie'">饼图</text>
        <text class="bar-tab" :class="{ active: view === 'bar' }" @click="view = 'bar'"
          >条形图</text
        >
      </view>
    </view>

    <!--
      ══ 弹层①：统计口径 ══
      ⚠️ 用**下拉展开**（NavDropdown）而不是底部升起：触发点在顶栏，
        从触发点往下"掉"下来才符合直觉（luchao 要求）。时间粒度弹层仍在底部升起。
    -->
    <NavDropdown
      v-model:visible="dimOpen"
      :model-value="dim"
      :options="dimOptions"
      :top="navHeight"
      @pick="pickDim"
    />

    <!-- ══ 弹层②：时间粒度（参考图 2/3） ══ -->
    <view v-if="timeOpen" class="mask" @click="timeOpen = false">
      <view class="sheet" @click.stop>
        <view
          v-for="opt in GRAN_OPTIONS"
          :key="opt.value"
          class="sheet-item sheet-item-row"
          @click="pickDraftGran(opt.value)"
        >
          <text class="sheet-item-text" :class="{ 'sheet-item-active': draftGran === opt.value }">
            {{ opt.label }}
          </text>
          <SvgIcon
            v-if="draftGran === opt.value"
            class="sheet-check"
            name="icon-check"
            :size="18"
          />
        </view>

        <!-- 自定义：开关 + 起止日期（参考图 3） -->
        <view class="sheet-item sheet-item-row">
          <text class="sheet-item-text" :class="{ 'sheet-item-active': draftGran === 'custom' }">
            自定义
          </text>
          <switch
            class="sheet-switch"
            :checked="draftGran === 'custom'"
            color="#A85F12"
            @change="onToggleCustom"
          />
        </view>

        <view v-if="draftGran === 'custom'" class="custom-range">
          <view class="custom-col">
            <text class="custom-label">开始时间</text>
            <picker mode="date" :value="draftCustom.start" @change="onStartChange">
              <text class="custom-value">{{ draftCustom.start || '请选择' }}</text>
            </picker>
          </view>
          <view class="custom-col">
            <text class="custom-label">结束时间</text>
            <picker mode="date" :value="draftCustom.end" @change="onEndChange">
              <text class="custom-value">{{ draftCustom.end || '请选择' }}</text>
            </picker>
          </view>
        </view>

        <!-- 选择是**草稿态**，点「完成」才生效并关闭（与参考图一致） -->
        <view class="sheet-foot" @click="commitTime">
          <text class="sheet-foot-text">完成</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 图表页（分类占比）—— `pages/main/index` 右上角图标进入。
 *
 * 形态照 luchao 给的参考图（2026-09-30）：
 *   · 顶栏中间「分类支出 ▾」可点 → 切换统计口径（分类支出 / 分类收入 / 二级支出 / 二级收入）
 *   · 饼图视图：环形图 + 中心「总计」+ 下方选中项的占比与金额
 *   · 条形图视图：总支出大字 + 分类排行（图标 / 名称 / 占比 / 进度条 / 金额）
 *   · 底部：左「 ‹ 区间 › 」（点击弹时间粒度）+ 右「饼图 | 条形图」
 *   · 时间粒度弹层：全部 / 天 / 周 / 月 / 季 / 年 / 自定义（开关 + 起止日期）+ 完成
 *
 * ⚠️ 参考图右上角还有一个「···」—— **刻意不做**：它的作用在参考图里看不到、
 *    luchao 也未说明，做一个点不动的按钮就是"假控件"（项目红线）。
 *
 * 数据来源：`GET /transactions/summary?groupBy=category`。
 *   选它而不是 `/statistics/report` 的原因：本页的**时间粒度是任意的**
 *   （全部/天/周/季/自定义），而 report 只吃 `YYYY` / `YYYY-MM` 两种 period。
 *   summary 天生接受任意 start/end，且 level（1/2）+ type（income/expense）正好
 *   对应四种口径 —— **后端零改动**。
 */
import { ref, computed, getCurrentInstance } from 'vue';
import { onLoad, onPageScroll, onUnload, onHide } from '@dcloudio/uni-app';
import SvgIcon from '@/components/SvgIcon.vue';
import RingChart from '@/components/RingChart.vue';
import NavDropdown from '@/components/NavDropdown.vue';
import CategoryIcon from '@/components/CategoryIcon.vue';
import EmptyState from '@/components/EmptyState.vue';
import { getTransactionSummary } from '@/api/transaction';
import { useAccountStore } from '@/store/account';
import { useUserStore } from '@/store/user';
import { formatMoney } from '@/utils/format';
import { granularityRange, type Granularity } from '@/utils/period';
import { CHART_SERIES } from '@/constants/chart';
import { createLatest } from '@/utils/latest';

const userStore = useUserStore();
const accountStore = useAccountStore();

/** 顶栏状态栏高度（custom 导航栏要自己顶开），与其它自绘顶栏页同款 */
const statusBarHeight = ref(0);
try {
  statusBarHeight.value = uni.getSystemInfoSync().statusBarHeight || 0;
} catch {
  statusBarHeight.value = 0;
}

/* ── 统计口径 ── */
type Dim = 'expense1' | 'income1' | 'expense2' | 'income2';

const DIM_LABEL: Record<Dim, string> = {
  expense1: '分类支出',
  income1: '分类收入',
  expense2: '二级支出',
  income2: '二级收入',
};
const DIM_OPTIONS: Dim[] = ['expense1', 'income1', 'expense2', 'income2'];

const dim = ref<Dim>('expense1');
const dimOpen = ref(false);

/** 下拉菜单的选项（NavDropdown 要的是 {value,label}） */
const dimOptions = computed(() => DIM_OPTIONS.map((v) => ({ value: v, label: DIM_LABEL[v] })));

/** 一级/二级口径 */
const level = computed<1 | 2>(() => (dim.value === 'expense2' || dim.value === 'income2' ? 2 : 1));
/** 收支类型 */
const type = computed<'income' | 'expense'>(() =>
  dim.value === 'income1' || dim.value === 'income2' ? 'income' : 'expense',
);

/* ── 时间粒度 ── */
const GRAN_OPTIONS: { value: Granularity; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'day', label: '天' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
  { value: 'quarter', label: '季' },
  { value: 'year', label: '年' },
];

const gran = ref<Granularity>('year');
const timeOpen = ref(false);
/** 弹层里的草稿（点「完成」才写回 gran / customRange） */
const draftGran = ref<Granularity>('year');
const customRange = ref({ start: '', end: '' });
const draftCustom = ref({ start: '', end: '' });

/** 基准日期：左右箭头按粒度前后翻一期 */
const anchor = ref(new Date());

const range = computed(() => granularityRange(gran.value, customRange.value, anchor.value));
const rangeLabel = computed(() => range.value.label);

/** 只有单期粒度能翻页；「全部 / 自定义」没有"上一期"可言 */
const shiftable = computed(() => !['all', 'custom'].includes(gran.value));

/* ── 视图与数据 ── */
const view = ref<'pie' | 'bar'>('pie');

interface Row {
  key: string;
  name: string;
  icon: string;
  value: number;
  ratio: number;
  ratioText: string;
  clickable: boolean;
}

const rows = ref<Row[]>([]);
const loading = ref(false);

const totalValue = computed(() => rows.value.reduce((s, r) => s + r.value, 0));
const totalText = computed(() => formatMoney(totalValue.value));
const totalLabel = computed(() => (type.value === 'expense' ? '总支出' : '总收入'));
const amountClass = computed(() => (type.value === 'expense' ? 'expense' : 'income'));
const emptyText = computed(() => `暂无${DIM_LABEL[dim.value]}数据`);

/** 环形图数据（颜色交给 RingChart 的 palette，保证与条形图进度条同源） */
const ringItems = computed(() => rows.value.map((r) => ({ name: r.name, value: r.value })));

/* ============================================================
 * 转盘：旋转角 ↔ 「正下方是哪个扇区」
 *
 * 参考图的交互是**转盘**而不是"点扇区"：白色三角固定在 6 点方向，环跟着手指转，
 * 三角指到谁就选中谁。所以：
 *   · `rotation` 是环的旋转角（度，顺时针为正）；
 *   · 谁被选中是**算出来的**（`pickedIndex`），不是存下来的状态 ——
 *     存状态会在"手指拖过去又拖回来"时与视觉不一致。
 * ============================================================ */
const rotation = ref(0);

/** 归一化到 [0, 360) */
function mod360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * 当前落在**正下方（6 点方向）**的扇区下标。
 *
 * 扇区 i 未旋转时从 12 点顺时针占 `[acc, acc + span)`；
 * 整体转过 `rotation` 后，落在正下方（未旋转坐标系里的 180°）的那个满足
 * `mod360(180 − (acc + rotation)) < span`。
 *
 * ⚠️ 用「未旋转坐标 + 旋转量」比较，而不是去算屏幕上的实际角度 ——
 *    前者是纯算术、恒成立；后者要处理 SVG 的 rotate 与屏幕 y 轴向下两重翻转，容易错。
 */
const pickedIndex = computed<number | null>(() => {
  const total = totalValue.value;
  if (!total || !rows.value.length) return null;
  let acc = 0;
  for (let i = 0; i < rows.value.length; i++) {
    const span = (rows.value[i].value / total) * 360;
    const start = mod360(acc + rotation.value);
    if (mod360(180 - start) < span) return i;
    acc += span;
  }
  return rows.value.length - 1;
});

const picked = computed(() => {
  const i = pickedIndex.value;
  return i === null ? null : rows.value[i] || null;
});

/**
 * 把第 index 个扇区的**中心**转到三角正下方（180°）所需的角度。
 *
 * ⚠️ 返回的是**与当前 rotation 最接近的那个等价角**（差 ±360 的整数倍）。
 *    直接返回 `mod360(base)` 会让"355° → 目标 5°"被浏览器理解成反向转 350°，
 *    视觉上就是"为了对齐倒转一大圈"。挑最接近的等价角才是最短路径。
 */
function targetRotationFor(index: number): number | null {
  const total = totalValue.value;
  if (!total || !rows.value[index]) return null;
  let acc = 0;
  for (let k = 0; k < index; k++) acc += (rows.value[k].value / total) * 360;
  const span = (rows.value[index].value / total) * 360;
  const base = 180 - acc - span / 2;

  let best = base;
  let bestDiff = Infinity;
  for (let k = -2; k <= 2; k++) {
    const cand = base + k * 360;
    const diff = Math.abs(cand - rotation.value);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = cand;
    }
  }
  return best;
}

/** 点某个扇区 → 把它转到正下方（带过渡动画，见 .ring-rotator） */
function selectByIndex(index: number) {
  const t = targetRotationFor(index);
  if (t !== null) rotation.value = t;
}

/**
 * 松手 → **吸附**：把三角指着的那个扇区转到正下方**居中**。
 *
 * 为什么必须吸附：不吸附的话，三角指到扇区的哪个位置都算选中 ——
 * 停在一个大扇区的边缘和停在中心，看起来完全是两回事，用户不知道该看哪。
 * 吸附后"三角 → 扇区中心"是一条确定的对应关系（与参考图一致）。
 */
function snapToPicked() {
  const i = pickedIndex.value;
  if (i === null) return;
  const t = targetRotationFor(i);
  if (t !== null) rotation.value = t;
}

/** 数据变化后：让**占比最大的那一项**（后端已按金额倒序 = 第 0 项）正对三角 */
function resetRotation() {
  const total = totalValue.value;
  if (!total || !rows.value.length) {
    rotation.value = 0;
    return;
  }
  const span0 = (rows.value[0].value / total) * 360;
  rotation.value = mod360(180 - span0 / 2);
}

/* ── 拖拽旋转 ── */

/** 环心在屏幕上的坐标（把指针位置换算成角度必须有它） */
const ringCenter = ref<{ cx: number; cy: number } | null>(null);
/** 是否正在拖拽 —— 模板要读它来决定"要不要关掉过渡动画"，所以必须是响应式的 */
const dragging = ref(false);
let lastPointerAngle = 0;

/**
 * rAF 的跨端封装。
 *
 * ⚠️ 小程序端**没有** `requestAnimationFrame`（那不是浏览器环境），直接调用会
 *    ReferenceError。`typeof` 对未声明的标识符是安全的（返回 'undefined'，不抛），
 *    所以可以在模块顶层判定一次。回退到 16 ms 的 `setTimeout` —— 精度差一点，
 *    但"每帧最多写一次"这个目的达到了。
 */
const hasRaf = typeof requestAnimationFrame === 'function';
const rafTick = (cb: () => void): number =>
  hasRaf ? requestAnimationFrame(cb) : (setTimeout(cb, 16) as unknown as number);
const rafCancel = (id: number): void => {
  if (hasRaf) cancelAnimationFrame(id);
  else clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
};

/**
 * 待写入的指针角度 + 本帧的 rAF 句柄。
 *
 * ⚠️ 用**普通变量**而不是 ref：这两个值不参与渲染，走响应式只会让每次指针移动
 *    都触发依赖通知 —— 正是这次要消掉的开销。
 */
let pendingAngle: number | null = null;
let angleRafId = 0;

/**
 * 记下"指针到了某角度"，但**每帧最多写一次** `rotation.value`。
 *
 * ⚠️ 为什么需要它：桌面端 `mousemove` 的采样率可以是 500~1000 Hz（高回报率鼠标），
 *    而屏幕只有 60 Hz。每个事件都写一次响应式 = 一帧内多次触发组件更新 + 反复重启
 *    CSS transition，手感表现为"发飘、跟不上手"。
 * ⚠️ **不能指望 uni-h5 节流**：已读源码确认 —— 它只对 **scroll** 做了 rAF 节流
 *    （`onPageScroll` 一帧最多回调一次），对 touchmove / mousemove **不做任何节流**。
 */
function schedulePointerAngle(a: number) {
  pendingAngle = a;
  if (angleRafId) return; // 本帧已排队
  angleRafId = rafTick(flushPointerAngle);
}

/** 把本帧攒下的角度真正写进 rotation（触底/松手前也要手动调一次，否则丢最后一帧） */
function flushPointerAngle() {
  angleRafId = 0;
  if (pendingAngle === null) return;
  const a = pendingAngle;
  pendingAngle = null;
  applyPointerAngle(a);
}

/**
 * 结束拖拽的**唯一**出口：幂等，可以重复调用。
 *
 * ⚠️ 把"清监听 / 取消 rAF / 复位状态"收在一处，是因为它有三个调用点
 *    （触摸松手、鼠标松手、页面卸载）。分开写就会出现"某个出口忘了清某一项"——
 *    而漏掉的那一项不会报错，只会在特定操作序列下变成幽灵拖拽或监听泄漏。
 */
function teardownDrag() {
  if (typeof document !== 'undefined') {
    document.removeEventListener('mousemove', onDocMouseMove);
    document.removeEventListener('mouseup', onDocMouseUp);
  }
  if (angleRafId) {
    rafCancel(angleRafId);
    angleRafId = 0;
  }
  pendingAngle = null;
  dragging.value = false;
}

/** 松手：先把最后一帧的角度补上，再收尾、再吸附（顺序不能换，否则吸附位置差一点） */
function endDrag() {
  flushPointerAngle();
  teardownDrag();
  snapToPicked();
}

/** setup 顶层留一份实例引用（async 里再调 getCurrentInstance 拿不到） */
const inst = getCurrentInstance();

/**
 * 量环心坐标。
 * ⚠️ 用 uni 的 selectorQuery 而不是 DOM API：H5 下两者都行，小程序端只认前者。
 * ⚠️ 包成 Promise：**必须等它回调完才能算角度** —— 否则首次拖拽时
 *    `ringCenter` 还是 null，角度恒为 0，环一动不动（看起来像"旋转没实现"）。
 */
function measureRing(): Promise<void> {
  return new Promise((resolve) => {
    uni
      .createSelectorQuery()
      .in(inst)
      .select('.ring-holder')
      .boundingClientRect((rect) => {
        const r = rect as unknown as {
          left: number;
          top: number;
          width: number;
          height: number;
        } | null;
        if (r) ringCenter.value = { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
        resolve();
      })
      .exec();
  });
}

/** 某点相对环心的角度（度）。屏幕 y 轴向下 → 角度随顺时针增大，与 rotation 同向 */
function angleFromPoint(x: number, y: number): number {
  const c = ringCenter.value;
  if (!c) return 0;
  return (Math.atan2(y - c.cy, x - c.cx) * 180) / Math.PI;
}

/** 把「当前指针角度」换算成旋转增量并累加 */
function applyPointerAngle(a: number) {
  let delta = a - lastPointerAngle;
  // 跨 ±180° 时 atan2 会跳变，归一化到最短弧，否则环会突然倒转一大圈
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  rotation.value = mod360(rotation.value + delta);
  lastPointerAngle = a;
}

/**
 * 开始拖拽。
 * ⚠️ 环心**每次都要重量**：页面滚动过、或者窗口尺寸变了，
 *    缓存的坐标就错了 —— 表现为"越拖越偏"。
 */
async function beginDrag(x: number, y: number) {
  await measureRing();
  dragging.value = true;
  lastPointerAngle = angleFromPoint(x, y);
}

/*
 * ⚠️ 事件参数类型必须写 DOM 的 `TouchEvent`：uni-app 的模板类型就是这么声明的，
 *    自己造一个结构相同的 `{touches: TouchLike[]}` 接口会 TS2322
 *    （TouchList 不是数组）。
 */
function onRingTouchStart(e: TouchEvent) {
  const t = e.touches?.[0] || e.changedTouches?.[0];
  if (!t) return;
  beginDrag(t.clientX, t.clientY);
}

function onRingTouchMove(e: TouchEvent) {
  if (!dragging.value) return;
  const t = e.touches?.[0] || e.changedTouches?.[0];
  if (!t) return;
  schedulePointerAngle(angleFromPoint(t.clientX, t.clientY));
}

function onRingTouchEnd() {
  endDrag();
}

/*
 * H5：**鼠标拖拽也要能转**。
 *
 * ⚠️ 浏览器里根本不发 touch 事件 —— 只绑 @touchstart 的话，用鼠标（或触控板）
 *    拖环是"一点反应都没有"。2026-09-30 实测踩到：旋转逻辑没写错，是事件压根没进来。
 *    `mousemove` / `mouseup` 挂到 document 上：指针拖出环外还要继续跟手。
 *
 * `document` 只有 H5 才有；小程序端不会产生 mousedown 事件，所以这里是运行时保护，
 * 不需要 `#ifdef`（那会让模板上的 @mousedown 在非 H5 端指向未定义的 handler）。
 */
function onRingMouseDown(e: MouseEvent) {
  e.preventDefault();
  beginDrag(e.clientX, e.clientY);
  if (typeof document === 'undefined') return;
  document.addEventListener('mousemove', onDocMouseMove);
  document.addEventListener('mouseup', onDocMouseUp);
}

function onDocMouseMove(e: MouseEvent) {
  if (!dragging.value) return;
  schedulePointerAngle(angleFromPoint(e.clientX, e.clientY));
}

function onDocMouseUp() {
  endDrag();
}

/* ── 条形图：滚动时总额块缩小吸顶 ── */
const scrolled = ref(false);

/** 顶栏总高 = 状态栏 + 44 —— 吸顶块的 `top` 必须等于它，否则会被顶栏盖住 */
const navHeight = computed(() => statusBarHeight.value + 44);
/** 只在吸顶态写 top（非吸顶时不要 position: sticky 的副作用） */
const compactStyle = computed(() => (scrolled.value ? { top: `${navHeight.value}px` } : {}));

/**
 * ⚠️ 用**迟滞**（下滚 20px 收起、上滚 12px 才恢复）而不是单阈值：
 *    在阈值上下轻微抖动时，单阈值会让吸顶块反复膨胀收缩，观感很吵。
 */
onPageScroll((e) => {
  const top = e.scrollTop;
  if (!scrolled.value && top > 20) scrolled.value = true;
  else if (scrolled.value && top < 12) scrolled.value = false;
});

/* ── 样式辅助 ── */
function colorAt(index: number): string {
  return CHART_SERIES[index % CHART_SERIES.length];
}
/** 进度条宽度：占比过小的也给 2% 保证可见（与首页排行同一处理） */
function barWidth(ratio: number): string {
  return `${Math.min(Math.max(ratio, 2), 100)}%`;
}

/**
 * 环直径随屏幕自适应。
 *
 * 可用宽 = 屏宽 − `.body` 左右 padding(16×2) ；RingChart 的画布还要再留 32（上下各 16 的 PAD），
 * 所以 `size ≤ 屏宽 − 64`。375 屏取上限 260；320 屏落到 256（画布 288，正好等于可用宽）。
 * ⚠️ 把这里的常量与 `.body` 的 padding 绑死是刻意的：改 padding 就要回来改这里。
 */
const ringSize = ref(260);
try {
  const w = uni.getSystemInfoSync().windowWidth || 375;
  ringSize.value = Math.min(260, Math.max(180, w - 64));
} catch {
  ringSize.value = 260;
}

/* ── 交互 ── */
/**
 * 点某一项 → 跳流水页（带上"当前区间 + 该分类"）。
 *
 * ⚠️ **未分类（key === '__none__'）不可点**：分类筛选弹层不提供"未分类"项、
 *    后端也没有筛选未分类的能力，跳过去看到的是"不带分类筛选的全部流水"，
 *    与用户点它的预期不符 —— 与其给个名不副实的跳转，不如不给（与首页排行同一约定）。
 */
function goFlow(row: Row) {
  if (!row.clickable) return;
  const { start, end } = range.value;
  let url = `/pages/flow/index?groupBy=category&level=${level.value}`;
  url += `&categoryIds=${encodeURIComponent(row.key)}`;
  if (start && end) url += `&start=${start}&end=${end}`;
  uni.navigateTo({ url });
}

function goBack() {
  uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/main/index' }) });
}

function openDim() {
  dimOpen.value = true;
}

/** 选口径（NavDropdown 传回来的是 string，收窄成 Dim） */
function pickDim(next: string) {
  dimOpen.value = false;
  const d = next as Dim;
  if (d === dim.value) return;
  dim.value = d;
  loadData();
}

function openTime() {
  // 每次打开都从当前值开始（草稿态）
  draftGran.value = gran.value;
  draftCustom.value = { ...customRange.value };
  timeOpen.value = true;
}

function pickDraftGran(next: Granularity) {
  draftGran.value = next;
}

/**
 * switch / picker 的 change 事件在 uni-app 的类型里是原生 `Event`，
 * 运行时才带 `detail` —— 所以这里显式断言，而不是把它标成 `Event` 再去读 `detail`（会 TS2339）。
 */
function onToggleCustom(e: Event) {
  const detail = (e as unknown as { detail?: { value?: boolean } }).detail;
  draftGran.value = detail?.value ? 'custom' : 'year';
}

function onStartChange(e: Event) {
  const detail = (e as unknown as { detail?: { value?: string } }).detail;
  draftCustom.value = { ...draftCustom.value, start: detail?.value || '' };
}

function onEndChange(e: Event) {
  const detail = (e as unknown as { detail?: { value?: string } }).detail;
  draftCustom.value = { ...draftCustom.value, end: detail?.value || '' };
}

function commitTime() {
  const nextGran = draftGran.value;
  const nextCustom = { ...draftCustom.value };
  timeOpen.value = false;

  // 自定义要求两端都选好；缺一边就退回「年」，避免落到一个空区间
  if (nextGran === 'custom' && (!nextCustom.start || !nextCustom.end)) {
    gran.value = 'year';
    customRange.value = { start: '', end: '' };
  } else {
    gran.value = nextGran;
    customRange.value = nextCustom;
  }
  anchor.value = new Date();
  loadData();
}

/** 按当前粒度把基准日期前后挪一期 */
function shift(dir: -1 | 1) {
  if (!shiftable.value) return;
  const d = new Date(anchor.value);
  if (gran.value === 'day') d.setDate(d.getDate() + dir);
  else if (gran.value === 'week') d.setDate(d.getDate() + 7 * dir);
  else if (gran.value === 'month') d.setMonth(d.getMonth() + dir);
  else if (gran.value === 'quarter') d.setMonth(d.getMonth() + 3 * dir);
  else if (gran.value === 'year') d.setFullYear(d.getFullYear() + dir);
  anchor.value = d;
  loadData();
}

/* ── 数据加载 ── */
/**
 * 图表数据的「最后写入者胜」守卫。
 *
 * ⚠️ 为什么必须有：切粒度（月/季/年/全部）、切方向（支出/收入）、
 *    切分类层级、以及左右翻时段都会调 `loadData()`，而这几种**后端成本差异很大**
 *    （`year` 与 `all` 的聚合量差几倍）。先发的响应后到时，`rows` 会被旧口径的数据覆盖 ——
 *    而界面上的粒度/方向标签已经是新的，也就是**图例与数据对不上**；
 *    更糟的是这里还有 `resetRotation()`，它会按错误的数据把转盘重新转正。
 */
const dataGuard = createLatest();

function loadData() {
  loading.value = true;
  /*
   * ⚠️ 四个查询维度都在调用时快照。
   *    若在 await 之后再读 `level.value` / `type.value` / `range.value`，
   *    这次请求带的就是"用户后来改成的口径" —— 语义上说不清它代表哪一次意图。
   */
  const wantLevel = level.value;
  const wantType = type.value;
  const wantStart = range.value.start;
  const wantEnd = range.value.end;
  const wantAccountId = accountStore.currentId || undefined;
  return dataGuard.run({
    task: () =>
      getTransactionSummary({
        groupBy: 'category',
        level: wantLevel,
        type: wantType,
        // `all` 时 range 里没有 start/end → 传 undefined = 不限时间
        start: wantStart,
        end: wantEnd,
        accountId: wantAccountId,
      }),
    onSuccess: (list) => {
      const raw = (list || [])
        .map((it) => ({
          key: String(it.key),
          name: it.name || '未分类',
          icon: it.icon || 'cat-misc',
          // 该口径只看一个方向：支出口径取 expense、收入口径取 income
          value: Number(wantType === 'expense' ? it.expense : it.income) || 0,
          clickable: String(it.key) !== '__none__',
        }))
        .filter((r) => r.value > 0);

      const total = raw.reduce((s, r) => s + r.value, 0);
      rows.value = raw.map((r) => {
        const ratio = total > 0 ? (r.value / total) * 100 : 0;
        return { ...r, ratio, ratioText: ratio.toFixed(2) };
      });

      // 数据变了 → 让占比最大的那项重新正对三角
      resetRotation();
    },
    onError: (err) => {
      console.error('[charts] 加载失败', err);
      uni.showToast({ title: '加载失败', icon: 'none' });
      rows.value = [];
    },
    onSettled: () => {
      loading.value = false;
    },
  });
}

onLoad(() => {
  if (!userStore.isLogin) {
    uni.reLaunch({ url: '/pages/login/index' });
    return;
  }
  accountStore.load();
  loadData();
});

/*
 * 卸载 / 隐藏：把拖拽相关的资源全部收干净。
 *
 * ⚠️ 必须显式兜底，不能只靠 `mouseup`：
 *    拖拽用的 `mousemove` / `mouseup` 是挂在 **document** 上的（为了让指针拖出环外
 *    还能继续跟手），而移除它们的唯一路径原本是 `mouseup`。
 *    若用户在**按住不放的状态下**页面被卸载（返回手势、程序化跳转），
 *    这两个监听会永远留在 document 上，且 `dragging` 停在 true ——
 *    之后再进本页会表现为"还没按下环就开始跟着鼠标转"的幽灵拖拽。
 *    `teardownDrag()` 是幂等的，重复调用无副作用。
 *
 * ⚠️ `onHide` 也要：本页被 navigateTo 盖住时不会 unload，但用户显然已经不在拖了，
 *    此时留着 `dragging = true` 与两个 document 监听没有任何意义。
 */
onUnload(() => {
  dataGuard.invalidate();
  teardownDrag();
});

onHide(() => {
  teardownDrag();
});
</script>

<style scoped lang="scss">
.page {
  min-height: $page-min-height;
  background: $v11-bg-page;
  /* 底部留白 = 底部条 52 + 呼吸位 10；内容区左右留白在 .body */
  padding-bottom: calc(62px + env(safe-area-inset-bottom));
}

/* ── 自绘顶栏 ── */

.nav {
  /* 滚动时顶栏吸顶（参考图里切到条形图后，滚列表顶栏要固定住） */
  position: sticky;
  top: 0;
  z-index: 10;
  background: $v11-bg-page;
}

.nav-inner {
  height: 44px;
  display: flex;
  align-items: center;
  padding: 0 $space-2;
  /* 提供 .nav-back 与 .nav-center 的定位上下文。
     ⚠️ 不要另起一个 `.nav-inner { position: relative }` 块：
        check-ios-tokens §13 是逐个 `.nav-inner {...}` 块断言「声明了 padding: 0 $space-2」的。 */
  position: relative;
}

.nav-back {
  width: $touch-target-min;
  height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $v11-gold;
}

/*
 * 中间标题（可点）：`left: 50% + translateX(-50%)` 保证在**屏幕**里居中，
 * 而宽度只占内容 —— 不会像 `left:0; right:0` 那样横铺过去压住返回键，
 * 所以这里**不需要**（也不能）写 `pointer-events: none`。
 */
.nav-center {
  position: absolute;
  left: 50%;
  top: 0;
  height: 44px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  color: $v11-text-primary;
}

.nav-center-text {
  font-size: $font-h2;
  line-height: $lh-h2;
  font-weight: $weight-semibold;
  color: $v11-text-primary;
}

.nav-caret {
  margin-left: 4px;
  color: $v11-text-secondary;
}

/* ── 内容区 ── */

.body {
  /* 左右 16px：右侧要留得下原生滚动条，否则桌面浏览器里内容会贴着滚动条 */
  padding: 8px 16px 0;
}

.state {
  padding: 48px 0;
  text-align: center;
}

.state-text {
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-secondary;
}

/* ── 饼图视图 ── */

.pie-area {
  display: flex;
  justify-content: center;
  padding: 12px 0 4px;
}

/* 环 + 三角指示器的定位容器（触摸拖拽也挂在这一层） */
.ring-holder {
  position: relative;
  /*
   * `overflow: hidden` 是**必要的**，不是随手加的：
   *   旋转层是个**正方形**（SVG 画布 = 环直径 + 两侧各 16px 的 PAD），
   *   正方形转过一个角度后，包围盒会涨到√2 倍 —— 于是整页被撑出横向溢出
   *   （2026-09-30 reflow 实测：375 档文档宽 387、320 档 360）。
   *   被裁掉的只是**四角的空白**：环本身直径比画布小 32px，怎么转都在里面。
   *   ⚠️ 环外若将来要加引出线标注（RingChart 的 showLabels），这里就不能裁了。
   */
  overflow: hidden;
  /*
   * ⚠️ `touch-action: none` 必须写：不写的话浏览器会把"在环上拖动"识别成
   *    **页面滚动手势**，touchmove 直接不派发给我 —— 表现就是"拖了没反应"。
   *    代价：环这一块不能再用来滚动页面（这本来就是想要的效果）。
   */
  touch-action: none;
}

/*
 * 旋转层：整个环跟着它转。
 * 松手吸附要有动画，所以默认带 transition；拖拽中（`.dragging`）必须关掉 ——
 * 否则环在追一个 280ms 前的角度，手感是"拖不动、还发飘"。
 */
.ring-rotator {
  transition: transform 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);
  @include reduce-motion;
}

.ring-rotator.dragging {
  transition: none;
}

/*
 * 中心「总计」：画在旋转层**外面**，所以不跟着转。
 * （RingChart 自带的 centerLabel/centerValue 在旋转层里面，会一起转。）
 *
 * ⚠️ `pointer-events: none` 必须写 —— 这层正好盖在环上，不写就拖不动环。
 */
.ring-total {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.ring-total-label {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
}

.ring-total-value {
  margin-top: 2px;
  font-size: $font-h1;
  line-height: $lh-h1;
  font-weight: $weight-semibold;
  color: $v11-text-primary;
}

/*
 * 白色三角指示器：**固定在正下方**（6 点方向），尖端朝上、压在环的下缘上。
 * 环跟着手指转，三角不动 —— 三角指到哪个扇区，下方就显示哪个扇区（见 script）。
 *
 * 位置换算：RingChart 的画布 = size + 32（上下各留 16px 的 PAD），
 * 所以环的下缘距容器底 16px。三角底边贴在那儿、尖端向上 12px 插进环里。
 *
 * ⚠️ 白色三角**必须压在有色的环上**才看得见 —— 白卡上放白三角是隐形的。
 */
.ring-pointer {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 11px solid transparent;
  border-right: 11px solid transparent;
  border-bottom: 14px solid $v11-bg-card;
}

.picked {
  padding: 8px 4px 0;
}

/* 占比胶囊：细描边 + 主色金文字（参考图里的「32.94%」） */
.picked-ratio {
  display: flex;
  justify-content: center;
}

.picked-ratio-text {
  border: 1px solid $v11-gold;
  border-radius: 999px;
  padding: 4px 12px;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-gold;
}

.picked-row {
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: $touch-target-min;
}

.picked-name {
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  color: $v11-text-primary;
}

.picked-amount {
  margin-left: 10px;
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  font-weight: $weight-medium;
}

.picked-arrow {
  margin-left: 4px;
  color: $v11-text-tertiary;
}

/* ── 条形图视图 ── */

.total-block {
  /*
   * 左右用负 margin 抵消 `.body` 的 16px —— luchao 要求这一块**撑满屏幕宽**
   * （背景与底部阴影通栏），但文字仍要离边 16px。
   * ⚠️ 不要改成"去掉 .body 的 padding"：那会把整个列表的边距一起带偏。
   */
  margin: 0 -16px;
  padding: 8px 16px 16px;
  /*
   * ⚠️ 全站唯一一处「卡片阴影」（v1.1 是零描边 + 无阴影的扁平语言）。
   *    luchao 明确要求「总额块底部有一点点阴影」——用途是把它与下面的排行列表
   *    **分层**：这个块滚动后会吸顶浮在列表之上，没有阴影就分不清谁压着谁。
   *    所以这里用极淡的一层（4% 黑），并且**只在底部**投，不做四边光晕。
   */
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.04);
}

/*
 * 滚动后：总额块**缩小并吸顶**在顶栏下方（luchao 要求「总支出变小一点点再固定住」）。
 *
 * 实现要点：
 *   · 只改字号/间距/排列，**不动 DOM 结构** —— 吸顶那一刻不重排，列表不会跳；
 *   · `top` 必须等于顶栏高度（44），否则会盖住/漏出一条缝；
 *   · 要自带不透明底色，否则下面的排行会从它底下透出来。
 */
.total-block.compact {
  position: sticky;
  /*
   * ⚠️ `top` **不写死在这里**：顶栏实际高度 = 状态栏 + 44，写死 44 会让吸顶块
   *    被顶栏盖住一半（本轮实测就是这个问题）。真实值由模板的 `:style` 注入
   *    （`compactStyle`，见 script）。
   */
  z-index: 9;
  display: flex;
  align-items: baseline;
  padding: 8px 16px 10px;
  background: $v11-bg-page;
  /* 吸顶时阴影略深一点，"浮起来"的层次才看得出来 */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  transition: padding 0.2s ease-out;
  @include reduce-motion;
}

/* 缩小后的字号从 $font-display(28) 落到 $font-h2(17)，与顶栏标题同级 */
.total-block.compact .total-value {
  margin-top: 0;
  margin-left: 8px;
  font-size: $font-h2;
  line-height: $lh-h2;
}

.total-label {
  display: block;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
}

/*
 * 总额大字：36px 落在 WCAG「大字号」档（>=24px 只要 3:1），
 * 与首页 banner 的金额同一档位；颜色走收支语义色。
 */
.total-value {
  display: block;
  margin-top: 6px;
  font-size: $font-display;
  line-height: $lh-display;
  font-weight: $weight-semibold;
}

.rank-item {
  /* 上下 20px（luchao 指定）：行距要够松，一行里"名称 + 占比 + 金额 + 进度条"才不挤 */
  padding: 20px 4px;
  border-bottom: 1px solid $v11-line;
}

.rank-item:last-child {
  border-bottom: none;
}

.rank-line {
  display: flex;
  align-items: center;
}

.rank-icon {
  flex-shrink: 0;
}

.rank-name {
  margin-left: 10px;
  flex: 1;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-primary;
}

.rank-ratio {
  flex-shrink: 0;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
}

.rank-amount {
  margin-left: 8px;
  flex-shrink: 0;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-primary;
}

.rank-arrow {
  margin-left: 4px;
  flex-shrink: 0;
  color: $v11-text-tertiary;
}

.bar-track {
  margin-top: 8px;
  height: 3px;
  border-radius: 2px;
  background: $v11-line;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 2px;
}

/* ── 底部固定条 ── */

.bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 52px;
  padding: 0 12px env(safe-area-inset-bottom);
  box-sizing: content-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: $v11-bg-card;
  border-top: 1px solid $v11-line;
  z-index: 20;
}

.bar-left {
  display: flex;
  align-items: center;
}

.bar-arrow {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $v11-text-secondary;
}

/*
 * 翻页箭头不可用时**降透明度**（而不是移除元素）：
 * 布局不跳、用户也能看出"这里本来有翻页，只是当前粒度没有上一期"。
 * ⚠️ 纯装饰，不承载文字，所以用透明度表达禁用是安全的（WCAG 只约束文字对比度）。
 */
.bar-arrow-off {
  opacity: 0.3;
}

.bar-text {
  padding: 0 4px;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-primary;
}

.bar-right {
  display: flex;
  align-items: center;
}

.bar-tab {
  padding: 6px 8px;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-secondary;
}

.bar-tab.active {
  color: $v11-gold;
  font-weight: $weight-medium;
}

/* ── 弹层（与流水页同一套形态：贴底升起） ── */

.mask {
  position: fixed;
  inset: 0;
  background: $bg-mask;
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  padding-bottom: env(safe-area-inset-bottom);
}

.sheet {
  width: 100%;
  background: $v11-bg-card;
  border-radius: $v11-radius-sheet-top $v11-radius-sheet-top 0 0;
  overflow: hidden;
}

.sheet-item {
  min-height: 52px;
  display: flex;
  align-items: center;
  border-top: 1px solid $v11-line;
}

.sheet-item-row {
  justify-content: space-between;
  padding: 0 $space-5;
}

.sheet-item-text {
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  color: $v11-text-primary;
}

.sheet-item-active {
  color: $v11-gold;
  font-weight: $weight-medium;
}

.sheet-check {
  color: $v11-gold;
}

.sheet-switch {
  transform: scale(0.9);
}

.custom-range {
  display: flex;
  padding: 0 $space-5 16px;
  border-top: 1px solid $v11-line;
}

.custom-col {
  flex: 1;
  padding-top: 12px;
}

.custom-label {
  display: block;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
}

.custom-value {
  display: block;
  margin-top: 6px;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-primary;
}

.sheet-foot {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-top: 1px solid $v11-line;
}

.sheet-foot-text {
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  font-weight: $weight-medium;
  color: $v11-gold;
}

/* 金额语义色：支出青绿 / 收入红（项目约定，与全站一致） */
.expense {
  color: $v11-teal-amount;
}

.income {
  color: $danger;
}
</style>
