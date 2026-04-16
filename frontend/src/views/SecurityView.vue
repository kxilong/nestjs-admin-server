<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import * as authApi from '@/api/auth';
import { useAuth } from '@/composables/useAuth';
import { useRouter } from 'vue-router';

const loading = ref(false);
const router = useRouter();
const { accessToken, refreshToken, applyRefreshedTokens, clearSession } =
  useAuth();

const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
});

const refreshForm = reactive({
  refreshToken: refreshToken.value,
});

watch(refreshToken, (v) => {
  refreshForm.refreshToken = v;
});

async function onChangePassword() {
  loading.value = true;
  try {
    const data = await authApi.changePassword(
      passwordForm,
      accessToken.value,
    );
    message.success(data.message);
    clearSession();
    router.replace({ name: 'login' });
  } catch (e) {
    message.error((e as Error).message);
  } finally {
    loading.value = false;
  }
}

async function onRefresh() {
  loading.value = true;
  try {
    const data = await authApi.refreshToken({
      refreshToken: refreshForm.refreshToken,
    });
    applyRefreshedTokens(data);
    message.success('Token 已刷新');
  } catch (e) {
    message.error((e as Error).message);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div>
    <a-typography-title :level="4">账号安全</a-typography-title>
    <a-typography-paragraph type="secondary">
      修改密码成功后将清除本地登录状态并跳转登录页；刷新 Token 用于在 Access Token
      过期前续期。
    </a-typography-paragraph>

    <a-row :gutter="[24, 24]">
      <a-col :xs="24" :lg="12">
        <a-card title="修改密码" size="small">
          <a-form layout="vertical">
            <a-form-item label="旧密码">
              <a-input-password
                v-model:value="passwordForm.oldPassword"
                placeholder="旧密码"
              />
            </a-form-item>
            <a-form-item label="新密码">
              <a-input-password
                v-model:value="passwordForm.newPassword"
                placeholder="新密码"
              />
            </a-form-item>
            <a-button
              type="primary"
              danger
              :loading="loading"
              @click="onChangePassword"
            >
              修改密码
            </a-button>
          </a-form>
        </a-card>
      </a-col>

      <a-col :xs="24" :lg="12">
        <a-card title="刷新 Token" size="small">
          <a-form layout="vertical">
            <a-form-item label="Refresh Token">
              <a-textarea
                v-model:value="refreshForm.refreshToken"
                :rows="4"
                placeholder="登录后自动保存，可在此手动粘贴"
              />
            </a-form-item>
            <a-button type="primary" :loading="loading" @click="onRefresh">
              刷新
            </a-button>
          </a-form>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>
