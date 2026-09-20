<template>
  <view class="page">
    <view class="header">
      <!-- App 图标：米色圆角卡片 + 记账本/铅笔。源文件 assets/app-icon-source.png，
           产物 static/app-icon.png 由 `node scripts/gen-app-icon.mjs` 生成（自动裁切 + 圆角）。
           ⚠️ 与 favicon（/static/logo.png，仍是 logo.svg 出的金色方块）**不是同一份** ——
              那张图细节多，缩到 16px 会糊，所以 favicon 保持简洁的金色方块。 -->
      <image class="logo" src="/static/app-icon.png" mode="widthFix" />
      <text class="title">记账本</text>
      <text class="subtitle">简单记录每一笔收支</text>
    </view>

    <view class="form">
      <view class="field">
        <uni-easyinput
          v-model="form.username"
          placeholder="用户名（3-64 位）"
          :clearable="true"
        />
      </view>
      <view class="field">
        <uni-easyinput
          v-model="form.password"
          type="password"
          placeholder="密码（至少 6 位）"
          :clearable="true"
        />
      </view>

      <button class="submit" :loading="loading" @click="submit">
        {{ isRegister ? '注册并登录' : '登录' }}
      </button>

      <view class="switch" @click="toggleMode">
        <text class="switch-text">
          {{ isRegister ? '已有账号？去登录' : '没有账号？去注册' }}
        </text>
      </view>

      <view class="tip">
        <text class="tip-text">测试账号：demo / 123456</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useUserStore } from '@/store/user';

const userStore = useUserStore();

const isRegister = ref(false);
const loading = ref(false);
const form = reactive({ username: '', password: '' });

function toggleMode() {
  isRegister.value = !isRegister.value;
}

async function submit() {
  if (!form.username.trim()) {
    uni.showToast({ title: '请输入用户名', icon: 'none' });
    return;
  }
  if (form.password.length < 6) {
    uni.showToast({ title: '密码至少 6 位', icon: 'none' });
    return;
  }

  loading.value = true;
  try {
    if (isRegister.value) {
      // 申请制：注册只提交申请，不签发 token，需管理员审批后登录
      const res = await userStore.register(form.username.trim(), form.password);
      uni.showToast({ title: res.message, icon: 'none', duration: 2500 });
      isRegister.value = false;
      return;
    }
    await userStore.login(form.username.trim(), form.password);
    uni.reLaunch({ url: '/pages/main/index' });
  } catch (err: any) {
    // 错误提示已在 request 拦截器里统一 toast
    console.error('[login] 失败', err);
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped lang="scss">
.page {
  min-height: $page-min-height;
  background: linear-gradient(180deg, $v11-gold-soft 0%, $v11-bg-page 40%);
  padding: 0 32px;
}

.header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 120px;
  padding-bottom: 60px;
}

/*
 * 用图片而不是 SvgIcon。尺寸 64px 与原来 SvgIcon 的 :size="64" 保持一致。
 *
 * ⚠️ 这里用的是 **app-icon.png**（米色圆角卡片），与 favicon（logo.png，金色方块）
 *    是两份资源 —— 2026-09-19 换 logo 时按需求拆开：登录页要好看，favicon 要 16px 下清楚。
 *    改任一张图后记得重跑对应的生成脚本（gen-app-icon.mjs / gen-logo.mjs）。
 */
.logo {
  width: 64px;
  height: 64px;
}

.title {
  font-size: $font-display;
  line-height: $lh-display;
  font-weight: $weight-semibold;
  color: $v11-text-primary;
  margin-top: 12px;
}

.subtitle {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $v11-text-secondary;
  margin-top: 8px;
}

.form {
  background: $v11-bg-card;
  border-radius: 16px;
  padding: 24px 20px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
}

.field {
  margin-bottom: 16px;
}

.submit {
  margin-top: 12px;
  background: $v11-gold;
  color: $text-inverse;
  border-radius: 24px;
  font-size: $font-body-lg;
  height: 48px;
  line-height: 48px;
}

.submit::after {
  border: none;
}

.switch {
  text-align: center;
  margin-top: 16px;
  /* 触控目标：22px 行盒 + 上下各 11px = 44×44（WCAG 2.2 SC 2.5.8 建议值，非硬性 24） */
  padding: 11px 0;
}

.switch-text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $info;
}

.tip {
  text-align: center;
  margin-top: 24px;
}

.tip-text {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
}
</style>
