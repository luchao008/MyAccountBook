<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app';
import { flushQueue, isOnline, queueCount } from '@/utils/offline';

/**
 * 尝试补传离线队列。
 *
 * 只在**已登录**时做（未登录补传会 401，而 request.ts 遇 401 会 reLaunch 到登录页，
 * 在启动阶段触发会很唐突）。补传失败（仍未联网 / 业务错）静默保留队列。
 */
async function tryFlush() {
  if (!uni.getStorageSync('token')) return;
  if (!isOnline()) return;
  if (!queueCount()) return;
  const { sent } = await flushQueue();
  if (sent > 0) {
    uni.showToast({ title: `已补传 ${sent} 笔离线记账`, icon: 'none' });
  }
}

onLaunch(() => {
  /*
   * iOS Safari 的 :active 有个前置条件：**元素或它的祖先必须存在 touch 事件监听器**，
   * 否则按下时 :active 样式不生效（Safari 的已知行为，不是 bug）。
   *
   * 本项目全站 13 处按下反馈、以及本轮给列表行新增的那几处，用的都是 :active，
   * 所以这里补一个**空监听**把整份文档「激活」—— 一处改动让所有 :active 生效。
   *
   * ⚠️ 用运行时判断而不是 #ifdef H5：uni 对 <script setup> **不做条件编译**
   *    （本项目已踩过这个坑，见 MEMORY.md），#ifdef 在这里是无效的。
   *    小程序端没有 document，这个判断天然跳过。
   * ⚠️ passive: true —— 空监听不需要 preventDefault，声明 passive 免得拖慢滚动。
   */
  if (typeof document !== 'undefined') {
    document.addEventListener('touchstart', () => {}, { passive: true });
  }

  // 应用启动：登录态由各页面的 onShow 自行校验；
  // 这里只做一件事 —— 若有离线队列且在线，尝试补传
  tryFlush();

  // 网络恢复时补传
  uni.onNetworkStatusChange((res) => {
    if (res.isConnected) tryFlush();
  });
});
</script>

<style lang="scss">
/* 全局样式（不加 scoped，作用于所有页面） */

page {
  background-color: $v11-bg-page;
  color: $v11-text-primary;
  font-size: $font-body;
  // 基准行高必须显式声明：各端默认值不一致（浏览器约 1.2，小程序继承行为又有差异），
  // 不写就等于把正文行距交给渲染引擎抽签。这里也用不上「继承默认值」那套。
  line-height: $lh-body;
  font-family: $font-family-base;
  -webkit-font-smoothing: antialiased;
  /*
   * 去掉移动端浏览器自带的「点击高亮块」（iOS/Android 点可点元素时那层半透明灰）。
   *
   * ⚠️ 这一条**必须与自绘按下反馈同批存在**（见 docs/交互动效规格.md §四）：
   *    去掉默认高亮却没有任何替代，用户会觉得"点了没反应"，**比不加更差**。
   *    所以启用它的同时，本轮已给最高频的列表行补上了 :active（flow 的 .txn / .group-head 等）。
   *
   * 该属性**可继承**，写在 page 上即可覆盖页面内全部元素（含 fixed 遮罩/弹层）。
   * 宿主 uni-h5 自身没有设置过它（实测 0 处），所以这里不设就真的会露出灰块。
   */
  -webkit-tap-highlight-color: transparent;
}

/* 统一盒模型，避免 padding 把宽度撑破 */
view,
text,
input,
button,
picker {
  box-sizing: border-box;
}

/* 去掉小程序/H5 下 button 的默认边框与圆角 */
button::after {
  border: none;
}

/* 输入框占位符颜色统一 */
input::-webkit-input-placeholder {
  color: $v11-text-secondary;
}

/* 键盘焦点环（WCAG 2.4.7）。
   用 :focus-visible 而不是 :focus —— 后者会在鼠标/触摸点击后也亮一圈，观感很吵；
   :focus-visible 只在「键盘导航」时出现，正是无障碍要照顾的那种场景。
   环宽 2px + 外扩 2px，v1.1 主色金压白底 4.87:1（旧 FL-1 橙为 4.95:1）。

   ⚠️ 已知边界（诚实记录，不假装已解决）：
   uni-app H5 把 <view>/<text> 渲染成自定义元素 <uni-view>/<uni-text>，它们**默认不可聚焦**，
   所以这条规则实际只会命中原生可聚焦元素（<input>、<switch> 等）。
   要让整站都能用 Tab 走通，需要在每个可点元素上加 tabindex + role + keydown 处理 ——
   这是独立的一轮工作，本阶段只保证「本来就该亮的地方能亮，且没有任何地方把焦点环一刀切掉」。
   详见 docs/移动端配色与字体方案.md §7.3。 */
:focus-visible {
  outline: $v11-focus-ring;
  outline-offset: $v11-focus-ring-offset;
}

/* #ifdef H5 */
/* 隐藏 scroll-view 的滚动条：列表类界面在移动端观感下通常不需要滚动条 */
uni-scroll-view .uni-scroll-view::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

/*
 * uni.showModal / showToast / showActionSheet 的默认 z-index 是 999，低于本项目
 * 自定义弹层（如 CategoryPicker 的遮罩是 1200）—— 于是在自定义弹层里调 showModal
 * （如「记一笔 → 分类选择器 → 新增二级分类」）时，弹窗会被盖在下面点不到。
 *
 * 必须用标签选择器 uni-modal / uni-toast（外层自定义元素），不是类 .uni-modal
 * （内层 div）：uni-app H5 结构是 <uni-modal style="z-index:999"><div class="uni-modal">
 * </div></uni-modal> —— 真正决定层叠的是外层自定义元素的 z-index，只改内层无效（踩过）。
 * 抬到 3000（高于项目里所有自定义弹层，最高 1200），保证弹窗/提示永远在最上层。
 *
 * ⚠️ actionSheet 必须**连遮罩带弹层整层一起抬**，两者缺一不可。
 *    H5 下 <uni-actionsheet> 的 DOM 是同一父节点下的两个兄弟：
 *      ① .uni-mask.uni-actionsheet__mask（遮罩，在前）
 *      ② .uni-actionsheet（弹层本体，在后）
 *    框架里两者同为 z-index: 999，靠"同值时 DOM 靠后者在上"分层 —— 弹层盖住遮罩，正常。
 *    2026-09-19 踩过（切账本弹窗整屏变灰、点不动）：只把 .uni-mask 规则套上去之后，
 *    遮罩变 3000、弹层还是 999 —— 遮罩反过来盖住整个弹层（50% 黑罩在弹窗上面）。
 *    所以 .uni-actionsheet 要和 .uni-mask 一起进本组；同为 3000 时仍由 DOM 顺序
 *    保证弹层在上。**不要只抬遮罩不抬弹层。**
 *
 * ⚠️ 同款"遮罩是兄弟节点"结构的还有内置 picker（.uni-mask.uni-picker-mask 在前、
 *    .uni-picker-custom 在后，同为 999）。
 *    **2026-09-30 起本项目已用它**：图表页的时间粒度弹层里，自定义起止日期用的是
 *    内置 `<picker mode="date">`（自绘日期选择器成本高、收益低）。
 *
 *    ⚠️ **光抬 `.uni-picker-custom` 不够**（第一次就是这么修的，仍然被盖住）：
 *    实测 picker 的 DOM 是三层，**真正画日历面板的是最里层的 `.uni-picker-container`**，
 *    它自己还是 **999** → 被图表页的遮罩（`.mask` = 1000）**整层压住、点都点不到**。
 *    所以下面把 `uni-picker` / `.uni-picker-toggle` / `.uni-picker-custom` /
 *    `.uni-picker-container` / `.uni-date-select` / `.uni-picker-mask` **整组**一起抬 ——
 *    少抬一层就等于没抬（层叠是逐层的，中间断一节就穿不过去）。
 */
uni-modal,
uni-toast,
uni-actionsheet,
uni-mask,
uni-picker,
.uni-modal,
.uni-toast,
.uni-actionsheet,
.uni-mask,
.uni-picker-toggle,
.uni-picker-custom,
.uni-picker-container,
.uni-date-select,
.uni-picker-mask,
.uni-sample-toast,
.uni-simple-toast {
  z-index: 3000 !important;
}

/*
 * uni.showModal 的视觉覆盖（贴合本项目 v1.1 设计）。
 *
 * 默认样式是 uni-app 自带的旧 Web 风格：小圆角、标题偏细、正文灰、按钮蓝。
 * 这里全部改走项目 token（圆角 16、金色主按钮、白卡 + 发丝线），
 * 与 CategoryPicker 等自绘弹层观感一致。
 * （showToast 保持 uni 默认外观，仅由上方规则抬高 z-index 保证不被遮挡。）
 *
 * ⚠️ 字号声明会参与 check:contrast §13 的计数断言 —— 改这里要同步改脚本与文档。
 */
.uni-modal {
  border-radius: $v11-radius-card;
  background: $v11-bg-card;
  overflow: hidden;
}

.uni-modal__hd {
  padding: 24px 24px 8px;
}

.uni-modal__title {
  font-size: $font-h2;
  line-height: $lh-h2;
  font-weight: $weight-semibold;
  color: $v11-text-primary;
}

.uni-modal__bd {
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-secondary;
  padding: 16px 24px 24px;
}

/* 输入框（editable modal 用）：内嵌槽底 + 中圆角，与项目输入框一致 */
.uni-modal__textarea {
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  color: $v11-text-primary;
  background: $v11-bg-inset;
  border-radius: $radius-md;
  padding: 12px;
}

/* 按钮行：顶部发丝线 + 两个按钮之间的竖分隔线 */
.uni-modal__ft {
  border-top: 1px solid $v11-line;
}

uni-modal .uni-modal__btn {
  font-size: $font-body-lg;
  line-height: 48px;
  color: $v11-text-primary !important;
}

/* 按下反馈：与项目其它可点元素一致（浅底填充，无位移） */
uni-modal .uni-modal__btn:active {
  background: $v11-bg-inset;
}

/* 两个按钮之间的竖分隔线（默认用 border-right，这里换成发丝线） */
uni-modal .uni-modal__btn::after {
  border-color: $v11-line;
}

/* 主按钮：品牌金（与「保存 / 确定」类主操作同色） */
uni-modal .uni-modal__btn_primary {
  color: $v11-gold !important;
  font-weight: $weight-medium;
}
/* #endif */

/* ── 弹层进出场（2026-10-03 新增）───────────────────────────────────────
 * 规格见 `docs/交互动效规格.md` §B。
 *
 * 项目的弹层结构高度统一：**7 个组件都是 `.mask`（遮罩）> `.sheet`（底部面板）** ——
 *   FlowFilterPanel / FlowCategoryPicker / FlowTypePicker /
 *   TimeRangePicker / PeriodPicker / CategoryPicker / DateTimePicker
 * 所以动画**在全局定义一次就能覆盖 7 处**，组件侧只需各包一个 `<transition name="sheet">`。
 * （`NavDropdown` 结构不同 —— 它是 `.dropdown-mask` + 下拉面板，单独处理。）
 *
 * ⚠️ 选择器为什么写这么长（`.mask.sheet-enter-active .sheet`）：
 *    组件里的 `.sheet` 样式是 scoped 的（带 `[data-v-xxx]`），特异性 (0,2,0)；
 *    若只写 `.sheet-enter-active .sheet` 同样是 (0,2,0) —— 同级就只能靠 CSS 顺序决胜，太脆。
 *    加上 `.mask` 前缀提到 (0,3,0)，稳定胜出，不依赖文件顺序。
 *
 * ⚠️ 进场 mask 200ms / sheet 400ms 是**刻意不同速**的：遮罩先到位、面板随后滑上来。
 *    而**出场两者统一 250ms** —— 若遮罩先变透明，整棵子树已不可见，
 *    面板的滑下动画就白做了（这是最容易踩的一处）。
 *
 * ⚠️ 只动 `opacity` 与 `transform`（合成属性），不动 `height` / `bottom`（那会逐帧重排）。
 *
 * ⚠️ 已核实 `.sheet` 自身**没有 `transform`**，所以这里的 translateY 不会覆盖掉它的定位。
 *    若将来给 `.sheet` 加上 translateX 居中之类的写法，这里会冲突 —— 届时改用 CSS 变量组合。
 *
 * ⚠️ `<transition>` 在**小程序端不渲染动画**（静默降级为瞬变）。这是项目既有的
 *    "H5 优先"取舍，与 `pages/calendar` 里 `<transition-group>` 的处理保持一致。
 */
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.2s ease-out;
}

/* 出场与面板下滑同速（理由见上） */
.sheet-leave-active {
  transition-duration: 0.25s;
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}

.mask.sheet-enter-active .sheet {
  transition: transform 0.4s cubic-bezier(0.32, 0.72, 0, 1);
}

.mask.sheet-leave-active .sheet {
  transition: transform 0.25s ease-in;
}

.mask.sheet-enter-from .sheet,
.mask.sheet-leave-to .sheet {
  transform: translateY(100%);
}

/* ── 骨架 ⇄ 内容：交叉淡入（2026-10-03 新增）─────────────────────────────
 * 规格见 `docs/交互动效规格.md` §C3。三个整屏骨架处共用：
 *   `pages/flow`（分组列表）· `components/views/HomeView` · `components/views/ReportView`
 *
 * 结构约定（三处一致）：
 *   `.cross-host`（relative，只用来提供定位上下文）
 *     └ `<Transition name="cross">` └ 互斥分支（骨架 / 错误 / 空 / 内容）
 *
 * ⚠️ **离开的那一块必须脱流**（`position: absolute`）——
 *    两个分支同时留在文档流里时，容器高度 = 两者之和，页面会突然长高一大截。
 *    Vue 的 `<Transition>` 默认就是"两边同时在 DOM 里"（这正是"交叉"的实现方式），
 *    所以脱流不是优化，而是**前提**。
 *
 * ⚠️ **绝不能加 `mode="out-in"`**：那是"先出后进"的**串行**，中间必然存在
 *    两边都不在的一刻 —— 那一帧就是闪白。交叉的意义就在于没有这个空档。
 *
 * ⚠️ 进场 200ms / 出场 150ms 刻意不同速：骨架要**够久地垫在下面**，
 *    否则内容还没显出来、底色就先露了（那正是要消除的东西）。
 *    这也是为什么"只给内容加淡入"是负优化 —— 骨架一撤，前几十毫秒
 *    内容还几乎透明，等于亲手制造了空白帧。
 *
 * ⚠️ 只动 `opacity`（合成属性）；高度由**进入**的分支自然撑开，不做高度动画
 *    （骨架与真实内容高度不必相等，动 height 会演变成布局抖动）。
 */
.cross-host {
  position: relative;
}

.cross-enter-active {
  transition: opacity 0.2s ease-out;
}

.cross-leave-active {
  /* 脱流：理由见上方注释 */
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  transition: opacity 0.15s ease-in;
}

.cross-enter-from,
.cross-leave-to {
  opacity: 0;
}

/* ── 无障碍：尊重系统「减少动态效果」（2026-10-03 改为全局兜底）───────────
 * 项目本来就有 `@mixin reduce-motion`（tokens.scss:408），但它是**逐处 @include** 的 ——
 * 实测只覆盖了 5 处，而全站有 13 处 `transition:`、13 处 `:active`、2 处 `@keyframes`，
 * 本次新加的 7 个弹层动画更是一处都没覆盖。
 *
 * ⚠️ 「靠人记得加」对无障碍是**不可接受的**：漏掉一处，那部分用户就在那一处失去保护。
 *    所以改成全局一条 —— 一处覆盖全站，**将来新增的动画自动被覆盖**。
 *    原有那 5 处 `@include` 保留不动（无害，同时是"这里是有意动效"的显式标注）。
 *
 * ⚠️ 用 `0.01ms` 而不是 `none`：
 *    `none` 会让 `transitionend` / `animationend` **永远不触发** ——
 *    而本项目的弹层关闭依赖 Vue 的 transition 生命周期来卸载 DOM，
 *    用 `none` 会导致**弹层关不掉**。0.01ms 既让用户看不到动效，又保住了事件。
 *
 * ⚠️ `!important` 在这里是**必需**的：要压过组件 scoped 样式里的时长声明
 *    （那些选择器带 `[data-v-xxx]`，特异性更高）。这是 `!important` 少见的正当用法。
 *
 * ⚠️ 不含 `transition-property` / `animation-name` 的重写 —— 只改**时长**。
 *    这样"压平"是纯粹的加速，不会改变任何元素最终落在哪个状态，风险最小。
 */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
