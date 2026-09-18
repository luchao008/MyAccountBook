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
 * uni.showModal / showToast 的默认 z-index 是 999，低于本项目自定义弹层
 * （如 CategoryPicker 的遮罩是 1200）—— 于是在自定义弹层里调 showModal
 * （如「记一笔 → 分类选择器 → 新增二级分类」）时，弹窗会被盖在下面点不到。
 *
 * 必须用标签选择器 uni-modal / uni-toast（外层自定义元素），不是类 .uni-modal
 * （内层 div）：uni-app H5 结构是 <uni-modal style="z-index:999"><div class="uni-modal">
 * </div></uni-modal> —— 真正决定层叠的是外层自定义元素的 z-index，只改内层无效（踩过）。
 * 抬到 3000（高于项目里所有自定义弹层，最高 1200），保证弹窗/提示永远在最上层。
 */
uni-modal,
uni-toast,
uni-mask,
.uni-modal,
.uni-mask,
.uni-toast,
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
</style>
