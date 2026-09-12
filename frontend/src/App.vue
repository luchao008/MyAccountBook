<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app';

onLaunch(() => {
  // 应用启动：这里不做任何网络请求，登录态由各页面的 onShow 自行校验
});
</script>

<style>
/* 全局样式（不加 scoped，作用于所有页面） */

page {
  background-color: #f5f6f8;
  color: #333;
  font-size: 15px;
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
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
  color: #c0c4cc;
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
