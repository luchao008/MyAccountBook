<template>
  <view class="page">
    <!-- 收支切换 -->
    <view class="type-switch">
      <view class="type-btn" :class="{ active: type === 'expense' }" @click="switchType('expense')">
        支出
      </view>
      <view class="type-btn" :class="{ active: type === 'income' }" @click="switchType('income')">
        收入
      </view>
    </view>

    <!--
      金额展示：含运算符时切「结果大字 + 表达式小字」双行形态。
      盒子**固定高度**：表达式行无论有无都占位（visibility 隐藏而非移除），
      输入过程中盒子不会上下跳动。
    -->
    <view class="amount-box">
      <view class="amount-line">
        <text class="amount" :class="amountSizeClass">{{ displayAmount }}</text>
        <text class="currency">¥</text>
      </view>
      <text class="expr" :class="{ invisible: !hasExpr }">{{ hasExpr ? amount : '0' }}</text>
    </view>

    <!-- 分类：点击从底部弹出选择 -->
    <view class="panel">
      <view class="row" @click="openPicker">
        <text class="row-label">分类</text>
        <text class="row-value" :class="{ placeholder: !categoryId }">
          {{ categoryId ? categoryStore.fullNameOf(categoryId) : '请选择二级分类' }}
        </text>
        <SvgIcon class="row-arrow" name="icon-chevron-right" :size="16" />
      </view>
    </view>

    <!-- 日期（含时刻）与备注 -->
    <view class="panel">
      <view class="row" @click="showDatePicker = true">
        <text class="row-label">日期</text>
        <text class="row-value" :class="{ placeholder: !recordDate }">
          {{ recordDate }}{{ recordTime ? ' ' + recordTime : '' }}
        </text>
        <SvgIcon class="row-arrow" name="icon-chevron-right" :size="16" />
      </view>
      <view class="row">
        <text class="row-label">备注</text>
        <input class="note-input" v-model="note" placeholder="写点什么（选填）" maxlength="255" />
      </view>
    </view>

    <!-- 编辑模式下可删除 -->
    <view v-if="isEdit" class="delete-box" @click="onDelete">
      <text class="delete-text">删除这笔记录</text>
    </view>

    <!-- 底部分类选择器 -->
    <CategoryPicker v-model:visible="showPicker" v-model="categoryId" :type="type" />

    <!-- 底部日期时间选择器 -->
    <DateTimePicker
      v-model:visible="showDatePicker"
      :date="recordDate"
      :time="recordTime"
      @confirm="onDateConfirm"
    />

    <!-- 键盘 -->
    <view class="keyboard-fixed">
      <AmountKeyboard v-model="amount" @confirm="save" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import AmountKeyboard from '@/components/AmountKeyboard.vue';
import CategoryPicker from '@/components/CategoryPicker.vue';
import DateTimePicker from '@/components/DateTimePicker.vue';
import SvgIcon from '@/components/SvgIcon.vue';
import { useCategoryStore } from '@/store/category';
import { useAccountStore } from '@/store/account';
import {
  createTransaction,
  getTransaction,
  updateTransaction,
  deleteTransaction,
} from '@/api/transaction';
import { enqueue, genClientId, isOnline } from '@/utils/offline';
import { evalExpr, formatCents, isExpression } from '@/utils/amountExpr';

const categoryStore = useCategoryStore();
const accountStore = useAccountStore();

/** 编辑模式下的账单 ID，新增时为空 */
const editId = ref('');
const isEdit = computed(() => !!editId.value);

/**
 * 复制态：从流水页左滑「复制」进来（`?copyFrom=<id>`）。
 *
 * ⚠️ 与编辑态**互斥**且语义不同：
 *   · 编辑 → `editId` 有值、`isEdit` 为 true、保存走 PUT 改原单
 *   · 复制 → `editId` **为空**、`isEdit` 为 false、保存走 POST 新建
 *   两者都从"加载原单详情回填"开始，但落点完全不同。
 */
const isCopy = ref(false);

/** 上次记账成功用的分类 id（新增时默认选中它） */
const LAST_CATEGORY_KEY = 'lastTxnCategoryId';

const type = ref<'income' | 'expense'>('expense');
/**
 * 金额**或加减表达式**（如 `12.5+3-2`）。
 * 输入规则与求值全部在 utils/amountExpr.ts；保存时才求值入库，
 * 编辑/复制回填的纯数字同样是合法表达式，无需特判。
 */
const amount = ref('');

/** 是否处于「表达式」形态（含真正的运算符） → 金额区切双行展示 */
const hasExpr = computed(() => isExpression(amount.value));

/** 大字位的内容：表达式形态显示实时结果，否则显示原始输入 */
const displayAmount = computed(() => {
  if (!hasExpr.value) return amount.value || '0.00';
  const cents = evalExpr(amount.value);
  return cents === null ? '0' : formatCents(cents);
});

/*
 * 金额字号的缩档（防溢出）：盒子定宽，位数越多字越小。
 * 阈值按 320px 屏实测余量定 —— 内容区 248px，数字按 tabular-nums
 * 约 0.6em 宽估：36px 下 10 位 ≈ 232px（含 ¥）刚好放满。
 * 最长可能 = 负号 + 9 位整数 + 小数点 + 2 位小数 = 13 字符。
 */
const amountSizeClass = computed(() => {
  const len = displayAmount.value.length;
  if (len > 12) return 'sm-2';
  if (len > 10) return 'sm-1';
  return '';
});
/** 只能选二级分类，所以这里必然是一个二级分类的 id */
const categoryId = ref<string | null>(null);
const recordDate = ref(today());
/**
 * HH:mm；null 表示不记录时刻。
 *
 * ⚠️ 新增时**用户没主动选时间也不传 null** —— 见 save() 里"提交时取当前时刻"的处理：
 *    实际提交的那一刻才用 `new Date()` 算时刻，而不是进页面时就算好。
 *    这样"打开页面 14:00、14:30 才保存"记的是 **14:30**，语义更准。
 *    编辑已有账单时沿用库里的原值（改旧账不该悄悄改掉它的时间）。
 */
const recordTime = ref<string | null>(null);

/**
 * 用户是否**主动清掉**过时刻（在日期选择器里关掉时刻开关、或手动清空）。
 *
 * 为什么要单独记这个：新增时"没选过"要默认当前时刻，但"主动关掉"是明确的
 * 用户意图 —— 两者都是 `recordTime === null`，靠值本身分不开。
 */
const userClearedTime = ref(false);
const note = ref('');
const showPicker = ref(false);
const showDatePicker = ref(false);
const submitting = ref(false);

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

onLoad(async (options?: { id?: string; copyFrom?: string }) => {
  // 离线时账本列表拉不到 —— 包 try/catch，用本地已存的 currentId 继续
  try {
    await accountStore.load();
  } catch (err) {
    console.warn('[record] 账本加载失败（离线？）', err);
  }
  /*
   * 设计 D18：空账本静默从母本导入全部分类。
   * ⚠️ 离线时这里会失败（分类 store 已尽量读本地缓存）—— 包 try/catch
   *    避免整页崩掉；缓存命中时分类选择器仍可用，可继续离线记账。
   */
  try {
    await categoryStore.ensureFromMother();
  } catch (err) {
    console.warn('[record] 分类加载失败（离线？），使用本地缓存', err);
  }

  // 带 id 进入 = 编辑已有账单
  if (options?.id) {
    editId.value = options.id;
    uni.setNavigationBarTitle({ title: '编辑账单' });
    await loadDetail(options.id);
    return;
  }

  /*
   * 带 copyFrom 进入 = **复制态**（流水页左滑「复制」）。
   *
   * ⚠️ **不是编辑**：`isEdit` 仍为 false，保存走 POST 新建一条，原单不动。
   *    所以这里**不设 editId**，只回填表单。
   *
   * ⚠️ **时间保留原单**（luchao 确认选 B）：复制常用来补录同日多笔，
   *    把时间重置成"现在"反而要多改一步。注意 recordTime 的默认值逻辑里，
   *    非编辑态且用户没动过开关时会填"当前时刻"（见 save 里的 nowTime()），
   *    这里回填原单时刻后它就变成"用户选过的值"，不会被覆盖。
   */
  if (options?.copyFrom) {
    isCopy.value = true;
    await loadDetail(options.copyFrom);
    uni.setNavigationBarTitle({
      title: type.value === 'income' ? '复制收入' : '复制支出',
    });
    return;
  }

  /*
   * 新增态：默认选中**上次记账成功用的分类**（luchao 要求）。
   * 分类可能已被删/隐藏 —— 用 categoryStore.byId 校验，无效则留空。
   * 仅新增生效；编辑/复制各自载入原单分类，不覆盖。
   */
  const lastId = (uni.getStorageSync(LAST_CATEGORY_KEY) || '') as string;
  if (lastId && categoryStore.byId(lastId)) {
    categoryId.value = lastId;
  }

  uni.setNavigationBarTitle({ title: `记一笔 · ${accountStore.currentName}` });
});

/**
 * 从「新建分类」页返回时刷新分类列表。
 *
 * CategoryPicker 的「+」会跳去 `pages/category-new` 新建二级分类；
 * navigateBack 回来时本页实例未销毁、onLoad 不会再跑 —— 不刷新的话
 * 选择器里看不到刚建的分类。首次进入由 onLoad 负责，这里用 firstShow 跳过。
 */
let firstShow = true;
onShow(async () => {
  if (firstShow) {
    firstShow = false;
    return;
  }
  try {
    await categoryStore.load(true);
  } catch (err) {
    console.warn('[record] 返回后刷新分类失败', err);
  }
});

async function loadDetail(id: string) {
  try {
    const detail = await getTransaction(id);
    type.value = detail.type;
    amount.value = detail.amount;
    categoryId.value = detail.categoryId;
    recordDate.value = detail.recordDate;
    // 后端返回 HH:mm:ss，展示与提交都只需要 HH:mm
    recordTime.value = detail.recordTime ? detail.recordTime.slice(0, 5) : null;
    note.value = detail.note || '';
  } catch (err) {
    console.error('[record] 详情加载失败', err);
    uni.showToast({ title: '加载失败', icon: 'none' });
    setTimeout(() => uni.navigateBack(), 800);
  }
}

function switchType(next: 'income' | 'expense') {
  if (type.value === next) return;
  type.value = next;
  // 切换收支类型后，原分类一定不匹配，必须清空
  categoryId.value = null;
}

function onDateConfirm(payload: { date: string; time: string | null }) {
  recordDate.value = payload.date;
  recordTime.value = payload.time;
  // 用户这次明确选了（或明确清空了）时刻 —— 之后不再自动补默认值
  userClearedTime.value = payload.time === null;
}

/** 当前时刻 HH:mm */
function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function openPicker() {
  if (!categoryStore.loaded) {
    uni.showToast({ title: '分类加载中，请稍后', icon: 'none' });
    return;
  }
  showPicker.value = true;
}

async function save() {
  if (submitting.value) return;

  if (!categoryId.value) {
    uni.showToast({ title: '请选择分类', icon: 'none' });
    showPicker.value = true;
    return;
  }

  /*
   * 金额求值：amount 可能是加减表达式（键盘支持 + / -）。
   * evalExpr 容忍尾部悬空的运算符（`12+` 按 12 算），
   * 返回**分**（整数），<=0（含负数结果）一律拦下。
   */
  const cents = evalExpr(amount.value);
  if (cents === null) {
    uni.showToast({ title: '请输入有效金额', icon: 'none' });
    return;
  }
  if (cents <= 0) {
    uni.showToast({ title: '金额必须大于 0', icon: 'none' });
    return;
  }
  const value = cents / 100;

  const payload = {
    type: type.value,
    amount: value.toFixed(2),
    recordDate: recordDate.value,
    categoryId: categoryId.value,
    note: note.value.trim(),
    /*
     * 时刻：
     *   · 用户主动选过 → 用他选的
     *   · 新增且没选过 → **提交这一刻**的当前时刻（不是进页面时算好的）
     *   · 编辑且库里原本为空 → 保持空（不擅自补时刻，改旧账不该动它的时间语义）
     */
    recordTime:
      recordTime.value ||
      (!isEdit.value && !isCopy.value && !userClearedTime.value ? nowTime() : ''),
    // 新增时记入当前账本；编辑时不传，保持原账本不变
    ...(isEdit.value ? {} : { accountId: accountStore.currentId }),
  };

  /*
   * 离线分支（仅新增/复制；编辑不支持离线 —— 见下）。
   *
   * 判据用 isOnline()（navigator.onLine），而不是"请求失败后再入队"：
   * 后者要先等一次超时（10s），用户体验差且可能因"服务端其实收到了但响应丢了"
   * 而误入队。先判断在线状态更直接。若在线但实际请求失败，仍走 catch 兜底提示。
   */
  if (!isEdit.value && !isOnline()) {
    enqueue({ clientId: genClientId(), queuedAt: Date.now(), payload });
    uni.showToast({ title: '离线保存成功，联网后自动上传', icon: 'none' });
    setTimeout(() => {
      uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/main/index' }) });
    }, 800);
    return;
  }

  submitting.value = true;
  try {
    if (isEdit.value) {
      await updateTransaction(editId.value, payload);
      uni.showToast({ title: '已更新', icon: 'success' });
    } else {
      await createTransaction(payload);
      /*
       * 记下这次成功的分类，供**下次新增**默认选中（luchao 要求）。
       * 只在这里写（编辑不改）：编辑是"改旧账"，不该影响新增的默认值。
       */
      if (categoryId.value) uni.setStorageSync(LAST_CATEGORY_KEY, categoryId.value);
      // 复制态与新增共用这一支：都是 POST 新建（见 onLoad 的 copyFrom 注释）
      uni.showToast({ title: isCopy.value ? '已复制' : '已记录', icon: 'success' });
    }
    setTimeout(() => {
      // 兜底用 reLaunch 而不是 switchTab：原生 tabBar 已移除，switchTab 会失败
      uni.navigateBack({
        fail: () => uni.reLaunch({ url: '/pages/main/index' }),
      });
    }, 600);
  } catch (err) {
    console.error('[record] 保存失败', err);
    /*
     * 兜底：判在线但请求仍失败（断网瞬间 / 服务端不可达）。
     * 对**新增**也入队（幂等键保证不会重复）；编辑则只能提示重试。
     */
    if (!isEdit.value) {
      enqueue({ clientId: genClientId(), queuedAt: Date.now(), payload });
      uni.showToast({ title: '网络异常，已离线保存，联网后自动上传', icon: 'none' });
      setTimeout(() => {
        uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/main/index' }) });
      }, 800);
    } else {
      uni.showToast({ title: '网络异常，请联网后重试', icon: 'none' });
    }
  } finally {
    submitting.value = false;
  }
}

function onDelete() {
  uni.showModal({
    title: '删除记录',
    content: '删除后不可恢复，确定吗？',
    success: async (res) => {
      if (!res.confirm) return;
      try {
        await deleteTransaction(editId.value);
        uni.showToast({ title: '已删除', icon: 'success' });
        setTimeout(() => {
          // 同上：原生 tabBar 已移除
          uni.navigateBack({
            fail: () => uni.reLaunch({ url: '/pages/main/index' }),
          });
        }, 600);
      } catch (err) {
        console.error('[record] 删除失败', err);
      }
    },
  });
}
</script>

<style scoped lang="scss">
.page {
  min-height: $page-min-height;
  background: $v11-bg-page;
  padding: 16px 16px 280px;
}

/*
 * 收支切换：**「文字 + 短下划线」**（v1.1 参考图的写法）。
 *
 * v1.0 是分段控件（白底块 + 圆角 + 选中填品牌橙）—— 那是「块状」语言；
 * v1.1 改为 iOS 顶栏式的**文字 + 26x3 短下划线**，切换控件不再需要独立的卡片载体。
 *
 * 下划线用 $v11-gold-fill（#E4AD77，纯图形，压白 1.99 不承载文字），
 * 选中文字用 $v11-gold（#A85F12，压白卡 4.87 达标）。
 * 两条线只做图形，所以「淡」是安全的；**文字必须用校准值**。
 */
.type-switch {
  display: flex;
  /* 下划线由 .type-btn 的 ::after 定位，容器只负责横向排布 */
  margin-bottom: 16px;
}

.type-btn {
  flex: 1;
  position: relative;
  text-align: center;
  padding: 10px 0 12px;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-secondary;
}

/* 短下划线：26x3，居中于文字下方 —— 参考图的实测量法 */
.type-btn::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 4px;
  width: 26px;
  height: 3px;
  border-radius: 2px;
  background: transparent;
  transform: translateX(-50%);
  transition: background 0.25s ease-out;
  @include reduce-motion;
}

.type-btn.active {
  color: $v11-gold;
  font-weight: $weight-medium;
}

/* 选中态：颜色 + 字重 + 下划线三处同时变化（不依赖单一颜色区分，WCAG 1.4.1） */
.type-btn.active::after {
  background: $v11-gold-fill;
}

/*
 * 金额盒：**固定高度**（luchao 要求），不随内容变化。
 * 118 = padding 24×2 + 结果行 $lh-display-lg 44 + 间距 2 + 表达式行 $lh-body 24。
 * 表达式行用 visibility 隐藏占位（不是 v-if/display:none），
 * 进入/退出表达式形态时盒子纹丝不动。
 */
.amount-box {
  background: $v11-bg-card;
  border-radius: $v11-radius-card;
  padding: 24px 20px;
  height: 118px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
}

.amount-line {
  display: flex;
  align-items: baseline;
  max-width: 100%;
}

/*
 * 表达式行（如 `12.5+3-2`）：次要信息，用小字 + 二级文字色，
 * 放在结果**下方**。它是"怎么算出来的"的凭据，不是主角。
 */
.expr {
  @include tabular-nums;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-secondary;
  margin-top: 2px;
  /* 长表达式不折行、从左侧截断（尾部永远是最新输入，必须可见） */
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  direction: rtl;
  text-align: right;
}

/* 无表达式时占位不可见 —— 高度照旧，盒子不跳 */
.expr.invisible {
  visibility: hidden;
}

/*
 * 货币符号放在数字**后面**（`100¥`，luchao 要求），
 * 与结果大字 baseline 对齐，比大字小两档。
 */
.currency {
  font-size: $font-h1;
  line-height: $lh-h1;
  color: $v11-text-primary;
  margin-left: 4px;
}

/*
 * 金额大字：**青绿**（v1.1 的核心视觉锚点之一）。
 *
 * 用 $v11-teal-large（#2E9496，压白卡 3.63）而**不是**列表金额用的
 * $v11-teal-amount（#0F7B7C，5.07）。WCAG 对 >=24px 的大字只要求 3:1，
 * 36px 的金额正落在大字档，用 3.63 那个才拿得到参考图里浅青绿的观感；
 * 换成 0F7B7C 会明显偏深、失去通透感。
 * **三档青绿各司其职，不要互换**（图形 2.08 / 大字 3.63 / 小字 5.63）。
 */
.amount {
  @include tabular-nums;
  font-size: $font-display-lg;
  line-height: $lh-display-lg;
  font-weight: $weight-semibold;
  color: $v11-teal-large;
  white-space: nowrap;
}

/*
 * 长金额缩档（阈值见 script 里 amountSizeClass 的注释）：
 * 位数多就缩字号，而不是截断金额 —— 金额被 ellipsis 是正确性事故。
 * 盒子是固定高度的，缩档只改行内高度，布局不动。
 */
.amount.sm-1 {
  font-size: $font-display;
  line-height: $lh-display;
}

.amount.sm-2 {
  font-size: $font-h1;
  line-height: $lh-h1;
}

.panel {
  background: $v11-bg-card;
  border-radius: $v11-radius-card;
  padding: 4px 16px;
  margin-top: 16px;
}

/*
 * 行分隔线：$v11-line #F1F1F1（压白卡 1.13:1）。
 * 这是 v1.1 里「最容易漏掉、但用户第一眼就看出来」的一处 ——
 * 用户原话「线条太深」指的就是这类线（旧 $v11-line 是 1.19:1，数值只差 0.06，
 * 但配合 1px 物理厚度，观感差别明显）。
 */
.row {
  display: flex;
  align-items: center;
  padding: 14px 0;
  border-bottom: 1px solid $v11-line;
}

.row:last-child {
  border-bottom: none;
}

.row-label {
  /* 固定宽度一律写 min-width 而不是 width（方案 §3.3）：
     width 在大字号下会把标签卡住、逼它压到右边的内容上。
     56px 在 x2 字号下不够，min-width 允许它自己撑开。 */
  min-width: 56px;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-primary;
  flex-shrink: 0;
}

.row-value {
  flex: 1;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-primary;
}

/*
 * 占位文字：$v11-text-tertiary #9A9AA0 只有 2.80:1 —— **不达标**。
 * 但它是「还没填」的提示，不是要读的内容，属 placeholder 语义；
 * 一旦选中分类这个类就摘掉，文字立刻回到 $v11-text-primary（15.85:1）。
 * 除占位符外不要用 tertiary 承载任何正文。
 */
.placeholder {
  color: $v11-text-tertiary;
}

.row-arrow {
  color: $v11-text-tertiary;
  margin-left: 6px;
}

.note-input {
  flex: 1;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-primary;
}

.delete-box {
  margin-top: 16px;
  background: $v11-bg-card;
  border-radius: $v11-radius-card;
  padding: 16px;
  text-align: center;
}

/*
 * 删除按钮文字色：$danger（#D92D20，4.83:1 达标）。
 * 这里用 $danger 而**不是** $v11-teal-amount / $v11-teal-amount：
 * 「删除」是**危险操作**语义，不是「支出」语义。两者色相接近但语义不同，
 * 禁止混用（执行计划 §6.1 红线：$success / $danger 不与收支语义互借）。
 */
.delete-text {
  font-size: $font-body;
  line-height: $lh-body;
  color: $danger;
}

.keyboard-fixed {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
