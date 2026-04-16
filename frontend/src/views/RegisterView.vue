<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import * as authApi from '@/api/auth';

const loading = ref(false);
const router = useRouter();

const form = reactive({
  username: '',
  password: '',
});

async function onSubmit() {
  loading.value = true;
  try {
    await authApi.register(form);
    message.success('注册成功，请登录');
    router.replace({ name: 'login' });
  } catch (e) {
    message.error((e as Error).message);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <a-card title="注册" class="auth-card">
      <a-form layout="vertical" :model="form" @finish="onSubmit">
        <a-form-item
          label="用户名"
          name="username"
          :rules="[{ required: true, message: '请输入用户名' }]"
        >
          <a-input v-model:value="form.username" placeholder="用户名" />
        </a-form-item>
        <a-form-item
          label="密码"
          name="password"
          :rules="[{ required: true, message: '请输入密码' }]"
        >
          <a-input-password v-model:value="form.password" placeholder="密码" />
        </a-form-item>
        <a-form-item>
          <a-button type="primary" html-type="submit" block :loading="loading">
            注册
          </a-button>
        </a-form-item>
      </a-form>
      <router-link :to="{ name: 'login' }">已有账号？去登录</router-link>
    </a-card>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: linear-gradient(160deg, #f0f5ff 0%, #f5f7fa 50%, #fff 100%);
}

.auth-card {
  width: 100%;
  max-width: 400px;
}
</style>
