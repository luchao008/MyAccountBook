<template>
  <view class="page">
    <!--
      ══════ 渐变头（顶栏 + 结余，融为一体）══════

      结构上 nav 与 hero 合成**同一块渐变容器**，而不是"白色 nav + 下方渐变 hero"两块：
      融合后渐变从**屏幕最顶端（状态栏之上）**开始，视觉上是一个整体。

      v1.1 变更：渐变由「深橙」改为「浅金」($v11-hero-gradient #FDF6EF → #FBF0E4)，
      因此 nav / hero 里的前景色**必须同时由白字改回深金字** ($v11-hero-ink #8F5312) ——
      白字压在浅金上只有 1.07:1，等于完全消失。
      ⚠️ 实测 $v11-hero-ink 压渐变最浅端 5.74:1 / 最暗端 5.47:1，两端都达标。
      ⚠️ 通用教训：**换背景色时，前景色不能靠"看起来还行"来判断** ——
         这类错误不报错、不警告，只有肉眼看图才会发现。
    -->
    <view class="header" :style="{ paddingTop: navHeight + 'px' }">
      <view
        class="nav"
        :class="{ solid: navSolid }"
        :style="{ paddingTop: statusBarHeight + 'px' }"
      >
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
        <!--
          首屏：结余也铺骨架。
          不铺的话屏幕上会是一个 **0.00** —— 它看起来像真数据（今天没花钱），
          比空着更误导。骨架至少诚实地说明「还没算出来」。
        -->
        <template v-if="skeleton">
          <view class="hero-main">
            <Skeleton hero w="180" h="34" r="8" />
            <Skeleton hero w="32" h="12" />
          </view>
          <view class="hero-io">
            <Skeleton hero w="140" h="12" />
          </view>
        </template>
        <template v-else>
          <view class="hero-main">
            <text class="hero-balance">{{ formatMoney(total.balance) }}</text>
            <text class="hero-balance-label">结余</text>
          </view>
          <view class="hero-io">
            <text class="hero-io-item">收入 {{ formatMoney(total.income) }}</text>
            <text class="hero-io-sep">|</text>
            <text class="hero-io-item">支出 {{ formatMoney(total.expense) }}</text>
          </view>
        </template>
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
    <!--
      首屏骨架：铺**真的分组形状**（组头 + 两条明细），而不是一个转圈。
      本页是「组头（结余/收入/支出）+ 明细行」的重复结构，骨架照抄这个形状 ——
      数据到位时布局几乎不跳（CLS 小），用户也能预判马上会出现什么。
      ⚠️ 只在首屏出现；筛选/搜索/返回刷新时不铺（那时旧数据还在，换成灰块是倒退）。
    -->
    <!--
      ── 骨架 ⇄ 内容：交叉淡入（2026-10-03 新增，规格见 docs/交互动效规格.md §C3）──

      `<Transition>` 必须包住**整条 v-if 链**（骨架 / 错误 / 空 / 内容 四选一），
      不能只包骨架 —— 那样切换时另一半不在过渡里，等于动画只做了一半。

      ⚠️ 外面这层 `.cross-host` 的唯一作用是**提供定位上下文**：离开的那一块会被
         `position: absolute` 脱流（否则两个分支同时占位、容器高度瞬间变成两者之和，
         页面会突然长高一大截，滚动位置跟着跳）。
         这层 relative **不能直接加到 `.page` 上** —— 三个视图的 `.page` 里都有
         `position: absolute` 的子孙（HomeView 1 处 / ReportView 2 处），
         改掉它们的定位参照会连带出别的问题。

      ⚠️ 为什么不能只做「内容淡入」：把骨架**瞬时**撤掉、再让内容从 opacity 0 淡入，
         前几十毫秒内容几乎不可见 —— 那等于**亲手制造**了空白帧（比瞬切更差）。
         消除闪白只能靠**交叉**：骨架在下面垫着，内容在它上面渐显。

      ⚠️ `<Transition>` 在**小程序端不渲染动画**（静默降级为瞬变）。这是项目既有的
         "H5 优先"取舍，与 7 个弹层的处理一致。
    -->
    <view class="cross-host">
      <Transition name="cross">
        <view v-if="skeleton" class="groups">
          <view v-for="n in 4" :key="n" class="group">
            <view class="group-head sk-head">
              <view class="group-title-wrap">
                <Skeleton w="48" h="16" />
                <Skeleton w="32" h="11" />
              </view>
              <view class="group-right">
                <Skeleton w="112" h="12" />
                <Skeleton w="128" h="12" />
              </view>
            </view>
            <view class="group-body">
              <view class="sk-rows">
                <view v-for="m in 2" :key="m" class="sk-row">
                  <Skeleton circle :h="28" />
                  <view class="sk-row-main">
                    <Skeleton w="72" h="14" />
                    <Skeleton w="104" h="11" />
                  </view>
                  <Skeleton w="64" h="14" />
                </view>
              </view>
            </view>
          </view>
        </view>

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
                    <text class="group-val" :class="signClass(g.balance)">{{
                      formatMoney(g.balance)
                    }}</text>
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

            <!--
          组内明细：按日分组

          ⚠️ 折叠态**不再用 `v-if` 卸载**，改用 `.group-body-inner` + `grid-template-rows: 0fr → 1fr`
             控制高度（样式见下方 `.group-body`）。
             原因：`v-if` 卸载时高度是**瞬变**的 —— 点一下分组头，下面的内容会"啪"地跳下去。
             这是本项目里"元素出现 / 消失"这一类剩下的最后一处瞬变。
             `height: auto` 无法过渡（浏览器不知道目标值）；`max-height` 猜一个大值会让
             **时长随内容量漂移**（内容少时表现为"点了没反应、然后突然收起"）——
             grid 的 `0fr → 1fr` 是唯一**既不需要预设高度、时长又恒定**的解法。
        -->
            <view class="group-body" :class="{ open: expanded.has(g.key) }" :data-gkey="g.key">
              <view class="group-body-inner">
                <view v-if="loadingDetail.has(g.key)" class="detail-loading">
                  <text class="state-text">加载中…</text>
                </view>
                <!--
              ⚠️ `expanded.has(g.key) &&` 这半句是**必需的**：折叠时 `details[key]` 还没加载，
              `!undefined` 为真 ⇒ 它会渲染「该时段无流水」。当前被 0fr 压扁所以看不见，
              但只要将来给 `.group-body-inner` 加了 padding（比如 1px），这句错就会立刻露出来。
            -->
                <EmptyState
                  v-else-if="expanded.has(g.key) && !details[g.key]?.length"
                  icon="icon-inbox"
                  text="该时段无流水"
                />
                <template v-else>
                  <view v-for="day in details[g.key]" :key="day.date" class="day">
                    <!--
                日头是否带月份的唯一判据是 `dayHeadWithMonth`（见 script 里它的定义）：
                只有「时间 × 月粒度」不带，其余（年 / 季 / 周 / 天 / 分类）都带。
              -->
                    <view class="day-head">
                      <text class="day-head-text">{{ dayHeader(day.date, dayHeadWithMonth) }}</text>
                    </view>
                    <uni-swipe-action v-for="t in day.items" :key="t.id">
                      <uni-swipe-action-item
                        :right-options="SWIPE_OPTIONS"
                        @click="onSwipe($event, t)"
                      >
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
                          <text
                            class="txn-amount"
                            :class="t.type === 'income' ? 'income' : 'expense'"
                          >
                            {{ t.type === 'income' ? '+' : '-' }}{{ formatMoney(t.amount) }}
                          </text>
                        </view>
                      </uni-swipe-action-item>
                    </uni-swipe-action>
                  </view>

                  <!--
              「加载更多」（2026-10-01 新增）。

              ⚠️ 这一块是修**正确性**，不是装饰：
                组头的结余/收入/支出来自 summary 的**全量**聚合，而明细单请求最多 100 条
                （后端 DTO 的 size 上限就是 100）。没有这个入口时，超过 100 条的月份会出现
                **组头写 259 笔、明细只列出 100 笔**，而用户没有任何办法看到剩下的流水，
                也没有任何提示 —— 表现为"组头金额和明细加起来对不上"。
                真实库里用户 2 的 2025-08 就是 259 条（我实测过）。
                文案里带上「已显示 x / y 条」，让这个差异**显式可见**而不是静默截断。

              ⚠️ 样式只加布局属性、复用 `.state-text` 的字号与颜色：
                `scripts/check-contrast.mjs` 会校验 .vue 里的 font-size 必须落在
                `$font-*` / `$icon-*` 阶梯内，并有色值字面量扫描 —— 不新增最省事。
            -->
                  <view
                    v-if="hasMoreDetail(g.key)"
                    class="detail-more"
                    @click.stop="loadMoreDetail(g)"
                  >
                    <text class="state-text">{{ detailMoreText(g.key) }}</text>
                  </view>
                </template>
              </view>
            </view>
          </view>
        </view>
      </Transition>
    </view>

    <!-- ── 底部分组维度栏：时间 / 分类（两者互斥，各点各的弹层）── -->
    <view class="filter-bar">
      <view class="filter-item" :class="{ active: groupBy === 'time' }" @click="openUnitPicker">
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
        <view class="sheet-item" @click="goExport"
          ><text class="sheet-item-text">流水导出</text></view
        >
        <view class="sheet-item" @click="openFilterFromSheet">
          <text class="sheet-item-text">筛选</text>
        </view>
        <view class="sheet-item" @click="openSortPicker"
          ><text class="sheet-item-text">排序</text></view
        >
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
          <SvgIcon v-if="unit === u.value" class="sheet-check" name="icon-check" :size="18" />
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

    <!--
      ── 弹层 ⑤：时间预设 ──
      ⚠️ 2026-09-15 起改用公共组件 TimeRangePicker（原本是内联实现）——
          「数据导出」页要用同一套交互，抽出来避免两份逻辑分叉。
    -->
    <TimeRangePicker
      v-model:visible="timeOpen"
      :model-value="timeRangeModel"
      @pick="onTimePicked"
    />

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
import { onPageScroll, onLoad, onShow, onUnload, onReachBottom } from '@dcloudio/uni-app';
import SvgIcon from '@/components/SvgIcon.vue';
import CategoryIcon from '@/components/CategoryIcon.vue';
import EmptyState from '@/components/EmptyState.vue';
import Skeleton from '@/components/Skeleton.vue';
import FlowFilterPanel, { type FlowFilter } from '@/components/FlowFilterPanel.vue';
import FlowTypePicker from '@/components/FlowTypePicker.vue';
import FlowCategoryPicker from '@/components/FlowCategoryPicker.vue';
import TimeRangePicker, { type TimeRange } from '@/components/TimeRangePicker.vue';
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
import { createLatest } from '@/utils/latest';

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

/* ── 明细预加载（2026-10-03）─────────────────────────────────────────────
 *
 * 目标：**在用户到达底部之前**把下一页备好 ⇒ 滚动全程无停顿、无空白。
 * 触发方式从"触底"（`onReachBottom`）改成"**接近底部**"：`onPageScroll` 里算
 * 「距列表底部还剩多少 px」，≤ 阈值就预取。`onReachBottom` 保留为**兜底**（见下）。
 *
 * ── 阈值怎么设与算 ──────────────────────────────────────────────
 *  `PREFETCH_VIEWPORT_MULTIPLE = 1.5`，实际阈值 = **1.5 × 可视区域高度**（H5 375×812 ⇒ 1218px）。
 *  为什么用「可视高度的倍数」而不是固定 px：
 *   · 固定 px 在小屏上提前量过大（浪费流量）、在大屏上过小（没效果，等于没预加载）；
 *   · 视口高度正是"用户一屏能看到多少内容"的度量，倍数即"提前几屏开始拉"，
 *     语义直观且随设备自适应。
 *  为什么取 1.5（需求给的区间是 1~2）：
 *   · 1.0 = 刚好在到底时才开始拉 ⇒ 请求往返期间用户已经看到底了，**没有真正"提前"**；
 *   · 2.0 = 提前两屏，对"一次只翻一页"的列表偏多，容易在用户没打算继续翻时就白拉流量；
 *   · 1.5 ≈ 提前一屏半，是"网络往返（通常 <300ms，用户滑一屏的时间）+ 一次翻页的量"，
 *     够覆盖又不浪费。**要调就改这一个常量**，计算逻辑不用动。
 *
 * ⚠️ 数值**现算**（`prefetchThreshold()` 每次读 `window.innerHeight`）而不是模块加载时算一次 ——
 *    移动端地址栏收起 / 横竖屏切换都会改可视高度，缓存会让阈值失真。
 *
 * ⚠️ 位置不依赖 `onPageScroll` 的 `e.scrollTop`：那个值在各端不一致（小程序端不适用），
 *    而 `window.scrollY` 在 H5 才是真值 —— `onPageScroll` 只当"触发器"用。
 */
const PREFETCH_VIEWPORT_MULTIPLE = 1.5;
/** 两次预取之间的最小间隔：`onPageScroll` 每帧都触发，不节流会连发 */
const PREFETCH_COOLDOWN_MS = 400;
/**
 * 同一次停留的判定：预取后内容变长，用户**没动**时距离又落回阈值内，
 * 若不挡住就会**级联**把 259 条（3 页）一次拉光。scrollTop 变化小于此值视为"没动"。
 */
const PREFETCH_CASCADE_GUARD_PX = 24;

/**
 * 预取触发状态：上一次预取发生在哪个 key / 哪个滚动位置 / 什么时候。
 * ⚠️ 是 `let` 不是 `const` —— 每次触发都要整体覆盖（`{ key, y, at }` 三字段要同步更新）。
 */
let lastPrefetch = { key: '', y: -1, at: 0 };

/** 当前预取阈值（px）。⚠️ 现算，不缓存 —— 见上方说明 */
function prefetchThreshold(): number {
  if (typeof window === 'undefined') return 600; // 非浏览器端兜底
  return Math.round(window.innerHeight * PREFETCH_VIEWPORT_MULTIPLE);
}

/** 距列表底部还剩多少 px（≤ 0 表示已在底部 / 已过底部） */
function distanceToBottom(): number {
  if (typeof document === 'undefined') return Number.POSITIVE_INFINITY; // 非浏览器端不触发
  const el = document.documentElement;
  return el.scrollHeight - (window.scrollY + window.innerHeight);
}

/*
 * 是否该预取下一批。三个条件缺一不可：
 *   ① 没有请求在飞（**并发控制**：一次只预取一组，跨组也排队）
 *   ② 距底部 ≤ 阈值
 *   ③ 不是"同一次停留里的重复触发"（冷却时间 + 位置都没变 ⇒ 跳过，防级联）
 *
 * ⚠️ `findAutoLoadTarget` 里还有一层"同组不并发"（`detailPaging[key].loadingMore`），
 *    两者缺一不可：这里挡跨组与频率，那里挡同组重入。
 */
function maybePrefetch(): void {
  if (autoLoadingKey.value) return; // ① 已有请求在飞
  if (typeof window === 'undefined') return;
  if (distanceToBottom() > prefetchThreshold()) return; // ② 还不够近
  const now = Date.now();
  const y = Math.round(window.scrollY);
  // ③ 同一次停留：冷却没过、且位置几乎没变 ⇒ 刚预取过，别接着拉
  if (lastPrefetch.key && now - lastPrefetch.at < PREFETCH_COOLDOWN_MS) return;
  if (lastPrefetch.key && Math.abs(y - lastPrefetch.y) < PREFETCH_CASCADE_GUARD_PX) return;
  const target = findAutoLoadTarget();
  if (!target) return; // 没有"还有剩余"的组
  lastPrefetch = { key: target.key, y, at: now };
  void loadMoreDetail(target, 'prefetch');
}

onPageScroll((e) => {
  const next = (e.scrollTop ?? 0) >= solidThreshold.value;
  if (next !== navSolid.value) navSolid.value = next;
  maybePrefetch(); // 预加载：接近底部就提前备好下一页
});

const statusBarHeight = ref(0);
try {
  const info = uni.getSystemInfoSync();
  statusBarHeight.value = info.statusBarHeight || 0;
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
 * 明细「日头」是否带月份 —— `.day-head-text` 是 `15日 周一` 还是 `9月15日 周一`。
 *
 * ⚠️ **只有「时间维度 × 月粒度」不带**，其余一律带（2026-10-03 luchao 定）：
 *   · 月粒度 → 组头就是「9月」，组内明细必然同月，日头再加月份是纯重复
 *   · 年 / 季 / 分类 → 明细横跨多个月（甚至跨年），只写「15日」根本看不出是哪个月
 *   · 周 → **ISO 周会跨月**（某周可能是 9月30 ~ 10月6），组头「第40周」不含月份
 *   · 天 → 组头已是「9月14日」，日头确实与之重复；但规则统一不开口子，
 *          "某个粒度单独例外"正是下次改错时最难排查的那类分支
 *
 * ❌ 别退回成 `groupBy === 'category'` —— 那样年/季/周三种粒度又只剩「15日」，
 *    正是本次要修的问题。判据回归在 `scripts/verify-edit-category.mjs`（① 月不带 / ①b 年季周带）。
 */
const dayHeadWithMonth = computed(() => groupBy.value === 'category' || unit.value !== 'month');

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

/**
 * 时间选择组件的受控值 —— computed 双向绑定到 filterModel 的三个字段。
 * ⚠️ 不在组件里另存一份："选"由组件负责、"何时应用"由本页决定（等筛选面板的「确定」）。
 */
const timeRangeModel = computed<TimeRange>(() => ({
  label: filterModel.timeLabel,
  start: filterModel.start,
  end: filterModel.end,
}));

/**
 * 用户选中了预设 / 自定义区间 → 写回 filterModel。
 * ⚠️ **不调 reloadAll()**：还没点筛选面板的「确定」，提前刷新会让列表在用户
 *    还在编辑其他条件时就变；真正的应用发生在 onFilterApply。
 */
function onTimePicked(v: TimeRange) {
  filterModel.timeLabel = v.label;
  filterModel.start = v.start;
  filterModel.end = v.end;
}
const sortOpen = ref(false);
const timeLabel = computed(() => filterModel.timeLabel);

/* ── 数据 ── */
const loading = ref(false);
const error = ref(false);
/**
 * 首屏骨架（2026-09-18）。
 *
 * 判据是 **正在请求 && 从未成功拿到过数据**，不是 `loading`：
 * 筛选、搜索、从记账页返回都会走 loadGroups，那些时刻旧列表还在屏幕上，
 * 换成灰块是信息量倒退。只有「页面还是空的」才需要占位。
 *
 * 用 `loaded` 而不是「有没有分组」：空账本也必须停止铺骨架，
 * 否则骨架会永远停在那儿（用户以为一直在加载）。
 */
/*
 * ⚠️ 初值必须是 `true`（2026-10-03 改，C3 交叉淡入的配套修复）。
 *
 * 首次挂载 = 首屏，此刻数据**必然**还没回来。初值给 `false` 会让**第一帧**
 * 落到下面 v-if 链的最后一个分支（内容 / 空态 / 错误态）——
 * 也就是先渲染一次「该条件下暂无流水」，然后被骨架顶掉。
 *
 * 以前这个错误分支只闪 **1 帧（约 16ms）**，基本看不见；
 * 但加了 C3 的交叉淡入后，它会**淡出 150ms**，把一闪变成了肉眼可见的错值。
 * 实测证据：交叠帧里能同时采到 `empty[leave] + 骨架[leave] + 内容[enter]` 三个分支。
 *
 * 为什么安全：本页的加载入口（`onLoad` / `onShow` → `reloadAll()`）是**无条件**调用的，
 * 所以初值 `true` 一定会在数据回来后被 `skeleton = false` 收掉（成功走内容、失败走错误态）。
 */
const skeleton = ref(true);
const loaded = ref(false);
const groups = ref<SummaryItem[]>([]);
const expanded = ref<Set<string>>(new Set());
const details = ref<Record<string, { date: string; items: TransactionItem[] }[]>>({});
const loadingDetail = ref<Set<string>>(new Set());

/**
 * 每组明细的**分页状态**。
 *
 * ⚠️ 存在的理由（2026-10-01）：组头的结余/收入/支出取的是 summary 的**全量**聚合，
 *    而明细一次只取 `PAGE_SIZE` 条（后端 `size` 上限也是 100，见
 *    `src/transaction/dto/transaction.dto.ts`）。此前 details 只存"当前拿到的这几条"，
 *    没有 total 的概念，于是超过 100 条的月份会出现
 *    **组头写 259 笔、明细只列出 100 笔、用户也没法看到剩下的** ——
 *    真实库里最多的一个月实测就是 259 条（用户 2 / 2025-08）。
 *    存下 `total` 之后，模板才能显示「加载更多（已显示 100 / 259 条）」。
 *
 * ⚠️ `page` 必须**显式记下来**，不能用 `floor(loaded / PAGE_SIZE) + 1` 反推：
 *    反推只在"每一页都恰好返回 PAGE_SIZE 条"时才成立。一旦某页返回不满
 *    （并发删除、后端 offset 与 total 不同步等），反推出来的页码会**退回上一页**，
 *    于是同一页被追加两次、列表出现重复行。记页码则永远单调递增。
 */
const detailPaging = ref<
  Record<string, { loaded: number; total: number; page: number; loadingMore: boolean }>
>({});

/** 明细每页条数。**与后端 size 上限一致**（DTO 里 max(100)），调大没有意义 */
const PAGE_SIZE = 100;

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
 * ⚠️ **按分类分组时不带时间限制**（luchao 确认）：看的是整个账本结构，
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
   * 后者若真返回空集会让人误以为"账本没有数据"，与"取消筛选"的直觉不符（luchao 确认）。
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

/**
 * 分组列表的「最后写入者胜」守卫。
 *
 * ⚠️ 为什么必须有：改筛选、切粒度、切分类层级、`onShow` 返回刷新都会调 `loadGroups()`。
 *    在两个**后端成本差异大**的请求之间快速切换时（典型：粒度 年 ↔ 天），
 *    先发的响应可能后到，`groups.value` 被旧结果覆盖 ——
 *    界面上的筛选条件与列表内容对不上，而且**不报任何错**。
 *
 * 守卫把"只让最新一次落地、且只有它有权关掉加载态"收口在 `utils/latest.ts` 一处
 * （三个调用点各写一遍 = 三倍漏掉 loading/skeleton/error 某一个的机会）。
 */
const groupsGuard = createLatest();

function loadGroups() {
  loading.value = true;
  error.value = false;
  // 只有「从未成功过」才铺骨架；筛选/搜索/返回刷新时旧列表还在，不铺
  if (!loaded.value) skeleton.value = true;
  /*
   * ⚠️ 查询参数在**调用时快照**，不在 `task` 里现读。
   *    若放在 await 之后再读 `baseParams()`，这次请求携带的会是"用户后来改的条件"，
   *    也就是"旧调用发了新参数"—— 语义上说不清这次请求代表哪一次意图。
   *    （即使有守卫兜底、最终结果不会错，也会白发一次请求，且让日志难以解读。）
   */
  const params = baseParams();
  return groupsGuard.run({
    task: async () => {
      await accountStore.load();
      return getTransactionSummary(params);
    },
    onSuccess: (list) => {
      groups.value = list;
      /*
       * 骨架到这一行为止（2026-10-01 改）。
       *
       * 组头（结余/收入/支出）、分组列表所需的**全部数据**在上一行就齐了；
       * 而下面默认展开第一个分组还要再等一个明细请求。此前它是 `await` 的，
       * 于是「骨架时间 = summary + 明细」= **两个串行 RTT**，
       * 用户对着骨架白等多一整个往返，而那时页面其实已经有东西可画。
       *
       * 改成不 await：骨架在 summary 到手时立即撤掉，
       * 明细由该组自己的「加载中…」占位兜住（模板里的 `loadingDetail`），
       * 「进页面就能看到最近的明细」这个行为不变，只是明细晚一个 RTT 出现。
       * `void` 是刻意的：toggleGroup 内部自己 catch（失败时落成空数组），不会抛。
       */
      loaded.value = true;
      loading.value = false;
      skeleton.value = false;
      if (list.length) {
        void toggleGroup(list[0]);
      }
    },
    onError: (err) => {
      console.error('[flow] 分组加载失败', err);
      error.value = true;
    },
    // 兜底：异常路径下也必须把骨架撤掉（正常路径上面已经提前撤过一次，重复赋值无害）
    onSettled: () => {
      loading.value = false;
      skeleton.value = false;
    },
  });
}

/** 只重拉列表（搜索/筛选变化） */
function reloadAll() {
  expanded.value = new Set();
  details.value = {};
  detailPaging.value = {};
  loadGroups();
}

/**
 * 找到某个分组的 `.group-body` 容器。
 *
 * ⚠️ 不用 `querySelector('[data-gkey="…"]')`：`key` 里可能出现需要转义的字符，
 *    而各维度的 key 形态并不统一（月份维度是 `2026-09`、分类维度是分类 id，
 *    将来若改成中文标签就会直接炸掉）。遍历比对 `dataset` 最稳。
 */
function findGroupBody(key: string): HTMLElement | null {
  if (typeof document === 'undefined') return null; // 小程序端没有 DOM
  /*
   * ⚠️ 用下标循环而不是 `for…of`：本项目 tsconfig 没开 `downlevelIteration`，
   *    `for (const el of NodeListOf)` 会报 **TS2488**（NodeListOf 没有 Symbol.iterator）。
   */
  const list = document.querySelectorAll<HTMLElement>('.group-body');
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].dataset.gkey === String(key)) return list[i];
  }
  return null;
}

/**
 * 让 `.group-body` 从 `fromPx` 平滑长到它的内容自然高度。
 *
 * **为什么必须有**（2026-10-03 实测）：
 * 明细是**异步**到达的 —— `toggleGroup` 先展开（此时正文只有一行「加载中…」= 56px），
 * 明细到达后整块在**一帧内**长到 1395px。实测「最大单帧增长 **1339px**」，
 * 而且那一帧正好是「加载中…」消失的那一帧。
 *
 * **CSS 侧无解**，因为 transition 比较的是**指定值**而不是解析出的像素：
 *   · `height: auto → auto`   —— 浏览器不知道中间值，无法插值；
 *   · `grid-template-rows: 1fr → 1fr` —— 指定值**没变**（`1fr` 一直是 `1fr`），
 *     变的只是它解析出来的像素，所以 D1 的那套 `0fr → 1fr` 在这里**不触发**。
 * ⇒ 只能自己量、再喂给 `height`。
 *
 * ⚠️ 必须作用在**容器** `.group-body` 而不是 `.group-body-inner`：
 *    inner 是 grid item，默认 `align-self: stretch`，给它设 `height` 会被轨道覆盖而无效。
 *    容器上本来就有 `overflow: hidden`（D1 留的），正好用来裁剪过渡中尚未长满的内容。
 *
 * ⚠️ 用 `setTimeout` 兜底而不是只靠 `transitionend`：元素可能在过渡结束前被收起 /
 *    卸载，那时 `transitionend` 不会来 —— 而残留的 inline `height` 就是**下一轮那个
 *    `min-height: 0` 同款故障**（高度被钉死、再也压不下去）。
 */
function animateGroupBodyGrow(el: HTMLElement, fromPx: number) {
  if (typeof document === 'undefined') return;
  const toPx = el.getBoundingClientRect().height; // 此刻已是明细的自然高度
  if (toPx <= fromPx + 1) return; // 没长高就别插手（否则已加载过的分组会被误改）
  el.style.transition = 'none';
  el.style.height = `${fromPx}px`;
  void el.offsetHeight; // 强制回流，让下面那行 height 真的参与过渡
  el.style.transition = 'height 0.2s ease-out';
  el.style.height = `${toPx}px`;
  const clear = () => {
    el.style.transition = '';
    el.style.height = '';
  };
  el.addEventListener('transitionend', clear, { once: true });
  setTimeout(clear, 400);
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

  /*
   * 先让「加载中…」那一行渲染出来并量下它的高度 ——
   * 动画要从**这个**高度长下去（它是用户点下分组头后立刻看到的东西）。
   * ⚠️ 必须 `await nextTick()`：不 await 的话此刻 DOM 里还是上一帧的内容，
   *    量到的会是「展开前」的 0，动画就白做了。
   */
  await nextTick();
  const bodyBefore = findGroupBody(key);
  const heightBefore = bodyBefore ? bodyBefore.getBoundingClientRect().height : 0;

  try {
    const page = await getTransactions({ ...detailQuery(g), size: PAGE_SIZE });
    details.value[key] = groupByDay(page.list);
    detailPaging.value[key] = {
      loaded: page.list.length,
      total: page.total ?? page.list.length,
      page: 1,
      loadingMore: false,
    };
  } catch (err) {
    console.error('[flow] 明细加载失败', err);
    details.value[key] = [];
  } finally {
    loadingDetail.value.delete(key);
    loadingDetail.value = new Set(loadingDetail.value);
  }

  /*
   * 明细（或空态）已渲染，此刻高度已经是自然值 —— 从 `heightBefore` 平滑长过去。
   * ⚠️ 只在**首次**加载路径上做：已加载过的分组在上面就 `return` 了，不会走到这里。
   * ⚠️ 失败路径（`details[key] = []`）也会走到，此时是「加载中…」缩成空态的高度，
   *    同样平滑 —— 这是对的，不该有一种情况是瞬变的。
   */
  await nextTick();
  const bodyAfter = findGroupBody(key);
  if (bodyAfter && heightBefore > 0) animateGroupBodyGrow(bodyAfter, heightBefore);
}

/**
 * 某一组明细的查询条件。
 *
 * 展开明细要按**该组自己的口径**去查：
 *   · 时间维度 → 用该组的日期区间（不是全局筛选的 start/end，两者语义不同）
 *   · 分类维度 → 用该分类 id（一级要连带其下二级，后端 categoryIds 已支持）
 * 所以先把 baseParams 里与"分组"有关的字段剔掉，再补上本组的条件。
 *
 * ⚠️ **分类维度必须补上全局的 start/end**（2026-09-24 修）。
 *    `filterOnlyParams()` 不含时间条件（时间只在 baseParams 里加，那是给分组汇总用的），
 *    所以早先展开分类组时明细**不带时间限制** —— 表现为
 *    "筛本月私家车，展开却冒出别的月份的记录"（汇总金额对、明细不对，就是这个原因）。
 *    时间维度分支不受影响：它用 periodRange(key, unit) 自带该组区间。
 *
 * ⚠️ 拆成独立函数是 2026-10-01 为了「加载更多」复用：翻页必须用**完全一样**的
 *    查询条件，否则第 2 页会和第 1 页不是同一个结果集（顺序、筛选都会漂）。
 */
function detailQuery(g: SummaryItem) {
  const rest = filterOnlyParams();
  if (g.unit === 'category') {
    return {
      ...rest,
      start: filterModel.start || undefined,
      end: filterModel.end || undefined,
      categoryIds: g.key === '__none__' ? undefined : g.key,
      order: order.value,
    };
  }
  return {
    ...rest,
    ...periodRange(g.key, g.unit as SummaryUnit),
    order: order.value,
  };
}

/**
 * 加载某一组明细的**下一页**（模板里的「加载更多」）。
 *
 * 为什么需要它：组头金额来自 summary 的**全量**聚合，而明细单次最多 100 条 ——
 * 没有这个入口时，超过 100 条的月份会出现"组头 259 笔、明细只有 100 笔"的数字不一致，
 * 而且用户**没有任何办法**看到剩下的流水（后端 size 上限就是 100）。
 * 真实库里用户 2 的 2025-08 正是 259 条。
 *
 * 追加策略：把「已加载的扁平列表 + 新一页」重新归组。
 *   · 后端按时间倒序返回，分页顺序拼接后整体顺序仍然正确；
 *   · `groupByDay` 用 Map，日期桶按**首次出现顺序**排列，所以跨页时同一天会被合进同一个桶；
 *   · 代价是 O(已加载条数) 的一次重排 —— 几百条量级可忽略。
 */
async function loadMoreDetail(g: SummaryItem, mode: 'user' | 'prefetch' | 'reach' = 'user') {
  const key = g.key;
  const st = detailPaging.value[key];
  // 并发控制的第一道：同一组不重入（跨组的那道在 maybePrefetch 里）
  if (!st || st.loadingMore || st.loaded >= st.total) return;

  st.loadingMore = true;
  // 记下"这一组正在自动加载"，好让按钮能显示「正在为你加载 X」（跨组时尤其需要）
  if (mode !== 'user') autoLoadingKey.value = key;
  try {
    // 用记录下来的页码 +1，而不是从 loaded 反推（理由见 detailPaging 的注释）
    const nextPage = st.page + 1;
    const page = await getTransactions({
      ...detailQuery(g),
      size: PAGE_SIZE,
      page: nextPage,
    });
    const existing = (details.value[key] || []).flatMap((d) => d.items);
    const merged = [...existing, ...page.list];
    details.value[key] = groupByDay(merged);
    /*
     * 空页 = 到此为止：把 total 收到实际条数，按钮随之消失。
     * 不这么做的话，遇到"total 大于真实条数"（并发删除等）会永远点得动、每次都白拉一次空页。
     * 其余情况仍以服务端的 total 为准（它才是"组头金额对应的总笔数"）。
     */
    detailPaging.value[key] = {
      loaded: merged.length,
      total: page.list.length === 0 ? merged.length : (page.total ?? st.total),
      page: nextPage,
      loadingMore: false,
    };
  } catch (err) {
    console.error('[flow] 明细加载更多失败', err);
    st.loadingMore = false;
    /*
     * ⚠️ **预加载失败一律不弹 toast**（要求：不要在视觉上打断滚动）：
     *   用户此刻什么都没做，弹一个"加载失败"他既看不懂在等什么，也无处可点。
     *   静默失败即可 —— `st.loadingMore` 已复位，触底时 `onReachBottom` 会自然重试；
     *   若是"用户主动点按钮"，那才需要提示（他知道自己发了什么请求）。
     */
    if (mode !== 'prefetch') uni.showToast({ title: '加载失败，请重试', icon: 'none' });
  } finally {
    // 成功路径已在 try 里整体替换了 detailPaging[key]，这里只清"自动加载中"这个标记
    autoLoadingKey.value = '';
  }
}

/* ── 预加载的目标选择与状态（2026-10-03）──────────────────────────────────
 *
 * 触发条件（阈值 / 冷却 / 防级联）见上方 `maybePrefetch` 那一段 —— 这里是它用到的状态。
 *
 * 为什么**保留那个按钮**、不做成"纯自动"：
 *   1. 内容不足一屏时用户根本不会滚动 ⇒ 预加载与触底都不会触发，剩 159 条永远拿不到。
 *      按钮是这个场景**唯一**的入口。
 *   2. 预加载是**静默**的（失败不弹 toast），所以它必须有一个"用户能自己再试一次"的入口。
 *   3. 按钮文案「已显示 100 / 259 条」是"组头金额与明细条数不一致"的**常驻提示**，
 *      它必须在列表末尾一直看得见。
 *
 * 为什么目标是"**最后一个可见组**"而不是"所有可见组"：
 *   `expanded` 是 Set，多组可同时展开；一次补齐好几组，用户既看不见也停不下来。
 *   取最后一个 = 离他手指最近的那一组，最符合直觉。
 */

/** 正在被"自动"预取 / 触底补加载的组 key，空串 = 当前没有（**跨组并发的总闸**）*/
const autoLoadingKey = ref('');

/**
 * 找出"该自动加载哪一组"。
 *
 * 规则：优先取**最后一个在视口内、且还没加载完**的组；
 * 视口内一个都没有（内容不足一屏、或用户已滚过）时，退到**最早可加载**的那一组。
 * ⚠️ 下标循环而非 `for…of`：本项目 tsconfig 没开 `downlevelIteration`，
 *    遍历 `NodeListOf` 会报 TS2488。
 */
function findAutoLoadTarget(): SummaryItem | null {
  if (typeof document === 'undefined') return null; // 小程序端没有 DOM
  if (autoLoadingKey.value) return null; // 已经在加载了，别叠第二页
  const bodies = document.querySelectorAll<HTMLElement>('.group-body');
  const vh = window.innerHeight || document.documentElement.clientHeight;
  let lastVisible: SummaryItem | null = null;
  let firstAvailable: SummaryItem | null = null;
  for (let i = 0; i < bodies.length; i += 1) {
    const gkey = bodies[i].dataset.gkey || '';
    if (!hasMoreDetail(gkey)) continue;
    const g = groups.value.find((x) => String(x.key) === gkey);
    if (!g) continue;
    // 第一个够格的 = 最早的可用组（兜底用）
    if (!firstAvailable) firstAvailable = g;
    const r = bodies[i].getBoundingClientRect();
    // 不断覆盖 ⇒ 最后留下的就是**最后一个**可见的
    if (r.bottom > 0 && r.top < vh) lastVisible = g;
  }
  return lastVisible ?? firstAvailable;
}

/** 按钮文案：自动加载跨组时要说明"正在为哪一组加载" */
/**
 * 按钮文案。预取 / 触底 / 用户点击三种来源共用它。
 *
 * ⚠️ **提示为什么不会"打断滚动"**（要求）：
 *   它位于**列表末尾**，而预取发生在"距底部还剩 1.5 屏"时 —— 那一刻用户**根本看不到**
 *   这个按钮（它在视口之外），所以预取过程对视线是零打扰；
 *   等他真滑到底时，按钮已经在那里显示着"加载中…"，不需要临时去找。
 *   加上预取失败**不弹 toast**（见 loadMoreDetail），滚动全程没有会打断他的浮层。
 */
function detailMoreText(key: string): string {
  if (autoLoadingKey.value && autoLoadingKey.value !== key) {
    const g = groups.value.find((x) => String(x.key) === autoLoadingKey.value);
    return `正在为你加载「${g ? groupTitle(g) : '…'}」…`;
  }
  if (isDetailLoadingMore(key)) return '加载中…';
  return `加载更多（已显示 ${detailLoaded(key)} / ${detailTotal(key)} 条）`;
}

/** 该组是否还有未加载的明细（模板判据） */
function hasMoreDetail(key: string): boolean {
  const st = detailPaging.value[key];
  return !!st && st.loaded < st.total;
}
function detailLoaded(key: string): number {
  return detailPaging.value[key]?.loaded ?? 0;
}
function detailTotal(key: string): number {
  return detailPaging.value[key]?.total ?? 0;
}
function isDetailLoadingMore(key: string): boolean {
  return !!detailPaging.value[key]?.loadingMore;
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
  // 开面板时也让上一次会话残留的在飞搜索作废（否则它会落进刚清空的列表）
  searchGuard.invalidate();
  searchVisible.value = true;
  searchKeyword.value = '';
  searchCommitted.value = '';
  searchResults.value = [];
  searchLoading.value = false;
}

/** 关闭搜索页并清空（不把关键词带回列表 —— 那是筛选面板的职责） */
function closeSearch() {
  searchGuard.invalidate();
  searchVisible.value = false;
  searchKeyword.value = '';
  searchCommitted.value = '';
  searchResults.value = [];
  searchLoading.value = false;
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

/**
 * 搜索的「最后写入者胜」守卫。
 *
 * 与分组列表同一个道理：连按两次回车（改了关键词再搜）时，先发的可能后到，
 * 结果列表会配上一次的关键词 —— 而输入框里显示的是新词。
 * 另见 `clearSearch()` / `closeSearch()`：清空时必须 `invalidate()`，
 * 否则"清空后飞回来的旧结果"会把清空的界面又填上。
 */
const searchGuard = createLatest();

function loadSearchResults() {
  searchLoading.value = true;
  // 关键词在调用时快照（理由同 loadGroups：不在 await 之后现读 reactive）
  const keyword = searchCommitted.value;
  return searchGuard.run({
    task: async () => {
      await accountStore.load();
      return getTransactions({
        /*
         * ⚠️ 搜索**不带任何其他筛选条件**（除了账本）：它是"在全部流水里找"，
         *    带上时间范围/金额区间会让用户困惑"为什么我明明有这笔却搜不到"。
         *    账本仍然要带 —— 数据隔离的边界，不该跨账本搜。
         */
        keyword,
        size: 100,
        accountId: accountStore.currentId || undefined,
      });
    },
    onSuccess: (page) => {
      searchResults.value = page.list;
    },
    onError: (err) => {
      console.error('[flow] 搜索失败', err);
      searchResults.value = [];
    },
    onSettled: () => {
      searchLoading.value = false;
    },
  });
}

function clearSearch() {
  // 让在飞的搜索作废：否则清空后飞回来的旧结果会把刚清空的列表又填上
  searchGuard.invalidate();
  searchKeyword.value = '';
  searchCommitted.value = '';
  searchResults.value = [];
  searchLoading.value = false;
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
    ),
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
   * 全选（= 支出、收入都在）不算筛选，写进去会让人以为筛过了（luchao 确认）。
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

function openSortPicker() {
  actionVisible.value = false;
  sortOpen.value = true;
}
function pickSort(v: 'time' | 'amountDesc' | 'amountAsc') {
  order.value = v;
  sortOpen.value = false;
  reloadAll();
}

/**
 * 「流水导出」改为**跳到独立的数据导出页**（2026-09-15）。
 *
 * ⚠️ 原来这里是"直接导出当前分组为 CSV"。改成跳页的原因：
 *    用户要的是"可以设置时间和分类的导出"（参考图），只靠当前筛选条件不够。
 *    导出逻辑随之搬到 `pages/export/index.vue`，本页不再自己拼 CSV。
 */
function goExport() {
  actionVisible.value = false;
  uni.navigateTo({ url: '/pages/export/index' });
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
    // 时间行显示「自定义」+ 区间（luchao 确认选 B：不新增「今天/本周」预设）
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

/**
 * 从「记账页」（新增 / 编辑 / 复制）返回时刷新。
 *
 * ⚠️ **必须用 `onShow`，不能只靠 `onMounted`**（2026-09-17 修复）。
 * `uni.navigateBack()` 返回时**当前页面实例并没有被销毁** ——
 * `onMounted` 只在页面首次创建时跑一次，所以返回后列表还是旧数据。
 * 用户看到的就是「编辑完回来，金额没变」。
 *
 * 首次进入由上面的 `onMounted` 负责（它要等 `categoryStore.load()` 完成，
 * 顺序不能变），这里用 `firstShow` 跳过，避免同一个页面加载两次。
 */
let firstShow = true;
onShow(() => {
  if (firstShow) {
    firstShow = false;
    return;
  }
  /*
   * 用 `reloadAll()` 而不是 `loadGroups()`：它会先清空 `expanded` 与 `details`，
   * 于是重新加载后默认展开第一个分组并拉新明细 —— 与刚进页面时完全一致。
   * 若只调 `loadGroups()`，已展开分组的 `details[key]` 还在缓存里（`toggleGroup`
   * 见缓存直接 return），金额会更新但明细行仍是旧的。
   */
  reloadAll();
  // 渐变头高度可能因筛选提示条出现/消失而变，重新测一次
  measureHeader();
});

/**
 * 页面卸载：让两个守卫的在飞调用整体作废。
 *
 * ⚠️ 不做的后果不是崩溃，是**串台的提示**：本页发出的请求在用户已经返回
 *    （页面实例销毁）之后才失败时，`onError` 仍会跑 `uni.showToast`，
 *    于是用户在**别的页面**看到一个属于流水页的报错。
 *    Vue 3 对已卸载组件写 ref 不报错，所以这个副作用只有肉眼能发现。
 */
onUnload(() => {
  groupsGuard.invalidate();
  searchGuard.invalidate();
});

/*
 * 触底兜底 —— **不是主路径**。主路径是 `maybePrefetch`（接近底部就预取，
 * 阈值见上方那段）。这里只兜两种情况：
 *   ① 预加载**静默失败**后用户继续滑到这里 → 重试，且**这次会弹提示**（`mode: 'reach'`）；
 *   ② 用户快速滚动 / 直接跳到底，阈值预加载没赶上 → 补上。
 *
 * ⚠️ 必须注册在 setup 顶层，不能放进任何条件里 —— 否则首屏就注册不上了。
 * ⚠️ **末页不会发无效请求**：`findAutoLoadTarget` 只认 `hasMoreDetail`
 *    （`loaded < total`）的组；到底且已加载完时它返回 null ⇒ 这里直接返回。
 *    另外"第 2 页返回空"时 `loadMoreDetail` 会把 `total` 收到实际条数，
 *    按钮与后续请求随之一起消失。
 */
onReachBottom(() => {
  if (autoLoadingKey.value) return; // 预取还在飞，别重复发起
  const now = Date.now();
  if (lastPrefetch.key && now - lastPrefetch.at < PREFETCH_COOLDOWN_MS) return;
  const target = findAutoLoadTarget();
  if (!target) return; // 末页 / 没有剩余
  // `y: -1` = 触底触发，位置不参与"同一次停留"的级联判断（已经到底了）
  lastPrefetch = { key: target.key, y: -1, at: now };
  void loadMoreDetail(target, 'reach');
});
</script>

<style scoped lang="scss">
.page {
  min-height: $page-min-height;
  background: $v11-bg-page;
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
  background: $v11-hero-gradient;
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

/*
 * 吸顶态：iOS 毛玻璃材质（与 TabBar 用同一个 mixin，含 @supports 降级）。
 * 内容会从导航栏下穿过 —— 这正是「像个 iOS 应用」最直接的来源。
 * ⚠️ 下面 .nav.solid 的深字规则是**必需的**：nav 从浅金渐变滚到 #F8F8F8 之后，
 *    深金字仍然达标，所以这里不改色；但换成实色底后若还留着浅色字就会失读。
 */
.nav.solid {
  @include ios-material;
  box-shadow: 0 1px 0 $v11-line;
}

.nav.solid .nav-btn {
  color: $v11-text-primary;
}

.nav.solid .nav-title {
  color: $v11-text-primary;
}

.nav-inner {
  height: 44px;
  display: flex;
  align-items: center;
  padding: 0 $space-2;
}

/* 压在浅金渐变上 → 用深金字（$v11-hero-ink 压最浅端 5.74:1 ✅）。
   ⚠️ 不要用 $text-inverse —— 白字压浅金只有 1.07:1，图标会整个消失。 */
.nav-btn {
  width: $touch-target-min;
  height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $v11-hero-ink;
}

.nav-title {
  flex: 1;
  text-align: center;
  font-size: $font-h2;
  line-height: $lh-h2;
  font-weight: $weight-semibold;
  color: $v11-hero-ink;
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
  background: $v11-bg-page;
  display: flex;
  flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom);
}

.search-head {
  display: flex;
  align-items: center;
  padding: $space-2 $space-3 0;
  background: $v11-bg-page;
}

.search-box {
  flex: 1;
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 $space-3;
  background: $v11-bg-inset;
  border-radius: $radius-pill;
}

.search-box-icon {
  color: $v11-text-secondary;
  margin-right: $space-2;
  flex-shrink: 0;
}

.search-box-input {
  flex: 1;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-primary;
}

.search-box-clear {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $v11-text-secondary;
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
  color: $v11-gold;
}

/* 结果概览：标题 + 该次搜索的收支合计 */
.search-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $space-4 $space-4 $space-3;
  border-bottom: 1px solid $v11-line;
}

.search-summary-title {
  font-size: $font-h1;
  line-height: $lh-h1;
  font-weight: $weight-semibold;
  color: $v11-text-primary;
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
  color: $v11-text-secondary;
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
  color: $v11-text-disabled;
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
  background: $v11-bg-card;
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
  color: $v11-hero-ink;
  @include text-safe;
}

.hero-balance-label {
  margin-left: $space-2;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $v11-hero-ink;
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
  color: $v11-hero-ink;
}

/* 分隔符是装饰：用主色金的半透明，比正文再弱一档但仍有形状 */
.hero-io-sep {
  margin: 0 $space-2;
  color: rgba(143, 83, 18, 0.45);
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
}

/* ── 已筛选提示条 ── */
.filter-tip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $space-3 $space-4;
  background: $v11-bg-inset;
  border-bottom: 1px solid $v11-line;
}

.filter-tip-text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $v11-text-secondary;
  @include text-safe;
}

.filter-tip-action {
  display: flex;
  align-items: center;
  gap: $space-1;
  flex-shrink: 0;
  margin-left: $space-2;
  color: $v11-gold;
}

.filter-tip-action-text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $v11-gold;
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
  color: $v11-text-secondary;
  margin-right: $space-3;
  flex-shrink: 0;
}

.summary-label {
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-primary;
  flex-shrink: 0;
}

.summary-value {
  flex: 1;
  text-align: right;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $v11-text-secondary;
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
  background: $v11-gold-soft;
}

.summary-btn-solid {
  background: $v11-gold;
}

.summary-btn-text {
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  font-weight: $weight-medium;
}

.ghost-text {
  color: $v11-gold;
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
  color: $v11-text-secondary;
}

/* ── 分组 ── */
.group {
  background: $v11-bg-page;
  border-bottom: 1px solid $v11-line;
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
  background: $v11-bg-page;
  border-bottom: 1px solid $v11-line;
}

/*
 * 按下反馈（2026-10-03 补）。
 *
 * ⚠️ 必须与 `App.vue` 里那条 `-webkit-tap-highlight-color: transparent` **成对存在**：
 *    那一条是**全局**的，会把系统默认的点击灰块一并去掉 ——
 *    如果这里没有自绘反馈，按下就是"毫无反应"，**比不改更差**。
 *
 * ⚠️ 取色用 `$v11-fill-system`，**不是** `$v11-bg-inset`：
 *    `.group-head` 的底色是 `$v11-bg-page`，而 `$v11-bg-inset` 压在上面**几乎不可见**
 *    （两者亮度只差 3/255）—— 完整的选值依据见 `tokens.scss` 的 `$v11-fill-system` 注释。
 *
 * ⚠️ 这里刻意**不写色值字面量**：`check-contrast.mjs` 会统计代码里色值的出现次数，
 *    注释里多写一个就多算一次，会被判成"与预期不一致"（实测踩到过）。
 *
 * 规格 §4.3：「列表行按下 100ms 变 / 200ms 回，底色转浅灰、**无位移**」——
 * 所以只改背景色、不加 transform（列表行位移会显得"晃"）。
 */
.group-head:active {
  background: $v11-fill-system;
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
  color: $v11-text-primary;
}

.group-sub {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
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
  color: $v11-text-secondary;
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
  color: $v11-text-disabled;
  font-size: $font-caption;
  line-height: $lh-caption;
}

.group-arrow {
  margin-left: $space-2;
  color: $v11-text-disabled;
  flex-shrink: 0;
}

/* ── 明细 ── */
/*
 * 分组正文：**白色载体**（浮在 #F8F8F8 页面底上），不是页面底本身。
 * ⚠️ FL-1 里页面底与卡片同白，同一个 token 两用；改名后这类"白载体"
 *    会被误当成页面底而变灰 —— 判断标准是「它是页面本身，还是浮在页面上的一块」。
 *
 * ── 展开 / 收起的高度动画（2026-10-03 新增）──────────────────────────
 * 用 `grid-template-rows: 0fr → 1fr`，**不用 height、也不用 max-height**：
 *   · `height: auto` 无法过渡（浏览器不知道目标值）；
 *   · `max-height` 需要猜一个大值，**时长会随内容量漂移**
 *     （内容少时表现为"点了没反应、然后突然收起"）；
 *   · grid 的行高过渡**不需要预设高度**，时长恒定。
 *
 * ⚠️ `overflow: hidden` 必须加在本容器上，否则 0fr 时内容仍然溢出可见。
 *
 * ⚠️ **内层 `.group-body-inner` 必须显式 `min-height: 0`** ——
 *    grid 子项的 `min-height` 默认是 `auto`，它会拒绝被压到 0。
 *    **2026-10-03 负向验证实测**：去掉这一行后收起时**高度纹丝不动（1395px 全程不变）**
 *    —— 不是"留一截"，是**功能直接坏掉**。这是 grid 折叠动画最经典的坑。
 *
 * ⚠️ 这仍然是**布局动画**（会 reflow），但重排范围**局限在本容器内**，
 *    不会牵动容器外的兄弟节点 —— 展开收起在语义上就是布局变化，这已是最小代价。
 *    （全站压平由 `App.vue` 的 `prefers-reduced-motion` 全局规则负责，这里不必再 include。）
 */
.group-body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.2s ease-out;
  overflow: hidden;
  background: $v11-bg-card;
}

.group-body.open {
  grid-template-rows: 1fr;
}

.group-body-inner {
  /* 见上方注释：不写这行，收起时高度纹丝不动（负向验证实测） */
  min-height: 0;
}

/* ── 首屏骨架 ──
 *
 * 骨架**照抄真实结构**（组头 + 明细行），而不是画一堆等宽灰条：
 * 数据到位时布局几乎不跳（CLS 小），用户也能预判马上会出现什么形状。
 *
 * ⚠️ 组头骨架复用 .group-head 的 padding 与 flex，只覆盖 sticky：
 *    骨架不该吸顶（它又不是真组头，吸着反而像页面卡住了）。
 */
.sk-head {
  position: static;
  justify-content: space-between;
}

.sk-rows {
  padding: $space-2 0;
}

.sk-row {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-3 $space-4;
}

.sk-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-loading {
  padding: $space-4;
  text-align: center;
}

/*
 * 「加载更多」入口（见模板里的长注释）。
 * 只写布局：字号/颜色复用 `.state-text`，避免动 font-size 阶梯与色值扫描。
 * `min-height: 44px` 是为了满足项目一贯的触控目标下限（见 docs 的无障碍约定）。
 */
.detail-more {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: $space-4;
  text-align: center;
}

.day-head {
  padding: $space-2 $space-4;
  background: $v11-bg-inset;
}

.day-head-text {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
}

.txn {
  display: flex;
  align-items: center;
  padding: $space-3 $space-4;
  border-bottom: 1px solid $v11-line;
}

/*
 * 按下反馈（2026-10-03 补）—— 流水行是整个 App 点击最频繁的元素，
 * 之前它是**唯一没有按下反馈的高频元素**（金额键盘、TabBar、排名项等 13 处早就有）。
 *
 * 取色与理由同上面的 `.group-head:active`（页面底上的按下用 `$v11-fill-system`）。
 * 与 `App.vue` 的 `-webkit-tap-highlight-color: transparent` 成对存在 —— 不可拆分。
 */
.txn:active {
  background: $v11-fill-system;
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
  /*
   * 底部筛选栏：与 TabBar **同一套毛玻璃材质**（含 @supports 降级）。
   * 内容从它下方穿过时观感一致；用页面灰（#F8F8F8）会显得像一条没画完的横条。
   */
  @include ios-material;
  border-top: 1px solid $v11-line;
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
  color: $v11-text-secondary;
}

.filter-item.active {
  color: $v11-gold;
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
 *    不给留白的话弹层最下沿会被它压住（luchao 明确要求"弹出的窗不要压住底栏"）。
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
  background: $v11-bg-card;
  border-radius: $v11-radius-sheet-top $v11-radius-sheet-top 0 0;
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

/* header 也不参与拉伸，高度恒定 */
.sheet-header {
  flex: none;
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
  color: $v11-text-primary;
}

.sheet-sub {
  display: block;
  margin-top: $space-1;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
}

.sheet-item {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
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
  color: $v11-text-secondary;
}

.sheet-header-title {
  font-size: $font-h2;
  line-height: $lh-h2;
  font-weight: $weight-semibold;
  color: $v11-text-primary;
}

/* ── 自定义区间（参考图形态）──
 *
 * 上方两个可点的「开始/结束」，下方三列滚轮（年/月/日）。
 * 用橙色下划线指示当前正在编辑哪一端 —— 只靠颜色区分两端对色盲用户不够（WCAG 1.4.1），
 * 所以「开始/结束」文字标签本身也始终显示。
 */

.btn {
  min-height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-md;
}

.btn-confirm {
  background: $v11-gold;
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
    border-left: 1px solid $v11-line;
    border-right: 1px solid $v11-line;
  }
  .filter-bar {
    max-width: 480px;
    left: 50%;
    transform: translateX(-50%);
  }
}
</style>
