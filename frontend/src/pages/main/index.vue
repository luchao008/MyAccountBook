<template>
  <view class="main">
    <!--
      单页多视图容器（2026-09-14 起只剩**一个视图**：记账）。

      **谁该放进容器**：会长期停留、且切换时**不该**压页面栈的视图。
      **谁该独立成页**：用户看完要能"原路返回"的内容 —— 报表 `pages/statistics`。
      判据是"离开这里时该不该出现/使用返回路径"，不是"内容重不重要"。
      （「明细」已按此判据于同日下线；**「我的」于 09-14 从本容器移除** ——
       入口改由账本选择页的底栏提供，本页不再承载它。）

      仍保留 visited / v-show 这套机制：只剩一个视图时它退化为常量，
      但机制留着，将来若再加视图不必重写这段逻辑。
    -->
    <HomeView v-if="visited.home" v-show="current === 'home'" ref="homeRef" />

    <!--
      底栏只实例化一次，这是"零滑动感"的关键。
      · 「记一笔」（凸起项）没有 url：点击 emit('change', 'record')，由下面的 switchTo 兜住。
      · 「报表」**带 url**：由 TabBar 自己走页面跳转，根本不经过本页 ——
        所以 VALID_KEYS 里不该有它（它不是本容器的视图）。这也是"点了没反应"这类
        死按钮的成因：把一个跨页项错当成视图 emit，而父级没有对应分支。
    -->
    <TabBar :current="current" @change="switchTo" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import { onLoad, onShow, onPageScroll, onReachBottom, onPullDownRefresh } from '@dcloudio/uni-app';
import HomeView from '@/components/views/HomeView.vue';
import TabBar from '@/components/TabBar.vue';

type ViewKey = 'home';

/** 合法视图 key（当前只有 home；将来加视图时在这里登记） */
const VALID_KEYS = ['home'];

/** 视图 → 导航栏标题（单页容器里标题需要自己切） */
const TITLES: Record<string, string> = {
  home: '记账',
};

const current = ref<ViewKey>('home');
/** 已访问过的视图（懒挂载） */
const visited = ref<Record<string, boolean>>({
  home: true,
});

const homeRef = ref();

/*
 * ⚠️ 下面三张表用 `Record<string, …>` 而不是 `Record<ViewKey, …>`：
 *    只剩一个视图时 ViewKey 退化成单字面量联合，Vue 的 Unref/UnwrapRef
 *    会把 `Record<'home', boolean>` 的值推成 `never`（TS2322，实测）。
 *    用 string 键即可，同时保留"将来加视图只改 VALID_KEYS 与这里"的可扩展性。
 */
const refMap = computed<Record<string, any>>(() => ({
  home: homeRef.value,
}));

/** 当前激活视图的实例 */
const activeRef = computed(() => refMap.value[current.value]);

/**
 * 各视图各自的滚动位置。
 *
 * 用**普通对象**而不是 ref：onPageScroll 触发极频繁，
 * 走响应式会让每次滚动都触发依赖更新，白白开销（这里根本不需要响应式）。
 */
const scrollPositions: Record<string, number> = {
  home: 0,
};

/**
 * 是否正在恢复滚动位置。
 *
 * 为什么要这个标志：切换视图时页面总高会从"旧视图高度"突变成"新视图高度"，
 * 浏览器会立刻把 scrollTop 调整到新高度范围内 —— 这个中间态同样会触发 onPageScroll。
 * 若不禁用记录，它会被写进**新视图**的位置表里，把用户真正的记忆位置污染掉。
 */
let restoring = false;

onPageScroll((e) => {
  if (restoring) return;
  scrollPositions[current.value] = e.scrollTop ?? 0;
});

/** 底栏中间凸起项的 key：「记一笔」是动作，不是视图 */
const RECORD_KEY = 'record';

/** 切换视图：挂载（若首次）→ 激活 → 恢复该视图上次的滚动位置 */
function switchTo(key: string) {
  /*
   * 凸起项「记一笔」：不是视图，直接去记账页。
   * 用 navigateTo 保留页面栈 —— 记完返回时当前视图与它的滚动位置都还在。
   * 注意它**没有 url**（跳转目标由这里决定）；「报表」有 url、由 TabBar 自己跳。
   * 两者的差别是"谁决定去哪"，不是"要不要跳转"。
   */
  if (key === RECORD_KEY) {
    uni.navigateTo({ url: '/pages/record/index' });
    return;
  }

  if (!VALID_KEYS.includes(key as ViewKey)) return;
  const next = key as ViewKey;
  if (next === current.value) return;

  visited.value[next] = true;
  current.value = next;
  uni.setNavigationBarTitle({ title: TITLES[next] });

  restoring = true;

  nextTick(() => {
    activeRef.value?.activate?.();

    // 再等一帧：v-show 切换后页面高度由新视图决定，
    // 若在高度更新前滚动，恢复值会被旧高度截断
    setTimeout(() => {
      uni.pageScrollTo({
        scrollTop: scrollPositions[next],
        duration: 0,
        complete: () => {
          restoring = false;
        },
      });
      // 兜底：complete 在部分端不回调，避免 restoring 永久卡住
      setTimeout(() => {
        restoring = false;
      }, 120);
    }, 0);
  });
}

onLoad((options?: Record<string, string>) => {
  // 支持 /pages/main/index?tab=xxx 直接落到指定视图（当前只有 home 一个合法值）
  const tab = options?.tab as ViewKey | undefined;
  if (tab && VALID_KEYS.includes(tab)) {
    visited.value[tab] = true;
    current.value = tab;
    uni.setNavigationBarTitle({ title: TITLES[tab] });
  }
});

/** 首次显示由视图自身的 onMounted 负责，避免重复请求 */
let firstShow = true;

onShow(() => {
  if (firstShow) {
    firstShow = false;
    return;
  }
  // 从记一笔/编辑页返回时，让当前视图刷新
  nextTick(() => {
    activeRef.value?.activate?.();
  });
});

/*
 * 页面级事件由容器统一接收，再转发给当前激活视图。
 * 视图变成组件后拿不到 onReachBottom / onPullDownRefresh，
 * 这是单页架构必须补的一环（明细页的分页加载依赖它）。
 */
onReachBottom(() => {
  activeRef.value?.onReachBottom?.();
});

onPullDownRefresh(() => {
  activeRef.value?.onPullDownRefresh?.();
});
</script>

<style scoped lang="scss">
.main {
  min-height: $page-min-height;
  background: $bg-canvas;
}
</style>
