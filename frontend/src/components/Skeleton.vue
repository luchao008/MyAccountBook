<template>
  <!--
    骨架块（原始件）。各页面的骨架由它拼出来，不直接写颜色。

    ⚠️ 本组件**刻意不含任何 `font-size` 声明**。
    原因不是审美，是工程约束：`check:contrast` §13④ 把 `.vue` 里 `font-size`
    的出现次数当成断言（当前 239 / 237 / 2 / 0），改一次就要同步改三处文档。
    骨架屏是纯几何占位、不承载任何文字，本来就不该有字号 ——
    于是它天然不参与那套计数。**后续往这里加东西时请保持这一点。**

    ⚠️ 同理，本文件**不写出任何色值字面量**（注释里也不写）：
    `check:contrast` §11 的旧色值扫描会命中 .vue 里的十六进制，注释也算 ——
    那是有意的宁可误报，所以颜色的唯一真源只能是 tokens.scss。
  -->
  <view class="sk" :class="{ 'sk-hero': hero }" :style="style" />
</template>

<script setup lang="ts">
import { computed } from 'vue';

/*
 * 三个尺寸 prop 都接受 `number | string`，不是为了灵活，是**为了模板好写**：
 * `h="16"` 这种静态属性在 Vue 里是**字符串**，若 prop 只声明 number，
 * 每个调用点都得写成 `:h="16"`（多一个冒号），漏一个就 vue-tsc 报一串 TS2322。
 * 声明成联合类型后 `px()` 统一收口：数字补 px、字符串原样用（所以也支持 '60%'）。
 */
const props = withDefaults(
  defineProps<{
    /** 宽度：数字按 px；字符串原样（如 '60%'）。`circle` 时被忽略 */
    w?: number | string;
    /** 高度：数字按 px；字符串原样 */
    h?: number | string;
    /** 圆角：数字按 px；不传时用默认 4px（`circle` 时被忽略） */
    r?: number | string;
    /** 圆形（头像位 / 分类图标位）：强制 1:1，直径取 `h` */
    circle?: boolean;
    /** 坐在 banner 的浅金渐变上 —— 换金色系块（灰块压浅金会发脏） */
    hero?: boolean;
  }>(),
  { w: '100%', h: 16, r: undefined, circle: false, hero: false }
);

const px = (v: number | string | undefined): string | undefined =>
  v === undefined ? undefined : typeof v === 'number' ? `${v}px` : v;

const style = computed(() => ({
  width: px(props.circle ? props.h : props.w),
  height: px(props.h),
  borderRadius: props.circle ? '50%' : props.r !== undefined ? px(props.r) : undefined,
}));
</script>

<style scoped lang="scss">
/*
 * 颜色只有两个来源（真源见 tokens.scss 的「骨架屏」一节，那里记了实测对比度）：
 *   · $v11-skeleton       —— 压白卡 1.20、压页面底 1.13
 *   · $v11-skeleton-hero  —— banner 浅金底内（亮端 1.34 / 暗端 1.28）
 *
 * 为什么不能直接用现成的 $v11-bg-inset：它在**页面底上只有 1.03**，
 * 而首页区间行、报表页多数区块正坐在页面底上 —— 那些块会等于不存在，
 * 骨架就只做了一半（顶部看得见、下面一片空白）。
 */
.sk {
  display: block;
  flex: none;
  background-color: $v11-skeleton;
  border-radius: 4px;
  /*
   * 微光：一张斜向高光横扫，而不是「整体明暗呼吸」。
   * 呼吸式（opacity 来回）会让整块同时变浅变深，看着像页面在闪；
   * 横扫式有方向、有先后，更像「内容正在填进来」。
   *
   * 同一屏里的多块**天然同相**：它们在同一 tick 挂载、时长相同，
   * 所以不需要（也没法）做跨组件同步 —— 不会出现各扫各的乱象。
   */
  background-image: linear-gradient(
    100deg,
    rgba(255, 255, 255, 0) 30%,
    rgba(255, 255, 255, 0.55) 50%,
    rgba(255, 255, 255, 0) 70%
  );
  background-size: 220% 100%;
  background-repeat: no-repeat;
  animation: sk-sweep 1.4s ease-in-out infinite;
  @include reduce-motion;
}

.sk-hero {
  background-color: $v11-skeleton-hero;
}

@keyframes sk-sweep {
  from {
    background-position: 180% 0;
  }
  to {
    background-position: -80% 0;
  }
}
</style>