<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app';

onLaunch(() => {
  // 应用启动：这里不做任何网络请求，登录态由各页面的 onShow 自行校验
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
/* #endif */
</style>
