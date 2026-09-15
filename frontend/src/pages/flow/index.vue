<template>
  <view class="page">
    <!--
      ══════ 渐变头（顶栏 + 结余，融为一体）══════

      结构上 nav 与 hero 合成**同一块渐变容器**，而不是"白色 nav + 下方渐变 hero"两块：
      融合后渐变从**屏幕最顶端（状态栏之上）**开始，视觉上是一个整体。

      代价与对策：nav 里的图标/文字原先压白底用的是深墨色，现在压在深橙渐变上，
      必须全部改白（`$text-inverse`）。实测白字压 `$gradient-banner` 最浅端 4.52:1 ✅。
    -->
    <view class="header" :style="{ paddingTop: navHeight + 'px' }">
      <view class="nav" :class="{ solid: navSolid }" :style="{ paddingTop: statusBarHeight + 'px' }">
        <view class="nav-inner">
          <view class="nav-btn nav-back" @click="goBack">
            <SvgIcon name="icon-chevron-left" :size="20" />
          </view>
          <text class="nav-title">{{ pageRangeText || '全部流水' }}</text>
          <view class="nav-actions">
            <!-- ① 更多：底部弹窗（导出/筛选/排序） -->
            <view class="nav-btn" @click="actionVisible = true">
              <SvgIcon name="icon-more" :size="20" />
            </view>
            <!-- ② 日历 -->
            <view class="nav-btn" @click="goCalendar">
              <SvgIcon name="icon-calendar" :size="20" />
            </view>
            <!-- ③ 搜索：页内展开，不跳页 -->
            <view class="nav-btn" @click="toggleSearch">
              <SvgIcon name="icon-search" :size="20" />
            </view>
            <!-- ④ 记一笔 -->
            <view class="nav-btn" @click="goRecord">
              <SvgIcon name="icon-plus" :size="20" />
            </view>
          </view>
        </view>

      </view>

      <!-- 结余（原 hero 内容，现与 nav 同处一块渐变） -->
      <view class="hero">
        <view class="hero-main">
          <text class="hero-balance">{{ formatMoney(total.balance) }}</text>
          <text class="hero-balance-label">结余</text>
        </view>
        <view class="hero-io">
          <text class="hero-io-item">收入 {{ formatMoney(total.income) }}</text>
          <text class="hero-io-sep">|</text>
          <text class="hero-io-item">支出 {{ formatMoney(total.expense) }}</text>
        </view>
      </view>
    </view>

    <!--
      ── 已筛选提示条 ──
      只要有任意筛选条件（时间范围 / 金额区间 / 关键词，**含顶部搜索**）就出现，
      让用户明确知道"当前看到的不是全部"。「查看全部」→ 底部弹层展示条件摘要 + 两个操作。
    -->
    <view v-if="hasFilter" class="filter-tip">
      <text class="filter-tip-text">已筛选，当前只展示部分流水</text>
      <view class="filter-tip-action" @click="openFilterSummary">
        <text class="filter-tip-action-text">查看全部</text>
        <SvgIcon name="icon-chevron-right" :size="12" />
      </view>
    </view>

    <!-- ── 状态 ── -->
    <view v-if="loading" class="state"><text class="state-text">加载中…</text></view>
    <EmptyState
      v-else-if="error"
      icon="icon-alert"
      text="加载失败，请稍后重试"
      button-text="重试"
      @action="reloadAll"
    />
    <EmptyState v-else-if="!groups.length" icon="icon-inbox" text="该条件下暂无流水" />

    <!-- ── 分组列表 ── -->
    <view v-else class="groups">
      <view v-for="g in groups" :key="g.key" class="group">
        <!-- 组头：点击展开/收起；滚动时吸在顶栏下方（推送式，同 iOS 通讯录） -->
        <view class="group-head" :style="{ top: navHeight + 'px' }" @click="toggleGroup(g)">
          <!--
            组头标题分两种维度：
            · 时间维度 → 「9月」+ 副标题「2026」
            · 分类维度 → 分类名 + 副标题（二级口径下显示所属一级）
          -->
          <view class="group-title-wrap">
            <text class="group-title">{{ groupTitle(g) }}</text>
            <text v-if="groupSub(g)" class="group-sub">{{ groupSub(g) }}</text>
          </view>
          <view class="group-right">
            <view class="group-amounts">
              <view class="group-line">
                <text class="group-key">结余</text>
                <text class="group-val" :class="signClass(g.balance)">{{ formatMoney(g.balance) }}</text>
              </view>
              <view class="group-line">
                <text class="group-key">收入</text>
                <text class="group-val income">{{ formatMoney(g.income) }}</text>
                <text class="group-sep">|</text>
                <text class="group-key">支出</text>
                <text class="group-val expense">{{ formatMoney(g.expense) }}</text>
              </view>
            </view>
            <SvgIcon
              class="group-arrow"
              :name="expanded.has(g.key) ? 'icon-chevron-up' : 'icon-chevron-down'"
              :size="16"
            />
          </view>
        </view>

        <!-- 组内明细：按日分组 -->
        <view v-if="expanded.has(g.key)" class="group-body">
          <view v-if="loadingDetail.has(g.key)" class="detail-loading">
            <text class="state-text">加载中…</text>
          </view>
          <EmptyState v-else-if="!details[g.key]?.length" icon="icon-inbox" text="该时段无流水" />
          <template v-else>
            <view v-for="day in details[g.key]" :key="day.date" class="day">
              <view class="day-head"><text class="day-head-text">{{ dayHeader(day.date) }}</text></view>
              <uni-swipe-action v-for="t in day.items" :key="t.id">
                <uni-swipe-action-item :right-options="SWIPE_OPTIONS" @click="onSwipe($event, t)">
                  <view class="txn" @click="editTransaction(t.id)">
                    <CategoryIcon
                      class="txn-icon"
                      :name="t.category?.icon || 'cat-misc'"
                      :size="28"
                    />
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
            </view>
          </template>
        </view>
      </view>
    </view>

    <!-- ── 底部分组维度栏：时间 / 分类（两者互斥，各点各的弹层）── -->
    <view class="filter-bar">
      <view
        class="filter-item"
        :class="{ active: groupBy === 'time' }"
        @click="openUnitPicker"
      >
        <text class="filter-text">{{ groupBy === 'time' ? unitLabel : '时间' }}</text>
        <SvgIcon class="filter-arrow" name="icon-chevron-down" :size="12" />
      </view>
      <view
        class="filter-item"
        :class="{ active: groupBy === 'category' }"
        @click="openCategoryLevelPicker"
      >
        <text class="filter-text">
          {{ groupBy === 'category' ? (level === 1 ? '一级分类' : '二级分类') : '分类' }}
        </text>
        <SvgIcon class="filter-arrow" name="icon-chevron-down" :size="12" />
      </view>
    </view>

    <!--
      ── 弹层 ①：更多操作（参考图 5）──

      所有弹层现在都**贴屏幕底边升起、不留底栏高度**（底栏被盖住是有意为之：
      弹层是模态的，此时底栏不可操作）。
    -->
    <view v-if="actionVisible" class="mask mask-flush" @click="actionVisible = false">
      <view class="sheet" @click.stop>
        <view class="sheet-head">
          <text class="sheet-title">批量操作</text>
          <text class="sheet-sub">编辑、复制(含跨账本)、分享及删除流水</text>
        </view>
        <view class="sheet-item" @click="doExport"><text class="sheet-item-text">流水导出</text></view>
        <view class="sheet-item" @click="openFilterFromSheet">
          <text class="sheet-item-text">筛选</text>
        </view>
        <view class="sheet-item" @click="openSortPicker"><text class="sheet-item-text">排序</text></view>
        <view class="sheet-item sheet-cancel" @click="actionVisible = false">
          <text class="sheet-item-text">取消</text>
        </view>
      </view>
    </view>

    <!-- ── 弹层 ②：分组粒度（参考图：年/季/月/周/天）── -->
    <view v-if="unitOpen" class="mask" @click="unitOpen = false">
      <view class="sheet" @click.stop>
        <view
          v-for="u in UNIT_OPTIONS"
          :key="u.value"
          class="sheet-item sheet-item-row"
          @click="pickUnit(u.value)"
        >
          <text class="sheet-item-text" :class="{ 'sheet-item-active': unit === u.value }">
            {{ u.label }}
          </text>
          <SvgIcon
            v-if="unit === u.value"
            class="sheet-check"
            name="icon-check"
            :size="18"
          />
        </view>
      </view>
    </view>

    <!--
      ── 弹层 ③：分类层级（一级 / 二级）──

      参考图里它只有两行、没有「确定」按钮 —— 因为它选的是**分组维度**而不是勾选条件：
      点哪一行立即生效并关闭。面板只占底部一小块，不会压住底栏
      （`.sheet` 在 `.filter-bar` 之上，靠 z-index 分层，见样式）。
    -->
    <view v-if="levelOpen" class="mask" @click="levelOpen = false">
      <view class="sheet" @click.stop>
        <view
          v-for="opt in LEVEL_OPTIONS"
          :key="opt.value"
          class="sheet-item sheet-item-row"
          @click="pickLevel(opt.value)"
        >
          <text
            class="sheet-item-text"
            :class="{ 'sheet-item-active': groupBy === 'category' && level === opt.value }"
          >
            {{ opt.label }}
          </text>
          <SvgIcon
            v-if="groupBy === 'category' && level === opt.value"
            class="sheet-check"
            name="icon-check"
            :size="18"
          />
        </view>
      </view>
    </view>

    <!-- ── 弹层 ④：筛选面板 ── -->
    <FlowFilterPanel
      v-model:visible="filterVisible"
      :model="filterModel"
      @apply="onFilterApply"
      @pick-time="timeOpen = true"
      @pick-type="typeOpen = true"
      @pick-category-filter="categoryOpen = true"
    />

    <!-- ── 弹层 ④'：流水类型多选（叠在筛选面板之上，z-index 1100） ── -->
    <FlowTypePicker v-model:visible="typeOpen" :model="filterModel.types" @apply="onTypeApply" />

    <!-- ── 弹层 ④''：分类多选（与类型弹层同级，同样叠在筛选面板之上） ── -->
    <FlowCategoryPicker
      v-model:visible="categoryOpen"
      :model="filterModel.categoryIds"
      @apply="onCategoryFilterApply"
    />

    <!-- ── 弹层 ⑤：时间预设 ── -->
    <view v-if="timeOpen" class="mask" @click="timeOpen = false; timeCustomOpen = false">
      <view class="sheet" @click.stop>
        <view class="sheet-header">
          <view class="sheet-header-btn" @click="timeOpen = false">
            <SvgIcon name="icon-close" :size="20" />
          </view>
          <text class="sheet-header-title">选择时间</text>
          <view class="sheet-header-btn" />
        </view>
        <!--
          中间内容（预设列表 + 自定义滚轮）放在 scroll-view 里：
          否则「自定义」展开后总高超过 .sheet 的 max-height，会把底部「确定」挤出屏幕。
        -->
        <!-- 高度由 JS 算出（见 timeSheetBodyHeight），不依赖 flex 推导 -->
        <scroll-view class="sheet-body" scroll-y :style="{ height: timeSheetBodyHeight + 'px' }">
          <view
            v-for="opt in TIME_PRESETS"
            :key="opt.label"
            class="sheet-item sheet-item-row"
            @click="pickTimePreset(opt)"
          >
            <text class="sheet-item-text" :class="{ 'sheet-item-active': timeLabel === opt.label }">
              {{ opt.label }}
            </text>
            <SvgIcon v-if="timeLabel === opt.label" class="sheet-check" name="icon-check" :size="18" />
          </view>

        <!--
          自定义区间：选「自定义」后就地展开（参考图形态）——
          上方两个可点的"开始/结束"、下方三列滚轮（年/月/日）、底部「确定」。
          ⚠️ 这两处日期与滚轮是**双向绑定**的：点上方切换编辑对象、滚轮改的是同一个值。
        -->
        <view v-if="timeCustomOpen" class="range-panel">
          <view class="range-tabs">
            <view class="range-tab" @click="switchRangeEnd('start')">
              <text class="range-tab-label">开始时间</text>
              <text
                class="range-tab-value"
                :class="{ active: activeEnd === 'start' }"
              >
                {{ formatCn(customStart) }}
              </text>
              <view v-if="activeEnd === 'start'" class="range-tab-line" />
            </view>
            <text class="range-sep">-</text>
            <view class="range-tab" @click="switchRangeEnd('end')">
              <text class="range-tab-label">结束时间</text>
              <text class="range-tab-value" :class="{ active: activeEnd === 'end' }">
                {{ formatCn(customEnd) }}
              </text>
              <view v-if="activeEnd === 'end'" class="range-tab-line" />
            </view>
          </view>

          <picker-view class="range-wheel" :value="wheelValue" @change="onWheelChange">
              <picker-view-column>
                <view v-for="y in RANGE_YEARS" :key="'y' + y" class="wheel-item">{{ y }}年</view>
              </picker-view-column>
              <picker-view-column>
                <view v-for="m in 12" :key="'m' + m" class="wheel-item">{{ m }}月</view>
              </picker-view-column>
              <picker-view-column>
                <view v-for="d in wheelDays" :key="'d' + d" class="wheel-item">{{ d }}日</view>
              </picker-view-column>
            </picker-view>
          </view>
        </scroll-view>

        <view class="sheet-footer">
          <view class="btn btn-confirm" @click="confirmTime">
            <text class="btn-text confirm-text">确定</text>
          </view>
        </view>
      </view>
    </view>

    <!--
      ── 弹层 ⑦：筛选条件摘要（参考图）──
      展示当前生效的条件，并给两个出口：
        · 查看全部流水 —— 清掉所有筛选条件
        · 修改筛选条件 —— 打开筛选面板
    -->
    <view v-if="summaryOpen" class="mask" @click="summaryOpen = false">
      <view class="sheet" @click.stop>
        <view class="sheet-header">
          <view class="sheet-header-btn" />
          <text class="sheet-header-title">筛选条件</text>
          <view class="sheet-header-btn" @click="summaryOpen = false">
            <SvgIcon name="icon-close" :size="20" />
          </view>
        </view>

        <view class="summary-list">
          <view v-if="filterSummary.time" class="summary-row">
            <SvgIcon class="summary-icon" name="icon-clock" :size="18" />
            <text class="summary-label">时间</text>
            <text class="summary-value">{{ filterSummary.time }}</text>
          </view>
          <view v-if="filterSummary.category" class="summary-row">
            <SvgIcon class="summary-icon" name="icon-tag" :size="18" />
            <text class="summary-label">分类</text>
            <text class="summary-value">{{ filterSummary.category }}</text>
          </view>
          <view v-if="filterSummary.type" class="summary-row">
            <SvgIcon class="summary-icon" name="icon-filter" :size="18" />
            <text class="summary-label">流水类型</text>
            <text class="summary-value">{{ filterSummary.type }}</text>
          </view>
          <view v-if="filterSummary.amount" class="summary-row">
            <SvgIcon class="summary-icon" name="icon-card" :size="18" />
            <text class="summary-label">金额区间</text>
            <text class="summary-value">{{ filterSummary.amount }}</text>
          </view>
          <view v-if="filterSummary.keyword" class="summary-row">
            <SvgIcon class="summary-icon" name="icon-tag" :size="18" />
            <text class="summary-label">关键词</text>
            <text class="summary-value">{{ filterSummary.keyword }}</text>
          </view>
        </view>

        <view class="summary-footer">
          <view class="summary-btn summary-btn-ghost" @click="viewAll">
            <text class="summary-btn-text ghost-text">查看全部流水</text>
          </view>
          <view class="summary-btn summary-btn-solid" @click="editFilter">
            <text class="summary-btn-text solid-text">修改筛选条件</text>
          </view>
        </view>
      </view>
    </view>

    <!--
      ══════ 全屏搜索页（点顶栏放大镜进入）══════
      参考图形态：顶部是搜索框 + 「取消」，下方直接是**平铺的结果列表**
      （不分组 —— 搜索要的是"找到那一笔"，分组反而增加干扰）。
      结果里同时给出该次搜索的收支合计，让用户对结果规模有数。
    -->
    <view v-if="searchVisible" class="search-page">
      <view class="search-head" :style="{ paddingTop: statusBarHeight + 'px' }">
        <view class="search-box">
          <SvgIcon class="search-box-icon" name="icon-search" :size="16" />
          <input
            class="search-box-input"
            :value="searchKeyword"
            placeholder="搜索备注、分类名或金额"
            focus
            confirm-type="search"
            @input="onSearchInput"
            @confirm="doSearch"
          />
          <view v-if="searchKeyword" class="search-box-clear" @click="clearSearch">
            <SvgIcon name="icon-close" :size="16" />
          </view>
        </view>
        <view class="search-cancel" @click="closeSearch">
          <text class="search-cancel-text">取消</text>
        </view>
      </view>

      <!-- 结果概览：该次搜索的笔数与收支合计 -->
      <view v-if="searchKeyword" class="search-summary">
        <text class="search-summary-title">流水</text>
        <view class="search-summary-right">
          <view class="search-summary-line">
            <text class="search-summary-key">结余</text>
            <text class="search-summary-val" :class="signClass(searchTotal.balance)">
              {{ formatMoney(searchTotal.balance) }}
            </text>
          </view>
          <view class="search-summary-line">
            <text class="search-summary-key">收入</text>
            <text class="search-summary-val income">{{ formatMoney(searchTotal.income) }}</text>
            <text class="search-summary-sep">|</text>
            <text class="search-summary-key">支出</text>
            <text class="search-summary-val expense">{{ formatMoney(searchTotal.expense) }}</text>
          </view>
        </view>
      </view>

      <!-- 结果列表（平铺） -->
      <view class="search-results">
        <view v-if="searchLoading" class="state"><text class="state-text">搜索中…</text></view>
        <EmptyState
          v-else-if="searchKeyword && !searchResults.length"
          icon="icon-inbox"
          text="没有找到相关流水"
        />
        <template v-else>
          <uni-swipe-action v-for="t in searchResults" :key="t.id">
            <uni-swipe-action-item :right-options="SWIPE_OPTIONS" @click="onSwipe($event, t)">
              <view class="txn search-txn" @click="editTransaction(t.id)">
                <CategoryIcon class="txn-icon" :name="t.category?.icon || 'cat-misc'" :size="28" />
                <view class="txn-main">
                  <text class="txn-name">{{ t.category?.name || '未分类' }}</text>
                  <text class="txn-meta">{{ searchMeta(t) }}</text>
                </view>
                <text class="txn-amount" :class="t.type === 'income' ? 'income' : 'expense'">
                  {{ t.type === 'income' ? '+' : '-' }}{{ formatMoney(t.amount) }}
                </text>
              </view>
            </uni-swipe-action-item>
          </uni-swipe-action>
        </template>
      </view>
    </view>

    <!-- ── 弹层 ⑥：排序 ── -->
    <view v-if="sortOpen" class="mask" @click="sortOpen = false">
      <view class="sheet" @click.stop>
        <view
          v-for="s in SORT_OPTIONS"
          :key="s.value"
          class="sheet-item sheet-item-row"
          @click="pickSort(s.value)"
        >
          <text class="sheet-item-text" :class="{ 'sheet-item-active': order === s.value }">
            {{ s.label }}
          </text>
          <SvgIcon v-if="order === s.value" class="sheet-check" name="icon-check" :size="18" />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 流水页（底栏「流水」跳转进入，独立页、不带主导航底栏）。
 *
 * 结构对齐参考图：
 *   · 自绘顶栏：返回 + 标题 + 四个动作（更多 / 日历 / 搜索 / 记一笔）
 *   · 渐变头图：结余（大号白字）+ 收入/支出（小字）
 *   · 分组列表：按底部筛选栏选的粒度分组，点组头展开该组明细（明细内再按日分组）
 *   · 底部筛选栏：月（粒度）/ 分类（多选）
 *
 * 数据来源：
 *   · 分组列表 → `GET /transactions/summary?unit=...`（一次拿全组）
 *   · 展开明细 → `GET /transactions?start=&end=`（只拉该组区间）
 * 两者共用同一套筛选参数，见 service 层的 applyFilters 注释。
 */
import { ref, reactive, computed, onMounted, nextTick } from 'vue';
import { onPageScroll, onLoad } from '@dcloudio/uni-app';
import SvgIcon from '@/components/SvgIcon.vue';
import CategoryIcon from '@/components/CategoryIcon.vue';
import EmptyState from '@/components/EmptyState.vue';
import FlowFilterPanel, { type FlowFilter } from '@/components/FlowFilterPanel.vue';
import FlowTypePicker from '@/components/FlowTypePicker.vue';
import FlowCategoryPicker from '@/components/FlowCategoryPicker.vue';
import { useAccountStore } from '@/store/account';
import { useCategoryStore } from '@/store/category';
import {
  getTransactionSummary,
  getTransactions,
  type SummaryItem,
  type SummaryUnit,
  type TransactionItem,
} from '@/api/transaction';
import { formatMoney } from '@/utils/format';
import { periodRange, periodLabel, dayHeader } from '@/utils/period';
import { useTxnSwipe } from '@/utils/txnSwipe';

const accountStore = useAccountStore();
const categoryStore = useCategoryStore();

/**
 * 顶栏吸顶与变色。
 *
 * 结构：`.nav` 改为 `position: fixed`（始终贴顶），`.header` 用 `padding-top: navHeight`
 * 把自己内容推到顶栏下方 —— 这样渐变色块与顶栏仍然是一整块，而顶栏又能独立吸顶。
 *
 * 变色判据：**渐变头刚好滚完**（scrollTop ≥ 渐变头高 − 顶栏高）时切换为白底深字。
 * 选这个点是因为它没有模糊的中间态 —— 用户感觉是"渐变头交给了白顶栏"。
 * 用 scrollTop 直接控制，不做插值渐隐：两头都是确定的状态。
 */
const NAV_BASE_H = 44;
const navHeight = computed(() => statusBarHeight.value + NAV_BASE_H);

/**
 * 渐变头（含 nav 与 hero）的**真实高度**，必须实测。
 *
 * ⚠️ 踩过：这里原本硬编码 180，而实测是 146 —— 阈值因此算成 136（应为 102）。
 *    在 102~136px 这段区间里，渐变已经滚走、顶栏却仍是透明态 →
 *    **白图标压在白页面上，等于消失**。
 *    这类"用估计值代替测量"的错误不会报错，只在特定滚动位置可见。
 */
const headerHeight = ref(0);

/** 阈值 = 渐变头高 − 顶栏高：此刻渐变头刚好完全让位给白顶栏 */
const solidThreshold = computed(() => {
  const h = headerHeight.value || 200; // 未测到时用保守值，宁可晚一点变白
  return Math.max(0, h - navHeight.value);
});

const navSolid = ref(false);

/** 测量渐变头高度（挂载后、搜索框展开/收起后都要重测） */
function measureHeader() {
  nextTick(() => {
    uni
      .createSelectorQuery()
      .select('.header')
      .boundingClientRect((rect: any) => {
        if (rect && rect.height) headerHeight.value = rect.height;
      })
      .exec();
  });
}

onPageScroll((e) => {
  const next = (e.scrollTop ?? 0) >= solidThreshold.value;
  if (next !== navSolid.value) navSolid.value = next;
});

const statusBarHeight = ref(0);
/** 视口高度（算弹层中间区高度用；uni-app 下 scroll-view 需要确定高度） */
const windowHeight = ref(812);
try {
  const info = uni.getSystemInfoSync();
  statusBarHeight.value = info.statusBarHeight || 0;
  windowHeight.value = info.windowHeight || 812;
} catch {
  statusBarHeight.value = 0;
}

/* ── 筛选状态 ── */
const unit = ref<SummaryUnit>('month');
const unitLabel = computed(() => UNIT_OPTIONS.find((u) => u.value === unit.value)?.label || '月');

/**
 * 分组维度：time（按时间，用 unit 指定粒度）/ category（按分类，用 level 指定层级）。
 *
 * ⚠️ **两者互斥**：选「分类」时看的是**整个账本**（不带时间限制）——
 *    否则"看全账本结构"这件事就不成立了。这也是它和原来的"多选筛选"的本质区别：
 *    那是在已有时间范围内再过滤，这是换一种分组方式。
 */
const groupBy = ref<'time' | 'category'>('time');
const level = ref<1 | 2>(1);
const LEVEL_OPTIONS = [
  { value: 1 as const, label: '一级分类' },
  { value: 2 as const, label: '二级分类' },
];
const order = ref<'time' | 'amountDesc' | 'amountAsc'>('time');

/**
 * 全屏搜索页。
 *
 * ⚠️ 与"筛选面板的备注"共用同一个后端参数（`keyword`），但**是两个独立状态** ——
 *    搜索页关闭后不残留关键词；只有用户真的把结果"应用"到列表才算筛选。
 *    这也是为什么 `hasFilter` 里要把 searchKeyword 也算进去：
 *    对用户来说"搜了"和"筛了"都是缩小结果集，都该看到提示条。
 */
const searchVisible = ref(false);
/** 输入框里的值（实时） */
const searchKeyword = ref('');
/** 已提交的关键词（点回车后）—— 避免每敲一个字就发一次请求 */
const searchCommitted = ref('');
const searchResults = ref<TransactionItem[]>([]);
const searchLoading = ref(false);

/** 搜索结果的收支合计（与结果规模一起给用户参考） */
const searchTotal = computed(() => {
  let income = 0;
  let expense = 0;
  for (const t of searchResults.value) {
    if (t.type === 'income') income += Number(t.amount);
    else expense += Number(t.amount);
  }
  return {
    income: income.toFixed(2),
    expense: expense.toFixed(2),
    balance: (income - expense).toFixed(2),
  };
});

/**
 * 流水类型选项。当前后端 ENUM 只有两种，选项写在这里（与 FlowFilterPanel / FlowTypePicker 的
 * 选项集合保持一致）；将来后端扩展类型时三处一起改。
 */
const TYPE_VALUES = ['expense', 'income'];
const TYPE_LABELS: Record<string, string> = { expense: '支出', income: '收入' };

const filterModel = reactive<FlowFilter>({
  start: '',
  end: '',
  timeLabel: '全部时间',
  // 默认全选 = 不过滤
  types: [...TYPE_VALUES],
  // 空数组 = 不过滤（与 types 同口径）
  categoryIds: [],
  minAmount: '',
  maxAmount: '',
  keyword: '',
});

/**
 * 从记账页跳进来时，导航栏标题要显示**区间**而不是「全部流水」。
 *
 * 参考图里标题就是 `2026.9.14-9.14` / `2026.9.1-9.30` / `2026年` 这类区间文案 ——
 * 用户从首页某个区间点进来，最该看到的就是"我现在看的是哪一段"。
 * 为空时标题回落到「全部流水」。
 */
const pageRangeText = ref('');

/* ── 弹层开关 ── */
const actionVisible = ref(false);
const summaryOpen = ref(false);
const unitOpen = ref(false);
const levelOpen = ref(false);
const filterVisible = ref(false);
const typeOpen = ref(false);
const categoryOpen = ref(false);
const timeOpen = ref(false);
const sortOpen = ref(false);
const timeLabel = computed(() => filterModel.timeLabel);

/* ── 数据 ── */
const loading = ref(false);
const error = ref(false);
const groups = ref<SummaryItem[]>([]);
const expanded = ref<Set<string>>(new Set());
const details = ref<Record<string, { date: string; items: TransactionItem[] }[]>>({});
const loadingDetail = ref<Set<string>>(new Set());

const UNIT_OPTIONS: { value: SummaryUnit; label: string }[] = [
  { value: 'year', label: '年' },
  { value: 'quarter', label: '季' },
  { value: 'month', label: '月' },
  { value: 'week', label: '周' },
  { value: 'day', label: '天' },
];

const SORT_OPTIONS = [
  { value: 'time', label: '按时间（默认）' },
  { value: 'amountDesc', label: '按金额从高到低' },
  { value: 'amountAsc', label: '按金额从低到高' },
] as const;

/** 时间预设。「自定义」的 start/end 为空，选它时展开滚轮让用户自己选 */
const TIME_PRESETS = [
  { label: '全部时间', start: '', end: '' },
  { label: '本月', ...monthRange(0) },
  { label: '上月', ...monthRange(-1) },
  { label: '本年', start: `${new Date().getFullYear()}-01-01`, end: `${new Date().getFullYear()}-12-31` },
  {
    label: '去年',
    start: `${new Date().getFullYear() - 1}-01-01`,
    end: `${new Date().getFullYear() - 1}-12-31`,
  },
  { label: '自定义', start: '', end: '' },
];

/**
 * 时间弹层中间区的高度（px）。
 *
 * ⚠️ 必须由 JS 算：uni-app 的 `scroll-view` 不吃 flex 推导（见样式里的注释）。
 *    取值 = 视口高 × 72%（与 .sheet 的 max-height 一致） − header − footer。
 *    下限 160 保证极端窄屏下滚轮仍可见。
 */
const timeSheetBodyHeight = computed(() => {
  const vh = windowHeight.value || 812;
  return Math.max(160, Math.round(vh * 0.72) - 144);
});

/* ── 自定义区间 ── */
/** 可选年份范围（与日历页一致，2000~2049） */
const RANGE_YEARS = Array.from({ length: 50 }, (_, i) => 2000 + i);

const pad2 = (n: number) => String(n).padStart(2, '0');
const todayStr = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
})();

/** 当前正在编辑哪一端 */
/**
 * 「自定义」滚轮是否展开。
 *
 * ⚠️ 单独用状态，不要拿 `timeLabel === '自定义'` 当判据 ——
 *    那样必须在点「自定义」的瞬间就把 timeLabel 改掉，于是
 *    **用户还没选日期，筛选面板就已经显示「自定义」+ 空区间**了。
 *    正确做法：点「自定义」只展开滚轮，点「确定」才写值。
 */
const timeCustomOpen = ref(false);

const activeEnd = ref<'start' | 'end'>('start');
const customStart = ref(todayStr);
const customEnd = ref(todayStr);

/** 滚轮当前年/月/日的下标 */
const wheelYear = ref(RANGE_YEARS.indexOf(new Date().getFullYear()));
const wheelMonth = ref(new Date().getMonth());
const wheelDay = ref(new Date().getDate() - 1);

/** 滚轮当前月份的天数（闰年/大小月都要算对，否则 2 月 31 日会出现） */
const wheelDays = computed(() => {
  const y = RANGE_YEARS[wheelYear.value] ?? 2000;
  const m = wheelMonth.value;
  return new Date(y, m + 1, 0).getDate();
});

/** 选中的那一端 → 滚轮应显示的值 */
const wheelValue = computed(() => [wheelYear.value, wheelMonth.value, wheelDay.value]);

function formatCn(d: string): string {
  const [y, m, day] = d.split('-');
  return `${y}年${m}月${day}日`;
}

/** 切换编辑对象：把滚轮同步到那一端当前的值 */
function switchRangeEnd(which: 'start' | 'end') {
  activeEnd.value = which;
  const cur = which === 'start' ? customStart.value : customEnd.value;
  const [y, m, d] = cur.split('-').map(Number);
  wheelYear.value = Math.max(0, RANGE_YEARS.indexOf(y));
  wheelMonth.value = m - 1;
  wheelDay.value = d - 1;
}

function onWheelChange(e: any) {
  const [yi, mi, di] = e.detail.value;
  wheelYear.value = yi;
  wheelMonth.value = mi;
  // 换月后当月天数可能变少（如 1/31 → 2 月），把日下标收敛到合法范围
  const maxDay = new Date(RANGE_YEARS[yi], mi + 1, 0).getDate();
  wheelDay.value = Math.min(di, maxDay - 1);

  const y = RANGE_YEARS[wheelYear.value];
  const value = `${y}-${pad2(mi + 1)}-${pad2(wheelDay.value + 1)}`;
  if (activeEnd.value === 'start') customStart.value = value;
  else customEnd.value = value;
}

/** 确定：把自定义区间写进筛选条件 */
function confirmTime() {
  if (timeCustomOpen.value) {
    // 起止颠倒时自动交换 —— 与其报错不如顺手修正（用户意图明确）
    const [s, e] = [customStart.value, customEnd.value].sort();
    filterModel.timeLabel = '自定义';
    filterModel.start = s;
    filterModel.end = e;
  }
  timeCustomOpen.value = false;
  timeOpen.value = false;
  // 同上：不在这里 reload，等筛选面板的「确定」
}

function monthRange(offset: number) {
  const d = new Date();
  const y = d.getFullYear();
  const m0 = d.getMonth() + offset;
  const start = new Date(y, m0, 1);
  const end = new Date(y, m0 + 1, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    start: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-01`,
    end: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
  };
}

/** 头部总额 = 各分组之和（与筛选条件联动，口径自洽） */
const total = computed(() => {
  let income = 0;
  let expense = 0;
  for (const g of groups.value) {
    income += Number(g.income);
    expense += Number(g.expense);
  }
  return {
    income: income.toFixed(2),
    expense: expense.toFixed(2),
    balance: (income - expense).toFixed(2),
  };
});

/**
 * 组装查询参数。
 *
 * ⚠️ **按分类分组时不带时间限制**（用户确认）：看的是整个账本结构，
 *    带上时间范围就没法看全。时间维度则相反，必须有 start/end 才会按粒度分组。
 *    分类筛选（categoryIds）已经去掉 —— 底栏的「分类」现在是**分组维度**而不是筛选条件。
 */
/**
 * 筛选条件里与"分组"无关的部分（类型 / 分类 / 账本 / 关键词 / 金额）。
 *
 * ⚠️ 这里**不含 start/end** —— 时间范围只对"时间维度"有意义。
 *    把它单独拆出来，是为了让"展开明细"复用同一份条件而不会误带分组参数。
 *
 * ⚠️ **2026-09-15 约定反转**：原先"分类维度看整个账本、不带时间"（用户当时确认）。
 *    现在改为「底栏『分类』只是换个展示形态，筛选条件照常生效」，所以
 *    `baseParams()` 里的分类分支**也带上了 start/end**（见该函数）。
 */
function filterOnlyParams() {
  const kw = filterModel.keyword || searchKeyword.value || '';
  /*
   * 流水类型：**只在恰好选中 1 种时**才传 `type`。
   * 全选（= 不筛）与全不选（= 用户清空了，同样按"不筛"处理）都传 undefined ——
   * 后者若真返回空集会让人误以为"账本没有数据"，与"取消筛选"的直觉不符（用户确认）。
   */
  const sel = filterModel.types || [];
  const onlyType = sel.length === 1 ? (sel[0] as 'income' | 'expense') : undefined;
  /*
   * 分类：**空数组 = 不过滤**（与类型同口径）。
   * 传一级分类时后端会连带其下全部二级，与统计口径一致。
   */
  const cats = filterModel.categoryIds || [];
  return {
    accountId: accountStore.currentId || undefined,
    type: onlyType,
    categoryIds: cats.length ? cats.join(',') : undefined,
    keyword: kw || undefined,
    minAmount: filterModel.minAmount || undefined,
    maxAmount: filterModel.maxAmount || undefined,
  };
}

/**
 * 分组汇总的查询参数。
 *
 * ⚠️ 返回的是**统一结构**（不是"分类版 | 时间版"的联合类型）：
 *    联合类型在调用方解构时会报 TS2339（属性不共存），
 *    统一结构虽然多带几个 undefined 字段，但调用方不需要做类型收窄。
 */
function baseParams() {
  const common = filterOnlyParams();
  if (groupBy.value === 'category') {
    /*
     * ⚠️ **2026-09-15 约定反转**：原先这里是「不带时间限制」（用户当时确认，
     *    理由是"分类维度看的是整个账本结构"）。现已改为：
     *    **底栏「分类」只是换个展示形态，筛选面板的条件（含时间）都照常生效。**
     *    后端 summaryByCategory() 同步补上了 start/end/categoryIds。
     */
    return {
      groupBy: 'category' as const,
      level: level.value,
      unit: undefined,
      start: filterModel.start || undefined,
      end: filterModel.end || undefined,
      ...common,
    };
  }
  return {
    groupBy: 'time' as const,
    level: undefined,
    unit: unit.value,
    start: filterModel.start || undefined,
    end: filterModel.end || undefined,
    ...common,
  };
}

async function loadGroups() {
  loading.value = true;
  error.value = false;
  try {
    await accountStore.load();
    groups.value = await getTransactionSummary(baseParams());
    /*
     * 默认展开第一个分组（用户要求）—— 进页面就能直接看到最近的明细，
     * 不必再点一次。用 `toggleGroup` 而不是直接塞进 expanded：
     * 它会顺带把该组的明细拉回来，避免"展开了但内容是空的"。
     */
    if (groups.value.length) {
      await toggleGroup(groups.value[0]);
    }
  } catch (err) {
    console.error('[flow] 分组加载失败', err);
    error.value = true;
  } finally {
    loading.value = false;
  }
}

/** 只重拉列表（搜索/筛选变化） */
function reloadAll() {
  expanded.value = new Set();
  details.value = {};
  loadGroups();
}

async function toggleGroup(g: SummaryItem) {
  const key = g.key;
  if (expanded.value.has(key)) {
    expanded.value.delete(key);
    expanded.value = new Set(expanded.value);
    return;
  }
  expanded.value.add(key);
  expanded.value = new Set(expanded.value);

  if (details.value[key]) return; // 已加载过，直接用缓存

  loadingDetail.value.add(key);
  loadingDetail.value = new Set(loadingDetail.value);
  try {
    /*
     * 展开明细要按**该组自己的口径**去查：
     *   · 时间维度 → 用该组的日期区间（不是全局筛选的 start/end，两者语义不同）
     *   · 分类维度 → 用该分类 id（一级要连带其下二级，后端 categoryIds 已支持）
     * 所以先把 baseParams 里与"分组"有关的字段剔掉，再补上本组的条件。
     */
    const rest = filterOnlyParams();

    const page =
      g.unit === 'category'
        ? await getTransactions({
            ...rest,
            categoryIds: key === '__none__' ? undefined : key,
            size: 100,
            order: order.value,
          })
        : await getTransactions({
            ...rest,
            ...periodRange(key, g.unit as SummaryUnit),
            size: 100,
            order: order.value,
          });
    details.value[key] = groupByDay(page.list);
  } catch (err) {
    console.error('[flow] 明细加载失败', err);
    details.value[key] = [];
  } finally {
    loadingDetail.value.delete(key);
    loadingDetail.value = new Set(loadingDetail.value);
  }
}

/** 明细按日分组（后端已按时间倒序，这里只做归组，保持顺序） */
function groupByDay(list: TransactionItem[]) {
  const map = new Map<string, TransactionItem[]>();
  for (const t of list) {
    const arr = map.get(t.recordDate) || [];
    arr.push(t);
    map.set(t.recordDate, arr);
  }
  return [...map.entries()].map(([date, items]) => ({ date, items }));
}

/** 明细行副标题：账本名 · 备注 · 时刻（参考图的位置） */
function txnMeta(t: TransactionItem): string {
  const parts: string[] = [];
  if (t.account?.name) parts.push(t.account.name);
  if (t.note) parts.push(t.note);
  if (t.recordTime) parts.push(t.recordTime.slice(0, 5));
  return parts.join(' · ');
}

function signClass(v: string): string {
  return Number(v) < 0 ? 'expense' : 'income';
}

/** 组头主标题：时间维度取格式化后的时间段，分类维度取分类名 */
function groupTitle(g: SummaryItem): string {
  if (g.unit === 'category') return g.name || '未分类';
  return periodLabel(g.key, g.unit).title;
}

/** 组头副标题：时间维度是年份等，分类维度（二级口径）是所属一级分类 */
function groupSub(g: SummaryItem): string {
  if (g.unit === 'category') return g.parentName || '';
  return periodLabel(g.key, g.unit).sub;
}

/* ── 交互 ── */
/** 打开全屏搜索页 */
function toggleSearch() {
  searchVisible.value = true;
  searchKeyword.value = '';
  searchCommitted.value = '';
  searchResults.value = [];
}

/** 关闭搜索页并清空（不把关键词带回列表 —— 那是筛选面板的职责） */
function closeSearch() {
  searchVisible.value = false;
  searchKeyword.value = '';
  searchCommitted.value = '';
  searchResults.value = [];
}

function onSearchInput(e: any) {
  searchKeyword.value = e.detail.value;
  // 清空输入时同时清掉结果，避免"框里没字下面还有一堆"
  if (!searchKeyword.value) {
    searchCommitted.value = '';
    searchResults.value = [];
  }
}

/** 提交搜索（点键盘"搜索"键触发） */
function doSearch() {
  const kw = searchKeyword.value.trim();
  if (!kw) return;
  searchCommitted.value = kw;
  loadSearchResults();
}

async function loadSearchResults() {
  searchLoading.value = true;
  try {
    await accountStore.load();
    /*
     * ⚠️ 搜索**不带任何其他筛选条件**（除了账本）：它是"在全部流水里找"，
     *    带上时间范围/金额区间会让用户困惑"为什么我明明有这笔却搜不到"。
     *    账本仍然要带 —— 数据隔离的边界，不该跨账本搜。
     */
    const page = await getTransactions({
      keyword: searchCommitted.value,
      size: 100,
      accountId: accountStore.currentId || undefined,
    });
    searchResults.value = page.list;
  } catch (err) {
    console.error('[flow] 搜索失败', err);
    searchResults.value = [];
  } finally {
    searchLoading.value = false;
  }
}

function clearSearch() {
  searchKeyword.value = '';
  searchCommitted.value = '';
  searchResults.value = [];
}

/** 搜索结果行的副标题：账本名 · 备注 · 日期 时刻（结果跨多天，日期必须带上） */
function searchMeta(t: TransactionItem): string {
  const parts: string[] = [];
  if (t.account?.name) parts.push(t.account.name);
  if (t.note) parts.push(t.note);
  const d = t.recordDate ? t.recordDate.replace(/-/g, '.') : '';
  const time = t.recordTime ? t.recordTime.slice(0, 5) : '';
  const stamp = [d, time].filter(Boolean).join(' ');
  if (stamp) parts.push(stamp);
  return parts.join(' · ');
}

function openUnitPicker() {
  unitOpen.value = true;
}
function pickUnit(u: SummaryUnit) {
  unit.value = u;
  /*
   * ⚠️ 必须把维度切回 `time`。
   *    踩过：只设 unit 不切 groupBy，从「二级分类」点「月」时会**仍在按分类分组**
   *    （底栏显示"时间"，列表却还是分类分组）—— 两个入口各改一半，状态就对不上了。
   */
  groupBy.value = 'time';
  unitOpen.value = false;
  reloadAll();
}

function openCategoryLevelPicker() {
  levelOpen.value = true;
}
/** 选层级：立即生效并关闭（无「确定」按钮 —— 参考图就是这种"点即选"的形态） */
function pickLevel(v: 1 | 2) {
  groupBy.value = 'category';
  level.value = v;
  levelOpen.value = false;
  reloadAll();
}

/**
 * 是否存在生效中的筛选条件。
 *
 * 含**顶部搜索关键词** —— 它与筛选面板的「备注」效果相同（都缩小了结果集），
 * 对用户来说该看到同一个提示；分成两套判断反而让人困惑"为什么搜了却没提示"。
 */
const hasFilter = computed(
  () =>
    !!(
      filterModel.start ||
      filterModel.end ||
      filterModel.minAmount ||
      filterModel.maxAmount ||
      filterModel.keyword ||
      searchKeyword.value ||
      // 类型：全选 / 全不选都视为"没筛"，只有恰好选中 1 种才算缩小了结果集
      (filterModel.types || []).length === 1 ||
      // 分类：空数组 = 不过滤
      (filterModel.categoryIds || []).length > 0
    )
);

/** 条件摘要（供弹层展示）：空串表示该项未设 */
const filterSummary = computed(() => {
  const parts: string[] = [];
  if (filterModel.start && filterModel.end) {
    parts.push(`${formatCnDate(filterModel.start)}-${formatCnDate(filterModel.end)}`);
  }
  const min = filterModel.minAmount;
  const max = filterModel.maxAmount;
  let amount = '';
  if (min && max) amount = `${min} - ${max}`;
  else if (min) amount = `${min}以上`;
  else if (max) amount = `${max}以下`;

  /*
   * 类型：**只有恰好选中 1 种时才出现在摘要里**。
   * 全选（= 支出、收入都在）不算筛选，写进去会让人以为筛过了（用户确认）。
   */
  const types = filterModel.types || [];
  const typeText = types.length === 1 ? TYPE_LABELS[types[0]] || types[0] : '';

  /*
   * 分类：**空数组不算筛选**，所以不进摘要。
   * 非空时用与筛选面板一致的文案规则（恰好 1 个 → 显示名字，否则「已选 N 项」）。
   */
  const cats = filterModel.categoryIds || [];
  let categoryText = '';
  if (cats.length === 1) {
    categoryText = categoryStore.fullNameOf(cats[0]);
  } else if (cats.length > 1) {
    const roots = new Set<string>();
    for (const id of cats) {
      const item = categoryStore.byId(id);
      if (item) roots.add(item.parentId || item.id);
    }
    categoryText = `已选 ${roots.size} 项`;
  }

  return {
    time: parts[0] || '',
    amount,
    type: typeText,
    category: categoryText,
    keyword: filterModel.keyword || searchKeyword.value || '',
  };
});

/** YYYY-MM-DD → YYYY年MM月DD日（与 FlowFilterPanel 里的展示保持一致） */
function formatCnDate(d: string): string {
  const [y, m, day] = d.split('-');
  return `${y}年${m}月${day}日`;
}

function openFilterSummary() {
  summaryOpen.value = true;
}

/** 查看全部：清掉所有筛选条件（含顶部搜索） */
function viewAll() {
  filterModel.start = '';
  filterModel.end = '';
  filterModel.timeLabel = '全部时间';
  filterModel.minAmount = '';
  filterModel.maxAmount = '';
  filterModel.keyword = '';
  // 「查看全部」= 清掉所有筛选条件：类型复位为全选、分类复位为"不过滤"
  filterModel.types = [...TYPE_VALUES];
  filterModel.categoryIds = [];
  searchKeyword.value = '';
  searchVisible.value = false;
  summaryOpen.value = false;
  reloadAll();
}

/** 修改筛选条件：关闭摘要、打开筛选面板 */
function editFilter() {
  summaryOpen.value = false;
  filterVisible.value = true;
}

function openFilterFromSheet() {
  actionVisible.value = false;
  filterVisible.value = true;
}
function onFilterApply(v: FlowFilter) {
  Object.assign(filterModel, v);
  reloadAll();
}

/**
 * 类型弹层的「确定」：直接落到 filterModel 并重新加载。
 *
 * ⚠️ **不经过筛选面板的草稿**：类型弹层是叠在筛选面板之上的独立弹层，
 *    用户在这一层点「确定」的预期就是"立即生效"（参考图也是这个交互）。
 *    若还要回到筛选面板再点一次「确定」才生效，用户会以为点了没用。
 *    筛选面板关闭时不会回滚 draft 里的类型（draft 只在面板可见时同步），
 *    但它下次打开会从 props.model 重新同步（watch visible），所以不会残留。
 */
function onTypeApply(types: string[]) {
  filterModel.types = types;
  reloadAll();
}

/**
 * 分类弹层的「确定」：与类型弹层同一套做法 —— 直接落到 filterModel 并重新加载，
 * **不经过筛选面板的 draft**（用户在这层点「确定」的预期就是立即生效）。
 * 筛选面板下次打开会从 `props.model` 重新同步（见其 watch），不会残留旧值。
 */
function onCategoryFilterApply(ids: string[]) {
  filterModel.categoryIds = ids;
  reloadAll();
}

function pickTimePreset(opt: { label: string; start: string; end: string }) {
  /*
   * 「自定义」**不立即应用**，而是就地展开滚轮让用户选 ——
   * 其余预设是确定区间，点了直接生效并关闭。
   */
  if (opt.label === '自定义') {
    // 只展开滚轮，**不改** filterModel（见 timeCustomOpen 的注释）
    timeCustomOpen.value = true;
    // 展开时把滚轮定位到当前已选区间的起始端；没选过就用今天
    if (filterModel.start) customStart.value = filterModel.start;
    if (filterModel.end) customEnd.value = filterModel.end;
    switchRangeEnd('start');
    return;
  }
  timeCustomOpen.value = false;
  filterModel.timeLabel = opt.label;
  filterModel.start = opt.start;
  filterModel.end = opt.end;
  /*
   * ⚠️ 这里**不**调 reloadAll()：用户只是选完了"时间"这一项，
   *    还没点筛选面板的「确定」。提前刷新会让列表在用户还在编辑其他条件时就变，
   *    而且若用户随后点「取消」/关闭面板，这次刷新就白做了。
   *    真正的应用发生在筛选面板的「确定」（onFilterApply）。
   */
  timeOpen.value = false;
}

function openSortPicker() {
  actionVisible.value = false;
  sortOpen.value = true;
}
function pickSort(v: 'time' | 'amountDesc' | 'amountAsc') {
  order.value = v;
  sortOpen.value = false;
  reloadAll();
}

/** 导出当前分组为 CSV */
function doExport() {
  actionVisible.value = false;
  const rows: string[][] = [['分组', '收入', '支出', '结余', '笔数']];
  for (const g of groups.value) {
    /*
     * ⚠️ 不能无条件调 periodLabel —— 分类维度下 g.key 是**分类 id**（如 "287"），
     *    传进去会被当成日期解析出垃圾。用统一的 groupTitle/groupSub。
     */
    const title = groupTitle(g);
    const sub = groupSub(g);
    rows.push([`${sub}${title}`, g.income, g.expense, g.balance, String(g.count)]);
  }
  const csv = '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\n');
  // #ifdef H5
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `流水_${unitLabel.value}_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  uni.showToast({ title: '已导出', icon: 'none' });
  // #endif
  // #ifndef H5
  uni.showToast({ title: '当前端暂不支持导出', icon: 'none' });
  // #endif
}
function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/* ── 导航 ── */
function goBack() {
  const pages = getCurrentPages();
  if (pages.length > 1) uni.navigateBack();
  else uni.reLaunch({ url: '/pages/main/index' });
}
function goCalendar() {
  uni.navigateTo({ url: '/pages/calendar/index' });
}
function goRecord() {
  uni.navigateTo({ url: '/pages/record/index' });
}
function editTransaction(id: string) {
  uni.navigateTo({ url: `/pages/record/index?id=${id}` });
}

/**
 * 左滑操作（复制 / 删除）—— 逻辑抽到 `utils/txnSwipe.ts`，
 * 与日历页共用同一套（文案与刷新行为必须完全一致，各写一遍必然分叉）。
 */
const { SWIPE_OPTIONS, onSwipe } = useTxnSwipe(() => reloadAll());

/**
 * 接收从「记账页」区间卡片传来的参数：
 *   `start` / `end` —— 该区间的起止日期（YYYY-MM-DD）
 *   `unit`          —— 对应的分组粒度（today→day / week→week / month→month / year→year）
 *
 * 参考图的形态是：导航栏标题显示区间（如 `2026.9.14-9.14`）、底栏显示粒度、
 * 列表按该粒度分组、时间筛选显示「自定义」+ 区间。
 *
 * ⚠️ 用 `onLoad` 而不是 `onMounted`：单页容器架构下视图没有自己的页面生命周期，
 *    但流水页是**独立页**，onLoad 能拿到 query（且只在挂载时触发一次，正是我们要的）。
 */
onLoad((options?: Record<string, string>) => {
  if (options?.start && options?.end) {
    filterModel.start = options.start;
    filterModel.end = options.end;
    // 时间行显示「自定义」+ 区间（用户确认选 B：不新增「今天/本周」预设）
    filterModel.timeLabel = '自定义';
    /*
     * 标题格式对齐参考图：`2026.9.14-9.14`（起点带年、终点只带月日；月份不补零）。
     * 年份区间（本年/去年）则显示 `2026年`，由下面的判断分支处理。
     */
    const [sy, sm, sd] = options.start.split('-').map(Number);
    if (options.unit === 'year') {
      pageRangeText.value = `${sy}年`;
    } else {
      const [, em, ed] = options.end.split('-').map(Number);
      pageRangeText.value = `${sy}.${sm}.${sd}-${em}.${ed}`;
    }
  }
  if (options?.unit) {
    const u = options.unit as SummaryUnit;
    if (['year', 'quarter', 'month', 'week', 'day'].includes(u)) {
      unit.value = u;
      groupBy.value = 'time';
    }
  }

  /*
   * 首页「本月各分类支出排行」点进来时带的三件套（用户给的参考图）：
   *   · groupBy=category + level=1 → 底栏高亮「一级分类」
   *   · categoryIds=<一级 id>     → 只筛这一个分类（后端会连带其下二级）
   * 时间则由上面的 start/end 分支一并设好（显示「自定义」+ 区间标题）。
   *
   * ⚠️ 放在 unit 分支**之后**：这样即便两处都传了 groupBy，也以这里为准。
   * ⚠️ 标题不覆盖：分类场景下 start/end 分支已把 pageRangeText 设成日期区间，
   *    与参考图一致（顶部显示区间，分组标题显示分类名）。
   */
  if (options?.groupBy === 'category') {
    groupBy.value = 'category';
    const lv = Number(options.level);
    level.value = lv === 2 ? 2 : 1;
  }
  if (options?.categoryIds) {
    const ids = String(options.categoryIds)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length) filterModel.categoryIds = ids;
  }
});

onMounted(async () => {
  await categoryStore.load();
  await loadGroups();
  measureHeader();
});
</script>

<style scoped lang="scss">
.page {
  min-height: $page-min-height;
  background: $bg-canvas;
  /* 底部筛选栏是 fixed，留出高度避免遮住最后一组 */
  padding-bottom: calc(52px + env(safe-area-inset-bottom));
}

/* ── 渐变头（顶栏 + 结余融为一体）──
 *
 * 渐变从屏幕最顶端开始（含状态栏区域），所以背景挂在 .header 上、
 * nav/hero 都是透明的。nav 内的图标与文字相应改为白色（原为压白底的深墨色）。
 */
/*
 * 渐变头：nav 是 fixed（始终贴顶），所以这里用 padding-top 把 hero 推到顶栏下方 ——
 * 渐变背景仍覆盖整块（含状态栏与顶栏区域），视觉上 nav 与 hero 依旧是"一块"。
 */
.header {
  background: $gradient-banner;
}

/*
 * 顶栏：始终 fixed 贴顶。初始透明（渐变透出来）+ 白字；
 * 滚过渐变头后加 .solid → 白底 + 深字（见下方 .nav.solid 规则）。
 */
.nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 110;
  background: transparent;
  transition:
    background-color 0.2s ease,
    box-shadow 0.2s ease;
}

/* 吸顶后的实心态：白底 + 发丝下边线，图标与文字转为深墨 */
.nav.solid {
  background: $bg-canvas;
  box-shadow: 0 1px 0 $line;
}

.nav.solid .nav-btn {
  color: $text-primary;
}

.nav.solid .nav-title {
  color: $text-primary;
}

.nav-inner {
  height: 44px;
  display: flex;
  align-items: center;
  padding: 0 $space-2;
}

/* 压在深橙渐变上，图标改白（白压 $gradient-banner 最浅端 4.52:1 ✅） */
.nav-btn {
  width: $touch-target-min;
  height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-inverse;
}

.nav-title {
  flex: 1;
  text-align: center;
  font-size: $font-h2;
  line-height: $lh-h2;
  font-weight: $weight-semibold;
  color: $text-inverse;
}

.nav-actions {
  display: flex;
}

/* ══ 全屏搜索页 ══
 *
 * 覆盖整个视口（含顶栏与底栏）—— 搜索是"进入另一个模式"，
 * 半覆盖会让人不确定现在还能不能操作底下的列表。
 */
.search-page {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: $bg-canvas;
  display: flex;
  flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom);
}

.search-head {
  display: flex;
  align-items: center;
  padding: $space-2 $space-3 0;
  background: $bg-canvas;
}

.search-box {
  flex: 1;
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 $space-3;
  background: $bg-sunken;
  border-radius: $radius-pill;
}

.search-box-icon {
  color: $text-tertiary;
  margin-right: $space-2;
  flex-shrink: 0;
}

.search-box-input {
  flex: 1;
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-primary;
}

.search-box-clear {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-tertiary;
  flex-shrink: 0;
}

.search-cancel {
  padding: 0 $space-2 0 $space-3;
  height: 36px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.search-cancel-text {
  font-size: $font-body;
  line-height: $lh-body;
  color: $brand-700;
}

/* 结果概览：标题 + 该次搜索的收支合计 */
.search-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $space-4 $space-4 $space-3;
  border-bottom: 1px solid $line;
}

.search-summary-title {
  font-size: $font-h1;
  line-height: $lh-h1;
  font-weight: $weight-semibold;
  color: $text-primary;
}

.search-summary-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.search-summary-line {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.search-summary-key {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-tertiary;
  margin-left: $space-2;
}

.search-summary-val {
  @include tabular-nums;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  margin-left: 2px;
  @include text-safe;
}

.search-summary-sep {
  margin: 0 $space-1;
  color: $text-disabled;
  font-size: $font-caption;
  line-height: $lh-caption;
}

.search-results {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* 搜索结果的明细行与主列表同款，只是不需要分组缩进 */
.search-txn {
  background: $bg-canvas;
}

/* ── 结余区（与 nav 同处一块渐变，故自身背景透明）── */
.hero {
  background: transparent;
  padding: $space-4 $space-4 $space-5;
}

/*
 * ×2 字号下「15,852.80 结余」一行放不下（实测 R=329 > 视口 320）。
 * 与项目其他金额行同一套做法：`flex-wrap` 让「结余」标签整体掉到第二行。
 * 正常字号下 wrap 是 no-op，所以给正常布局加它是安全的兜底。
 */
.hero-main {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
}

.hero-balance {
  @include tabular-nums;
  font-size: $font-display;
  line-height: $lh-display;
  font-weight: $weight-semibold;
  color: $text-inverse;
  @include text-safe;
}

.hero-balance-label {
  margin-left: $space-2;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-inverse;
}

.hero-io {
  display: flex;
  align-items: center;
  margin-top: $space-2;
}

.hero-io-item {
  @include tabular-nums;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-inverse;
}

.hero-io-sep {
  margin: 0 $space-2;
  color: $text-inverse;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
}

/* ── 已筛选提示条 ── */
.filter-tip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $space-3 $space-4;
  background: $bg-subtle;
  border-bottom: 1px solid $line;
}

.filter-tip-text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-secondary;
  @include text-safe;
}

.filter-tip-action {
  display: flex;
  align-items: center;
  gap: $space-1;
  flex-shrink: 0;
  margin-left: $space-2;
  color: $brand-700;
}

.filter-tip-action-text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $brand-700;
}

/* ── 筛选条件摘要弹层 ── */
.summary-list {
  padding: 0 $space-4;
}

.summary-row {
  display: flex;
  align-items: center;
  min-height: $touch-target-min;
}

.summary-icon {
  color: $text-tertiary;
  margin-right: $space-3;
  flex-shrink: 0;
}

.summary-label {
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-primary;
  flex-shrink: 0;
}

.summary-value {
  flex: 1;
  text-align: right;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-secondary;
  @include text-safe;
}

.summary-footer {
  display: flex;
  gap: $space-3;
  padding: $space-5 $space-4 $space-4;
}

.summary-btn {
  flex: 1;
  min-height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-pill;
}

.summary-btn-ghost {
  background: $brand-50;
}

.summary-btn-solid {
  background: $brand-600;
}

.summary-btn-text {
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  font-weight: $weight-medium;
}

.ghost-text {
  color: $brand-700;
}

.solid-text {
  color: $text-inverse;
}

/* ── 状态 ── */
.state {
  padding: $space-8 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.state-text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-secondary;
}

/* ── 分组 ── */
.group {
  background: $bg-canvas;
  border-bottom: 1px solid $line;
}

/*
 * 组头吸顶（推送式，同 iOS 通讯录）：
 *   每个组头都是 sticky，下一个头顶上来时把上一个"推"出屏幕 ——
 *   这是 sticky 的默认行为，不需要额外计算。
 * top 由内联样式给（= 顶栏高度），因为顶栏高度含状态栏、是运行期才知道的。
 * 必须给**不透明背景**，否则下面的明细会透出来。
 */
.group-head {
  position: sticky;
  z-index: 5;
  display: flex;
  align-items: center;
  padding: $space-3 $space-4;
  background: $bg-canvas;
  border-bottom: 1px solid $line;
}

.group-title-wrap {
  flex-shrink: 0;
  min-width: 64px;
}

.group-title {
  display: block;
  font-size: $font-h1;
  line-height: $lh-h1;
  font-weight: $weight-semibold;
  color: $text-primary;
}

.group-sub {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-tertiary;
}

.group-right {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
}

.group-amounts {
  flex: 1;
  min-width: 0;
}

.group-line {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.group-key {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-tertiary;
  margin-left: $space-2;
}

.group-val {
  @include tabular-nums;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  margin-left: 2px;
}

.group-sep {
  margin: 0 $space-1;
  color: $text-disabled;
  font-size: $font-caption;
  line-height: $lh-caption;
}

.group-arrow {
  margin-left: $space-2;
  color: $text-disabled;
  flex-shrink: 0;
}

/* ── 明细 ── */
.group-body {
  background: $bg-canvas;
}

.detail-loading {
  padding: $space-4;
  text-align: center;
}

.day-head {
  padding: $space-2 $space-4;
  background: $bg-subtle;
}

.day-head-text {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-secondary;
}

.txn {
  display: flex;
  align-items: center;
  padding: $space-3 $space-4;
  border-bottom: 1px solid $line;
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
  color: $text-primary;
  @include text-safe;
}

.txn-meta {
  margin-top: 2px;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-tertiary;
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
  color: $income;
}

.expense {
  color: $expense;
}

/* ── 底部筛选栏 ── */
/*
 * ⚠️ 与 `TabBar.vue` 同一个坑：`border-box` + 固定 `height` + `padding-bottom: env(...)`
 *    会让安全区**吃掉内容高度**（Safari 全屏时 48px 只剩 13px，底栏文字被压扁）。
 *    修法一致：height 也跟着安全区长。
 */
.filter-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 100;
  display: flex;
  background: $bg-canvas;
  border-top: 1px solid $line;
  height: 48px;
  height: calc(48px + env(safe-area-inset-bottom, 0px));
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.filter-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $space-1;
  color: $text-secondary;
}

.filter-item.active {
  color: $brand-700;
}

.filter-text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
}

.filter-arrow {
  color: currentColor;
}

/* ── 通用弹层 ── */
/*
 * 弹层贴屏幕底边升起（**不留**底栏高度）——底栏被弹层盖住是有意为之：
 * 弹层是模态的，此时底栏不可操作，留白反而在下方露出一条无意义的缝。
 * 只留安全区（刘海屏底部）。
 */
.mask {
  position: fixed;
  inset: 0;
  background: $bg-mask;
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  padding-bottom: env(safe-area-inset-bottom);
}

/* `.mask-flush` 已与 `.mask` 同义（都不留底栏高度），保留类名只为语义可读 */
.mask-flush {
  padding-bottom: env(safe-area-inset-bottom);
}

/*
 * ⚠️ 弹层底部要留出**底栏高度**（48px）：`.filter-bar` 是 fixed 的，
 *    不给留白的话弹层最下沿会被它压住（用户明确要求"弹出的窗不要压住底栏"）。
 *    `.filter-bar` 的 z-index 是 100，`.mask` 是 1000，所以弹层盖在底栏之上，
 *    留白只是为了让内容不被遮。
 */
/* ⚠️ 这里**不**再加底部留白 —— 留白加在 `.mask` 上（见上），
 *    两处都加会让弹层底部凭空多出 48px 空白。 */
/*
 * ⚠️ 必须是 flex 列 + 中间区可滚动。
 *
 * 踩过：内容超长时（时间弹层 = 6 个预设 + 180px 滚轮）`.sheet-footer` 被**挤出容器**
 * （实测 sheet 底 764、footer 顶 816 —— footer 落到屏幕外，点不到「确定」）。
 * 原因是 `.sheet` 只有 max-height、没有 overflow 约束，子元素直接溢出而不是滚动。
 */
/*
 * ⚠️ `overflow: hidden` 不能省。
 *
 * 踩过：只写 `max-height: 72vh` + `display: flex`，**max-height 约束不住 flex 子项** ——
 * 内容超长时子元素直接溢出（实测 sheet 底 764、footer 顶 816，footer 落到屏幕外），
 * 且溢出的滚轮会盖住底部按钮、拦截点击。
 * 加上 `overflow: hidden` 后 max-height 才真正生效，配合 `.sheet-body` 的
 * `height: 0 + flex: 1` 让中间区在剩余空间内滚动。
 */
.sheet {
  width: 100%;
  max-height: 72vh;
  background: $bg-card;
  border-radius: $radius-lg $radius-lg 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/*
 * 中间可滚动区的高度**由 JS 算出**（见模板上的 :style 绑定）。
 *
 * 踩过三轮，flex 方案在 uni-app 的 scroll-view 上全部失败：
 *   ① `flex: 1; min-height: 0` → scroll-view 内部自己算高度、按内容撑开，
 *      滚轮溢出并盖住「确定」（点击被 `.wheel-item` 拦截）；
 *   ② `flex: 1; height: 0` → footer 被挤到 sheet 之外（实测子元素 top 比 sheet top 还小，
 *      即**整体向上溢出**），点击被 `.sheet-header` 拦截；
 *   ③ `height: calc(72vh - 144px)` → 仍依赖 sheet 的 max-height 与之精确对齐，脆。
 *
 * 最终方案：**JS 按视口高度直接算**，不依赖任何 flex 推导。
 * 这是项目里已有的经验：「内部用 scroll-view 滚动的页面要写 height，不能只写 min-height」。
 */
.sheet-body {
  flex: none;
}

.sheet-footer {
  flex: none;
}

/* header 也不参与拉伸，高度恒定 */
.sheet-header {
  flex: none;
}

.sheet-tall {
  height: 80vh;
  display: flex;
  flex-direction: column;
}

.sheet-head {
  padding: $space-4 $space-4 $space-2;
  text-align: center;
}

.sheet-title {
  display: block;
  font-size: $font-h2;
  line-height: $lh-h2;
  font-weight: $weight-semibold;
  color: $text-primary;
}

.sheet-sub {
  display: block;
  margin-top: $space-1;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-tertiary;
}

.sheet-item {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-top: 1px solid $line;
}

.sheet-item-row {
  justify-content: space-between;
  padding: 0 $space-5;
}

.sheet-item-text {
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  color: $text-primary;
}

.sheet-item-active {
  color: $brand-700;
  font-weight: $weight-medium;
}

.sheet-check {
  color: $brand-700;
}

.sheet-cancel {
  margin-top: $space-2;
  border-top: none;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $space-3 $space-2;
}

.sheet-header-btn {
  min-width: $touch-target-min;
  height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-secondary;
}

.sheet-header-title {
  font-size: $font-h2;
  line-height: $lh-h2;
  font-weight: $weight-semibold;
  color: $text-primary;
}

.sheet-header-action {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $brand-700;
}

.cat-list {
  flex: 1;
  min-height: 0;
}

.cat-row {
  display: flex;
  align-items: center;
  min-height: 52px;
  padding: 0 $space-4;
  border-bottom: 1px solid $line;
}

.cat-child {
  padding-left: $space-8;
}

.cat-check {
  width: 20px;
  height: 20px;
  border-radius: $radius-sm;
  border: 1.5px solid $border-input;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: $space-3;
  flex-shrink: 0;
  color: $text-inverse;
}

.cat-check.checked {
  background: $brand-600;
  border-color: $brand-600;
}

.cat-icon {
  margin-right: $space-3;
  flex-shrink: 0;
}

.cat-name {
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-primary;
  @include text-safe;
}

/* ── 自定义区间（参考图形态）──
 *
 * 上方两个可点的「开始/结束」，下方三列滚轮（年/月/日）。
 * 用橙色下划线指示当前正在编辑哪一端 —— 只靠颜色区分两端对色盲用户不够（WCAG 1.4.1），
 * 所以「开始/结束」文字标签本身也始终显示。
 */
.range-panel {
  border-top: 1px solid $line;
  padding: $space-3 0 0;
}

.range-tabs {
  display: flex;
  align-items: flex-start;
  padding: 0 $space-4 $space-2;
}

.range-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.range-tab-label {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-tertiary;
}

.range-tab-value {
  margin-top: $space-1;
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  color: $text-primary;
  @include tabular-nums;
}

.range-tab-value.active {
  color: $brand-700;
  font-weight: $weight-medium;
}

.range-tab-line {
  margin-top: $space-2;
  height: 2px;
  width: 100%;
  background: $brand-600;
  border-radius: $radius-pill;
}

.range-sep {
  margin: $space-5 $space-2 0;
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  color: $text-disabled;
}

.range-wheel {
  height: 180px;
}

.wheel-item {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: $font-h1;
  line-height: $lh-h1;
  color: $text-primary;
}

.sheet-footer {
  padding: $space-4;
}

.btn {
  min-height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-md;
}

.btn-confirm {
  background: $brand-600;
}

.btn-text {
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  font-weight: $weight-medium;
}

.confirm-text {
  color: $text-inverse;
}

/* 宽屏限宽居中（与报表页同一约定：独立页无底栏，可安全限宽） */
@media (min-width: 600px) {
  .page {
    max-width: 480px;
    margin: 0 auto;
    border-left: 1px solid $line;
    border-right: 1px solid $line;
  }
  .filter-bar {
    max-width: 480px;
    left: 50%;
    transform: translateX(-50%);
  }
}
</style>
