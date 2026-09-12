<template>
  <view class="page">
    <view class="header">
      <text class="logo">💰</text>
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
      await userStore.register(form.username.trim(), form.password);
    } else {
      await userStore.login(form.username.trim(), form.password);
    }
    uni.reLaunch({ url: '/pages/home/index' });
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
  min-height: 100vh;
  background: linear-gradient(180deg, $brand-50 0%, $bg-page 40%);
  padding: 0 32px;
}

.header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 120px;
  padding-bottom: 60px;
}

.logo {
  font-size: $icon-4xl;
}

.title {
  font-size: $font-display;
  line-height: $lh-display;
  font-weight: $weight-semibold;
  color: $text-primary;
  margin-top: 12px;
}

.subtitle {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-secondary;
  margin-top: 8px;
}

.form {
  background: $bg-card;
  border-radius: 16px;
  padding: 24px 20px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
}

.field {
  margin-bottom: 16px;
}

.submit {
  margin-top: 12px;
  background: $brand-600;
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
  color: $text-secondary;
}
</style>
