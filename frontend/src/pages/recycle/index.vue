<template>
  <view class="page">
    <!-- 自绘顶栏（navigationStyle: custom） -->
    <view class="nav" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="nav-inner">
        <view class="nav-btn" @click="goBack">
          <SvgIcon name="icon-chevron-left" :size="20" />
        </view>
        <text class="nav-title">流水回收站</text>
        <view class="nav-btn" />
      </view>
    </view>

    <!-- 说明条：把「7 天」这条规则写在最上面，用户一眼知道保留期 -->
    <view class="tip">
      <text class="tip-text">删除的流水会保留 7 天，超期自动清除</text>
    </view>

    <!-- 骨架：照抄「组头 + 卡片内两行」的真实形状 -->
    <view v-if="loading" class="list">
      <view v-for="n in 3" :key="n">
        <view class="group-head"><Skeleton w="120" h="12" /></view>
        <view class="card">
          <view v-for="m in 2" :key="m" class="item">
            <view class="item-top">
              <Skeleton w="44" h="12" />
              <Skeleton w="56" h="14" />
            </view>
            <view class="item-main">
              <view class="item-icon"><Skeleton circle :h="28" /></view>
              <view class="item-name"><Skeleton w="80" h="14" /></view>
              <view class="item-amount"><Skeleton w="56" h="14" /></view>
            </view>
          </view>
        </view>
      </view>
    </view>
    <EmptyState
      v-else-if="!list.length"
      icon="icon-inbox"
      text="回收站是空的"
      sub-text="删除的流水会在这里保留 7 天"
    />

    <view v-else class="list">
      <!--
        按删除时间倒序（后端已排好），这里只按「删除日期」分组展示 ——
        与参考图一致（图里是按 2026年09月07日 / 2026年09月06日 分组）。
      -->
      <template v-for="g in groups" :key="g.date">
        <view class="group-head"><text class="group-head-text">{{ g.label }}</text></view>
        <view class="card">
          <view v-for="t in g.items" :key="t.id" class="item">
            <view class="item-top">
              <text class="item-time">{{ timeOf(t) }}</text>
              <text class="item-action">删除流水</text>
            </view>
            <view class="item-main">
              <CategoryIcon class="item-icon" :name="t.category?.icon || 'cat-misc'" :size="28" />
              <text class="item-name">{{ t.category?.name || '未分类' }}</text>
              <text class="item-amount" :class="t.type === 'income' ? 'income' : 'expense'">
                {{ formatMoney(t.amount) }}
              </text>
              <view class="restore" @click="onRestore(t)"><text class="restore-text">恢复</text></view>
            </view>
            <text class="item-meta">{{ metaOf(t) }}</text>
          </view>
        </view>
      </template>

      <!--
        分页入口 + 「已显示 x / y 条」（2026-10-01 新增）。

        ⚠️ 这块修的是**正确性**，不是装饰：接口以前全量返回，现在一次只回 20 条 ——
          没有这个入口，"第 21 条之后的删除记录"就再也看不到了，而且**没有任何提示**。
          文案里带上「已显示 x / y 条」，让"被截断"这件事显式可见（与流水页明细同一个理由）。
          全部加载完也保留一行「已显示全部 N 条」：用户随时知道"这就是全部"，
          而不是对着一个停在半截的列表猜。

        ⚠️ 用**显式按钮**而不是 `onReachBottom`：
          ① 与流水页明细的「加载更多」同一套做法，三端行为完全一致；
          ② `onReachBottom` 在"内容不足一屏"时**永远不会触发**，而回收站经常只有几条，
             恰好就是这种情况（那时用户根本看不到还有下一页）；
          ③ 这页是原生页面滚动 + 自绘顶栏，"能不能继续加载"写在一个可点的按钮上最直观。
      -->
      <view class="foot">
        <view v-if="hasMore" class="more" @click="loadMore">
          <text class="state-text">
            {{ loadingMore ? '加载中…' : `加载更多（已显示 ${list.length} / ${total} 条）` }}
          </text>
        </view>
        <text v-else class="state-text">已显示全部 {{ total }} 条</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 流水回收站。
 *
 * ⚠️ **只做「恢复」**（luchao 确认，照参考图）—— 没有「彻底删除」也没有「清空回收站」。
 *    超期记录由后端**查询时惰性真删**（见 transaction.service 的 listDeleted），
 *    用户不需要为"永久删除"操心。
 *
 * ⚠️ 本页是**独立页**（有返回按钮、无底栏），入口在「我的 → 流水回收站」。
 *
 * ⚠️ 参考图里每行还有「成员」（头像 + 名字），本项目**没有成员概念**，
 *    所以 meta 行只显示「账本名 · 时间」，不做假数据。
 *
 * ⚠️ 2026-10-01 加分页：列表接口改为一次只回一页（20 条）。因此页面必须自己维护
 *    `total` 并显式给出「加载更多」，否则超出一页的记录会**静默消失**（详见 loadMore）。
 */
import { ref, computed, onMounted } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';
import CategoryIcon from '@/components/CategoryIcon.vue';
import EmptyState from '@/components/EmptyState.vue';
import Skeleton from '@/components/Skeleton.vue';
import { getDeletedTransactions, restoreTransaction, type TransactionItem } from '@/api/transaction';
import { formatMoney } from '@/utils/format';

const statusBarHeight = ref(0);
try {
  const info = uni.getSystemInfoSync();
  statusBarHeight.value = info.statusBarHeight || 0;
} catch {
  statusBarHeight.value = 0;
}

const loading = ref(false);
const list = ref<TransactionItem[]>([]);
/** 加载下一页时只拦按钮本身，不遮整个列表（否则已看到的内容会闪成骨架） */
const loadingMore = ref(false);
/** 后端给的**保留期内总条数**（不只是已加载的这些） */
const total = ref(0);
/** 已加载到第几页；「加载更多」从 page + 1 取 */
const page = ref(1);

/**
 * 每页条数。
 *
 * ⚠️ 与后端 `DeletedTransactionQueryDTO` 的默认值一致（20，上限 100），但前端**始终显式传**：
 *    默认值只该是"请求没带参数时的兜底"，真实分页节奏由调用方决定 ——
 *    否则哪天后端改了默认值，前端的每页条数会跟着悄悄变，而这种变化不会有人发现。
 *    取 20 而不是流水页的 100：回收站是低频页，首屏出得快比少点几次更重要。
 */
const PAGE_SIZE = 20;

/**
 * 判断依据用「已加载条数 vs 后端总数」，而不是"最后一页是否满页"：
 * 满页判定在"总数恰好是 size 的整数倍"时会多请求一次空页。
 */
const hasMore = computed(() => list.value.length < total.value);

/**
 * 按「删除日期」分组（后端已按 deletedAt 倒序）。
 *
 * ⚠️ 日期文案要手工拼，不能用 `replace(/-/g, '年')` —— 那样两个连字符
 *    都会被替换掉（`2026-09-07` → `2026年09年07`）。参考图是 `2026年09月07日`。
 */
const groups = computed(() => {
  const map = new Map<string, TransactionItem[]>();
  for (const t of list.value) {
    // deletedAt 是 UTC ISO；取本地日期（回收站按"用户看到的哪天删的"分组）
    const d = localDateOf(t.deletedAt);
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(t);
  }
  return [...map.entries()].map(([date, items]) => ({
    date,
    label: formatCnDate(date),
    items,
  }));
});

/** ISO → 本地 YYYY-MM-DD（空值回落成空串） */
function localDateOf(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** YYYY-MM-DD → 2026年09月07日（参考图的写法） */
function formatCnDate(d: string): string {
  if (!d) return '未知日期';
  const [y, m, day] = d.split('-');
  return `${y}年${m}月${day}日`;
}

/** 删除时刻 HH:mm */
function timeOf(t: { deletedAt?: string | null }): string {
  const s = t.deletedAt;
  if (!s) return '';
  const d = new Date(s);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 副标题：账本名 · 原记账日期时刻。
 *
 * ⚠️ 用**完整日期**而不是 `dayHeader()`（后者返回 `15日 周二`）——
 *    参考图这里是 `2026-06-15 08:35` 这种完整形式。因为已经不在原上下文里了，
 *    "15日" 看不出是哪个月。
 *
 * ⚠️ 参考图还有「成员」（头像 + 名字），本项目**没有成员概念**，不做假数据。
 */
function metaOf(t: TransactionItem): string {
  const parts: string[] = [];
  if (t.account?.name) parts.push(t.account.name);
  parts.push(t.recordTime ? `${t.recordDate} ${t.recordTime.slice(0, 5)}` : t.recordDate);
  return parts.join(' · ');
}

/**
 * 首屏加载 / 恢复后重拉：**一律回到第 1 页**。
 *
 * ⚠️ 分页后 `list` 只是"第 1 页"，不是全量 —— 所以 `total` 必须单独存下来，
 *    界面上要显示「已显示 x / y 条」，否则用户看到的就只是一个被静默截断的列表。
 */
async function load() {
  loading.value = true;
  try {
    const res = await getDeletedTransactions({ page: 1, size: PAGE_SIZE });
    list.value = res.list;
    total.value = res.total;
    page.value = 1;
  } catch (err) {
    console.error('[recycle] 加载失败', err);
  } finally {
    loading.value = false;
  }
}

/**
 * 加载下一页（模板里的「加载更多」）。
 *
 * ⚠️ 用 `page.value + 1` 递增，而不是流水页那种 `Math.floor(loaded / PAGE_SIZE) + 1`：
 *    这里 `loaded` 会因为"并发恢复导致某页少一条"而不再等于 `page * PAGE_SIZE`，
 *    用除法算出来的页码会**指回已经取过的那一页**，把同一批记录拉第二遍。
 *    页码是单调递增的游标，就别从"条数"反推它。
 *
 * ⚠️ 合并时按 id 去重（不是多余的防御）：offset 分页在"两次请求之间有人恢复了流水"
 *    时会整体前移一位，下一页可能带回**已经显示过的**记录。不去重的话
 *    `v-for :key="t.id"` 会出现重复 key —— Vue 会警告，且列表渲染错位。
 */
async function loadMore() {
  if (loadingMore.value || !hasMore.value) return;
  loadingMore.value = true;
  try {
    const next = page.value + 1;
    const res = await getDeletedTransactions({ page: next, size: PAGE_SIZE });
    const seen = new Set(list.value.map((t) => t.id));
    // total 一律以**本次响应的服务端值**为准（本地加减容易和真实值漂开）
    list.value = [...list.value, ...res.list.filter((t) => !seen.has(t.id))];
    total.value = res.total;
    page.value = next;
  } catch (err) {
    console.error('[recycle] 加载更多失败', err);
  } finally {
    loadingMore.value = false;
  }
}

function onRestore(t: TransactionItem) {
  uni.showModal({
    title: '恢复流水',
    content: `确定恢复这笔流水？（${t.category?.name || '未分类'} ${formatMoney(t.amount)}）`,
    confirmText: '确定恢复',
    success: async (res) => {
      if (!res.confirm) return;
      try {
        await restoreTransaction(t.id);
        uni.showToast({ title: '已恢复', icon: 'none' });
        /*
         * ⚠️ 恢复后**整页重拉（回到第 1 页）**，而不是在本地把这一条删掉：
         *    记录离开回收站后，后面所有页的记录都会**整体前移一位** ——
         *    若只做本地删除、还留着"已加载到第 N 页"的游标，下一次「加载更多」
         *    就会跳过恰好被顶上来的那一条（offset 分页的经典丢行）。
         *    重拉还顺带把 total 校准回真实值。回收站低频、条数也少，
         *    这点代价换"绝不丢行"是划算的。
         */
        load();
      } catch (err) {
        console.error('[recycle] 恢复失败', err);
      }
    },
  });
}

function goBack() {
  uni.navigateBack();
}

onMounted(load);
</script>

<style scoped lang="scss">
.page {
  min-height: $page-min-height;
  background: $v11-bg-page;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
}

/* ===== 自绘顶栏 ===== */
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

.state {
  padding: 48px 0;
  text-align: center;
}

.state-text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $v11-text-secondary;
}

/* ===== 列表 ===== */
.list {
  padding: $space-3;
}

.group-head {
  padding: $space-2 $space-1;
}

.group-head-text {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
}

.card {
  background: $v11-bg-card;
  border-radius: $v11-radius-card;
  overflow: hidden;
  margin-bottom: $space-3;
}

.item {
  padding: $space-3 $space-4;
  border-bottom: 1px solid $v11-line;
}

.item:last-child {
  border-bottom: none;
}

.item-top {
  display: flex;
  align-items: baseline;
}

.item-time {
  @include tabular-nums;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
  margin-right: $space-2;
}

.item-action {
  flex: 1;
  min-width: 0;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-secondary;
}

.item-main {
  display: flex;
  align-items: center;
  margin-top: $space-2;
}

.item-icon {
  flex-shrink: 0;
  margin-right: $space-2;
}

.item-name {
  flex: 1;
  min-width: 0;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-primary;
  @include text-safe;
}

.item-amount {
  @include amount;
  min-width: 72px;
  font-size: $font-body;
  line-height: $lh-body;
  font-weight: $weight-medium;
  margin-right: $space-2;
}

.income {
  color: $v11-income-amount;
}

.expense {
  color: $v11-teal-amount;
}

/*
 * 「恢复」按钮：浅金底 + 深金字 + 金色细边。
 * 文字 #A85F12 压 #FDF6EF = 4.55:1 ✅；那 1px 金色边保证胶囊形状在白卡上可见
 * （浅金底本身压白卡只有 1.07 —— v1.1 调色板的已知缺口）。
 */
.restore {
  flex-shrink: 0;
  min-height: 32px;
  padding: 0 $space-3;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-pill;
  background: $v11-gold-soft;
  border: 1px solid $v11-gold-fill;
}

.restore-text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  font-weight: $weight-medium;
  color: $v11-gold;
}

.item-meta {
  display: block;
  margin-top: $space-1;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
  @include text-safe;
}

/*
 * 分页入口（见模板里的长注释）。
 * ⚠️ 只写布局：字号/颜色全部复用上面已有的 `.state-text`（$font-caption + $v11-text-secondary），
 *    **刻意不新增任何 font-size / 色值字面量** —— `scripts/check-contrast.mjs` 对
 *    .vue 的 font-size 总量（270 处）与取值（只允许 $font-* / $icon-*）都有硬断言，
 *    新增一处就会 MISMATCH，得连带改脚本里的计数注释。
 * `min-height: 44px` 是项目一贯的触控目标下限。
 */
.foot {
  padding: $space-2 0 $space-3;
  text-align: center;
}

.more {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
}
</style>
