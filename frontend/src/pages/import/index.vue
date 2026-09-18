<template>
  <view class="page">
    <view class="nav" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="nav-inner">
        <view class="nav-btn" @click="goBack">
          <SvgIcon name="icon-chevron-left" :size="20" />
        </view>
        <text class="nav-title">流水导入</text>
        <view class="nav-btn" />
      </view>
    </view>

    <!-- ============ ① 选择态 ============ -->
    <template v-if="stage === 'select'">
      <view class="tip">
        <text class="tip-text">支持随手记导出的 .xlsx 账单文件（支出 / 收入两个工作表）</text>
      </view>

      <view class="card">
        <!-- 账本行可点：快速切换（与首页 banner 用同一套 action sheet） -->
        <view class="card-row card-row-tap" @click="switchAccount">
          <text class="card-label">导入到</text>
          <text class="card-value card-value-strong">
            {{ accountStore.current?.name || '当前账本' }}
          </text>
          <SvgIcon class="card-arrow" name="icon-chevron-right" :size="16" />
        </view>
        <view class="card-row">
          <text class="card-label">分类匹配</text>
          <text class="card-value">按本账本已有分类匹配，不会自动新建</text>
        </view>
        <view class="card-row">
          <text class="card-label">重复流水</text>
          <text class="card-value">金额 / 日期 / 时刻 / 分类 / 备注全同视为重复</text>
        </view>
      </view>

      <view class="note">
        <text class="note-text">
          文件里的「支出账户 / 收入账户」是随手记的资金账户（现金、银行卡），
          与本应用的账本不是一回事，该列会被忽略。
        </text>
      </view>

      <view class="footer">
        <view class="btn" :class="{ 'btn-disabled': loading }" @click="onPickFile">
          <text class="btn-text">{{ loading ? '解析中…' : '选择文件' }}</text>
        </view>
      </view>
    </template>

    <!-- ============ ② 预览态 ============ -->
    <template v-else-if="stage === 'preview'">
      <view class="card summary">
        <view class="summary-head">
          <text class="summary-file">{{ preview!.filename }}</text>
          <!-- 账本名可点：换账本后**重新预览**（分类匹配与去重都依赖账本） -->
          <view class="summary-account-tap" @click="switchAccount">
            <text class="summary-account">{{ preview!.accountName }}</text>
            <SvgIcon class="summary-account-arrow" name="icon-chevron-down" :size="12" />
          </view>
        </view>
        <view class="summary-grid">
          <view class="summary-cell">
            <text class="summary-num">{{ preview!.summary.total }}</text>
            <text class="summary-cap">总行数</text>
          </view>
          <view class="summary-cell">
            <text class="summary-num summary-num-ok">{{ preview!.summary.importable }}</text>
            <text class="summary-cap">将导入</text>
          </view>
          <view class="summary-cell">
            <text class="summary-num">{{ preview!.summary.skipped }}</text>
            <text class="summary-cap">跳过重复</text>
          </view>
          <view class="summary-cell">
            <text class="summary-num" :class="{ 'summary-num-warn': preview!.summary.unmatched > 0 }">
              {{ preview!.summary.unmatched }}
            </text>
            <text class="summary-cap">分类降级</text>
          </view>
          <view class="summary-cell">
            <text class="summary-num" :class="{ 'summary-num-warn': preview!.summary.invalid > 0 }">
              {{ preview!.summary.invalid }}
            </text>
            <text class="summary-cap">无法导入</text>
          </view>
        </view>

        <view v-if="preview!.sheets.length" class="sheet-line">
          <text v-for="s in preview!.sheets" :key="s.name" class="sheet-item">
            {{ s.name }} {{ s.valid }}/{{ s.total }}
          </text>
        </view>
      </view>

      <view v-if="preview!.sheetErrors.length" class="alert">
        <text v-for="(e, i) in preview!.sheetErrors" :key="i" class="alert-text">{{ e }}</text>
      </view>

      <view class="switch-row" @click="toggleSkipDuplicates">
        <text class="switch-label">跳过疑似重复的流水</text>
        <view class="switch" :class="{ 'switch-on': skipDuplicates }">
          <view class="switch-knob" />
        </view>
      </view>

      <!--
        只列**需要关注的**记录：正常流水（status=ok）不展示。
        预览的价值在于"哪些需要我处理"，把 663 条正常的铺出来只会把异常淹掉。
      -->
      <!-- 没有需要关注的记录时，不摆一排全是 0 的分组（纯噪音） -->
      <view v-if="abnormalRows.length" class="tabs">
        <view
          v-for="t in tabs"
          :key="t.key"
          class="tab"
          :class="{ 'tab-active': activeTab === t.key }"
          @click="activeTab = t.key"
        >
          <text class="tab-text">{{ t.label }} {{ t.count }}</text>
        </view>
      </view>

      <!-- 复用 .note / .note-text：不新增 font-size 声明，避免动计数断言 -->
      <view v-if="okCount > 0" class="note">
        <text class="note-text">已省略 {{ okCount }} 条正常流水，仅列出需要关注的记录</text>
      </view>

      <view class="rows">
        <view v-for="row in visibleRows" :key="row.rowNo + '-' + row.sheet" class="row">
          <view class="row-head">
            <text class="row-cat">{{ row.categoryRaw || '未分类' }}</text>
            <text class="row-amount" :class="row.type === 'income' ? 'amount-income' : 'amount-expense'">
              {{ row.type === 'income' ? '+' : '-' }}{{ row.amount || '—' }}
            </text>
          </view>
          <view class="row-meta">
            <text class="row-when">{{ row.recordDate || '日期无效' }}{{ row.recordTime ? ' ' + row.recordTime : '' }}</text>
            <text class="row-status" :class="'status-' + row.status">{{ STATUS_LABEL[row.status] }}</text>
          </view>
          <text v-if="row.note" class="row-note">{{ row.note }}</text>
          <text v-for="(m, i) in row.messages" :key="i" class="row-msg">{{ m }}</text>
        </view>
        <EmptyState
          v-if="!visibleRows.length"
          icon="icon-check-circle"
          :text="abnormalRows.length ? '这一类没有记录' : '没有需要关注的记录'"
          :sub-text="abnormalRows.length ? '' : '全部流水都能正常导入'"
        />
      </view>

      <!--
        这里说的是「明细展示被截断」，**不是**「导入被截断」——
        提交是拿文件重新解析的（方案 B），导入条数只受文件体积约束。
      -->
      <view v-if="preview!.rowsTruncated" class="note">
        <text class="note-text">
          需要关注的记录过多，此处只展示前 {{ preview!.rows.length }} 条（共
          {{ preview!.abnormal }} 条），不影响实际导入条数。
        </text>
      </view>

      <view class="footer">
        <view
          class="btn"
          :class="{ 'btn-disabled': loading || preview!.summary.importable === 0 }"
          @click="onCommit"
        >
          <text class="btn-text">
            {{ loading ? '导入中…' : '确认导入 ' + preview!.summary.importable + ' 条' }}
          </text>
        </view>
        <view class="btn-ghost" @click="reset">
          <text class="btn-ghost-text">重新选择文件</text>
        </view>
      </view>
    </template>

    <!-- ============ ③ 结果态 ============ -->
    <template v-else>
      <view class="card summary">
        <view class="summary-head">
          <text class="summary-file">导入完成</text>
          <text class="summary-account">{{ result!.accountName }}</text>
        </view>
        <view class="summary-grid summary-grid-4">
          <view class="summary-cell">
            <text class="summary-num summary-num-ok">{{ result!.imported }}</text>
            <text class="summary-cap">已导入</text>
          </view>
          <view class="summary-cell">
            <text class="summary-num">{{ result!.skipped }}</text>
            <text class="summary-cap">跳过重复</text>
          </view>
          <view class="summary-cell">
            <text class="summary-num" :class="{ 'summary-num-warn': result!.unmatched > 0 }">
              {{ result!.unmatched }}
            </text>
            <text class="summary-cap">分类降级</text>
          </view>
          <view class="summary-cell">
            <text class="summary-num" :class="{ 'summary-num-warn': result!.failed > 0 }">
              {{ result!.failed }}
            </text>
            <text class="summary-cap">无法导入</text>
          </view>
        </view>
      </view>

      <view v-if="result!.failures.length" class="rows">
        <view v-for="(f, i) in result!.failures" :key="i" class="row">
          <text class="row-msg">第 {{ f.rowNo }} 行：{{ f.message }}</text>
        </view>
      </view>

      <view class="note">
        <text class="note-text">导入的流水可在「流水」页查看；分类降级的记录可在分类管理里补建分类后改挂。</text>
      </view>

      <view class="footer">
        <view class="btn" @click="goBack">
          <text class="btn-text">完成</text>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
/**
 * 流水导入页（独立页）。
 *
 * 方案（已与 luchao 确认，决策 D1–D8）：
 *   · **后端解析**：分类匹配必须用账本级分类树，前端不打包 xlsx 库
 *   · 文件以 JSON + base64 上传（后端未引入文件上传中间件）
 *   · **两步流程**：预览 → 确认导入。项目没有批量删除，误导入只能逐条删，
 *     所以预览是唯一的防线
 *   · 疑似重复默认跳过，可一键切换为全部导入
 *   · 分类未匹配一律降级（挂一级 / 未分类）并进报告，**不自动创建分类**
 *
 * ⚠️ 与参考图的差异（**不做假控件**）：
 *   · 参考图的「支出账户 / 收入账户」是随手记的资金账户，本项目没有对应数据模型
 *     → 不做账户行，导入恒为**当前账本**
 *   · 参考图的「成员 / 商家 / 项目」同理，不做
 */
import { ref, computed } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';
import EmptyState from '@/components/EmptyState.vue';
import {
  previewImport,
  commitImport,
  type ImportPreviewResult,
  type ImportCommitResult,
  type ImportRowReport,
  type ImportRowStatus,
} from '@/api/transaction';
import { useAccountStore } from '@/store/account';
import { useCategoryStore } from '@/store/category';
import type { AccountItem } from '@/api/account';
import { pickXlsxFile, MAX_FILE_BYTES } from '@/utils/file';

const accountStore = useAccountStore();
const categoryStore = useCategoryStore();

const statusBarHeight = ref(0);
try {
  const info = uni.getSystemInfoSync();
  statusBarHeight.value = info.statusBarHeight || 0;
} catch {
  statusBarHeight.value = 0;
}

type Stage = 'select' | 'preview' | 'result';
const stage = ref<Stage>('select');
const loading = ref(false);

const preview = ref<ImportPreviewResult | null>(null);
const result = ref<ImportCommitResult | null>(null);
const skipDuplicates = ref(true);
const activeTab = ref<ImportRowStatus | 'all'>('all');

/**
 * 已选中的文件。**提交时要原样再传一次**。
 *
 * ⚠️ 为什么留着自己传，而不是让服务端记住（2026-09-17 方案 B）：
 *   后端刻意不存会话状态 —— 它没有上传中间件、也没有临时文件目录，
 *   为一次导入引入一套「上传会话 + 过期清理」不值当。文件本身才几十 KB，
 *   前端多传一次的代价远小于多一份需要维护的服务端状态。
 */
const pickedFile = ref<{ name: string; base64: string } | null>(null);

const STATUS_LABEL: Record<ImportRowStatus, string> = {
  ok: '可导入',
  duplicate: '疑似重复',
  unmatched: '分类降级',
  invalid: '无法导入',
};

/**
 * 后端**只回传需要关注的行**（分类降级 / 疑似重复 / 无法导入），
 * 正常行（status=ok）不回来 —— 真实账单 664 行里 663 行都正常，
 * 带上它们只会把真正要处理的那 1 条淹掉，还白撑大响应体。
 * 所以这里直接就是那个列表，不必再过滤一次。
 */
const abnormalRows = computed<ImportRowReport[]>(() => preview.value?.rows ?? []);

/** 被省略的正常流水条数（total 减去需要关注的） */
const okCount = computed(() => {
  if (!preview.value) return 0;
  return Math.max(0, preview.value.summary.total - preview.value.abnormal);
});

const tabs = computed(() => {
  const rows = abnormalRows.value;
  const count = (s: ImportRowStatus) => rows.filter((r) => r.status === s).length;
  return [
    { key: 'all' as const, label: '全部', count: rows.length },
    { key: 'unmatched' as const, label: '分类降级', count: count('unmatched') },
    { key: 'duplicate' as const, label: '疑似重复', count: count('duplicate') },
    { key: 'invalid' as const, label: '无法导入', count: count('invalid') },
  ];
});

const visibleRows = computed<ImportRowReport[]>(() =>
  activeTab.value === 'all'
    ? abnormalRows.value
    : abnormalRows.value.filter((r) => r.status === activeTab.value)
);

/** 选文件 → 预览。全程不写库 */
async function onPickFile() {
  if (loading.value) return;
  const picked = await pickXlsxFile();
  if (!picked.ok) {
    if (picked.reason === 'cancelled') return;
    const msg =
      picked.reason === 'unsupported'
        ? '当前端暂不支持选择文件'
        : picked.reason === 'too-large'
          ? `文件超过 ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB 上限`
          : '文件读取失败，请重试';
    uni.showToast({ title: msg, icon: 'none' });
    return;
  }

  loading.value = true;
  try {
    pickedFile.value = { name: picked.file.name, base64: picked.file.base64 };
    await reloadPreview();
    activeTab.value = 'all';
    stage.value = 'preview';
  } catch (err) {
    // 业务错误（40007/40008/40009/40010）已由拦截器 toast，这里只记日志
    console.error('[import] 预览失败', err);
    pickedFile.value = null;
  } finally {
    loading.value = false;
  }
}

/** 用当前文件与当前开关请求一次预览 */
async function reloadPreview() {
  if (!pickedFile.value) return;
  preview.value = await previewImport({
    filename: pickedFile.value.name,
    contentBase64: pickedFile.value.base64,
    accountId: accountStore.currentId || undefined,
    skipDuplicates: skipDuplicates.value,
  });
}

/**
 * 快速切换「导入到哪个账本」。
 *
 * 与首页 banner 左上角的切换是**同一套交互**（action sheet + 「（默认）」后缀），
 * 免得同一个动作在两个页面长得不一样。
 *
 * ⚠️ **不在预览态偷偷换账本**：预览结果（分类匹配、疑似重复、将导入条数）
 * 全都是**按账本算出来的** —— 换了账本还留着旧报告，用户会照着一份错的报告点确认。
 * 所以这里换完账本后：
 *   · 选择态：只更新文案（还没有预览结果，没有可失效的东西）
 *   · 预览 / 结果态：**重新走一遍预览**（结果态则退回预览态）
 * 与「切跳过重复开关」是同一个判据：**任何影响服务端结论的操作都要重新问一次**。
 */
async function switchAccount() {
  const list = accountStore.list;
  if (!list.length) return;
  if (list.length <= 1) {
    uni.showModal({
      title: '只有一个账本',
      content: '到「我的 - 账本管理」可以新建账本',
      showCancel: false,
    });
    return;
  }

  const picked = await new Promise<AccountItem | null>((resolve) => {
    uni.showActionSheet({
      itemList: list.map((a) => (a.isDefault ? `${a.name}（默认）` : a.name)),
      success: (res) => resolve(list[res.tapIndex] || null),
      fail: () => resolve(null), // 用户取消
    });
  });
  if (!picked || picked.id === accountStore.currentId) return;

  accountStore.switchTo(picked.id);
  // 分类是账本级隔离的，换账本必须让 store 重新加载（它自己会比对 loadedAccountId）
  await categoryStore.load();
  uni.showToast({ title: `已切到 ${picked.name}`, icon: 'none' });

  if (stage.value === 'select') return; // 没有预览结果，无需重算

  // 预览 / 结果态：旧报告已失效，重新算一遍
  stage.value = 'preview';
  result.value = null;
  loading.value = true;
  try {
    await reloadPreview();
    activeTab.value = 'all';
  } catch (err) {
    console.error('[import] 切换账本后重新预览失败', err);
  } finally {
    loading.value = false;
  }
}

/**
 * 切换「跳过疑似重复」。
 *
 * ⚠️ 必须**重新请求预览**（2026-09-17 方案 B 起）。
 * 早先的写法是本地重算 importable / skipped —— 那要求前端手里有**全部行**；
 * 现在后端只回传需要关注的行（正常行不回传），前端无从统计，
 * 只能让服务端按新开关重算。代价是一次解析（664 行约 30ms），换来口径唯一。
 */
async function toggleSkipDuplicates() {
  if (!preview.value || loading.value) return;
  skipDuplicates.value = !skipDuplicates.value;
  loading.value = true;
  try {
    await reloadPreview();
  } catch (err) {
    console.error('[import] 切换去重开关后重新预览失败', err);
  } finally {
    loading.value = false;
  }
}

async function onCommit() {
  if (loading.value || !preview.value || !pickedFile.value) return;
  if (preview.value.summary.importable === 0) return;

  loading.value = true;
  try {
    /*
     * 提交传的是**文件**，不是预览那批行（方案 B）。
     * 服务端会重新解析同一个文件 —— 所以「一次只能导 2000 条」那个上限不存在了，
     * 行数只受文件体积（2MB ≈ 3 万行）约束。
     */
    result.value = await commitImport({
      filename: pickedFile.value.name,
      contentBase64: pickedFile.value.base64,
      accountId: preview.value.accountId,
      skipDuplicates: skipDuplicates.value,
    });
    stage.value = 'result';
    // 账本分类没变，但流水变了：回到列表页时靠 onShow 重新拉取，这里无需额外处理
    categoryStore.load();
  } catch (err) {
    console.error('[import] 导入失败', err);
  } finally {
    loading.value = false;
  }
}

function reset() {
  stage.value = 'select';
  preview.value = null;
  result.value = null;
  pickedFile.value = null;
  activeTab.value = 'all';
}

function goBack() {
  uni.navigateBack();
}

accountStore.load();
categoryStore.load();
</script>

<style scoped lang="scss">
.page {
  min-height: $page-min-height;
  background: $v11-bg-page;
  display: flex;
  flex-direction: column;
  /* 底栏固定时给内容留出空间，避免最后一行被按钮压住 */
  padding-bottom: 132px;
}

/* ===== 自绘顶栏（5 个自绘顶栏页共用同一套约定） ===== */
.nav {
  background: $v11-bg-card;
  border-bottom: 1px solid $v11-line;
}

.nav-inner {
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 $space-2;
}

.nav-btn {
  min-width: $touch-target-min;
  height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $v11-text-primary;
}

.nav-title {
  font-size: $font-h2;
  line-height: $lh-h2;
  font-weight: $weight-semibold;
  color: $v11-text-primary;
}

/* ===== 说明条 ===== */
.tip {
  padding: $space-3 $space-4;
  background: $v11-bg-inset;
}

.tip-text {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
}

/* ===== 卡片 ===== */
.card {
  background: $v11-bg-card;
}

.card-row {
  display: flex;
  align-items: flex-start;
  padding: $space-3 $space-4;
  border-bottom: 1px solid $v11-line;
}

.card-row:last-child {
  border-bottom: none;
}

/* 可点行：按下态用底色加深（v1.1 扁平体系里不用缩放/阴影，与首页排行项同一做法） */
.card-row-tap:active {
  background: $v11-bg-inset;
}

.card-label {
  flex-shrink: 0;
  width: 76px;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-primary;
}

.card-value {
  flex: 1;
  min-width: 0;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $v11-text-secondary;
  @include text-safe;
}

/*
 * 当前账本名：比同排说明文字更重一档。
 * 它是这一行**唯一会变的值**，其余两行都是固定说明 ——
 * 拉平了看会以为三行同等性质（"这是解释" vs "这是当前状态"）。
 * 只改颜色与字重，**不加字号**（字号阶梯每加一条都要动计数断言，不值当）。
 */
.card-value-strong {
  color: $v11-text-primary;
  font-weight: $weight-medium;
}

.card-arrow {
  flex-shrink: 0;
  align-self: center;
  margin-left: $space-1;
  color: $v11-text-disabled;
}

/* ===== 提示块 ===== */
.note {
  padding: $space-3 $space-4;
}

.note-text {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
}

.alert {
  margin-top: $space-2;
  padding: $space-3 $space-4;
  background: $badge-brand-bg;
}

.alert-text {
  display: block;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $badge-brand-text;
}

/* ===== 预览汇总 ===== */
.summary {
  padding: $space-4;
}

.summary-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.summary-file {
  flex: 1;
  min-width: 0;
  font-size: $font-body;
  line-height: $lh-body;
  font-weight: $weight-medium;
  color: $v11-text-primary;
  @include text-safe;
}

/*
 * 账本名 + 切换箭头。整块可点（换账本会重新预览），
 * 所以触摸目标要够大 —— 光文字本身只有 12px 高，点不中。
 */
.summary-account-tap {
  flex-shrink: 0;
  margin-left: $space-2;
  /* 负外边距把点击区撑到 44 高，但不把卡片撑高（视觉零变化） */
  min-height: $touch-target-min;
  margin-top: -10px;
  margin-bottom: -10px;
  display: flex;
  align-items: center;
}

.summary-account-tap:active {
  opacity: 0.6;
}

.summary-account {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
}

.summary-account-arrow {
  margin-left: 2px;
  color: $v11-text-disabled;
}

.summary-grid {
  display: flex;
  flex-wrap: wrap;
  margin-top: $space-3;
}

.summary-cell {
  /* 5 列在 320px 下每列 64px，够放 4 位数字 */
  width: 20%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 结果态只有 4 个数（已导入 / 跳过重复 / 分类降级 / 无法导入），等分成 4 列 */
.summary-grid-4 .summary-cell {
  width: 25%;
}

.summary-num {
  font-size: $font-h2;
  line-height: $lh-h2;
  font-weight: $weight-semibold;
  color: $v11-text-primary;
  font-variant-numeric: tabular-nums;
}

.summary-num-ok {
  color: $v11-teal-amount;
}

.summary-num-warn {
  color: $v11-income-amount;
}

.summary-cap {
  margin-top: 2px;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
}

.sheet-line {
  display: flex;
  flex-wrap: wrap;
  margin-top: $space-3;
}

.sheet-item {
  margin-right: $space-4;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
}

/* ===== 开关行 ===== */
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 56px;
  margin-top: $space-2;
  padding: $space-2 $space-4;
  background: $v11-bg-card;
  border-top: 1px solid $v11-line;
  border-bottom: 1px solid $v11-line;
}

.switch-label {
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-primary;
}

.switch {
  flex-shrink: 0;
  width: 48px;
  height: 28px;
  border-radius: $radius-pill;
  background: $v11-line-strong;
  padding: 2px;
  display: flex;
  align-items: center;
}

.switch-on {
  background: $v11-gold;
  justify-content: flex-end;
}

.switch-knob {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: $text-inverse;
}

/* ===== 分组 Tab ===== */
.tabs {
  display: flex;
  flex-wrap: wrap;
  padding: $space-3 $space-4 0;
}

.tab {
  margin: 0 $space-2 $space-2 0;
  padding: 4px $space-3;
  border-radius: $radius-pill;
  background: $v11-bg-card;
}

.tab-active {
  background: $v11-gold-soft;
  /* 浅金底必须配金色细边，否则选中态在白卡旁几乎看不出来 */
  border: 1px solid $v11-gold;
  padding: 3px 11px;
}

.tab-text {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
}

.tab-active .tab-text {
  color: $v11-gold;
  font-weight: $weight-medium;
}

/* ===== 行列表 ===== */
.rows {
  background: $v11-bg-card;
}

.row {
  padding: $space-3 $space-4;
  border-bottom: 1px solid $v11-line;
}

.row-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.row-cat {
  flex: 1;
  min-width: 0;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $v11-text-primary;
  @include text-safe;
}

.row-amount {
  flex-shrink: 0;
  margin-left: $space-2;
  font-size: $font-body;
  line-height: $lh-body;
  font-weight: $weight-medium;
  font-variant-numeric: tabular-nums;
}

.amount-expense {
  color: $v11-teal-amount;
}

.amount-income {
  color: $v11-income-amount;
}

.row-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 2px;
}

.row-when {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
  font-variant-numeric: tabular-nums;
}

.row-status {
  font-size: $font-caption;
  line-height: $lh-caption;
}

.status-ok {
  color: $v11-teal-amount;
}

.status-duplicate {
  color: $v11-text-secondary;
}

.status-unmatched {
  color: $warning;
}

.status-invalid {
  color: $v11-income-amount;
}

.row-note {
  display: block;
  margin-top: 2px;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
  @include text-safe;
}

.row-msg {
  display: block;
  margin-top: 2px;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $warning;
  @include text-safe;
}

/* ===== 底部按钮 ===== */
.footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: $space-3 $space-4;
  padding-bottom: calc(#{$space-3} + env(safe-area-inset-bottom));
  background: $v11-bg-card;
  border-top: 1px solid $v11-line;
}

.btn {
  min-height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $v11-radius-btn;
  background: $v11-gold;
}

/*
 * 禁用态：底改浅金 $v11-gold-fill，**文字必须同时换深色** ——
 * 白字压 #E4AD77 只有 1.99:1（连按钮上写什么都看不清）。
 */
.btn-disabled {
  background: $v11-gold-fill;
}

.btn-disabled .btn-text {
  color: $v11-gold-pressed;
}

.btn-text {
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  font-weight: $weight-medium;
  color: $text-inverse;
}

.btn-ghost {
  min-height: $touch-target-min;
  margin-top: $space-2;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-ghost-text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $v11-gold;
}
</style>