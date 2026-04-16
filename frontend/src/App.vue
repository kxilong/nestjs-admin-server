<script setup lang="ts">
import { onMounted } from 'vue';
import zhCN from 'ant-design-vue/es/locale/zh_CN';
import { useAuth } from '@/composables/useAuth';

const { accessToken, refreshProfile } = useAuth();

onMounted(() => {
  if (accessToken.value) {
    void refreshProfile().catch(() => {
      /* 令牌失效时由各页或路由处理 */
    });
  }
});
</script>

<template>
  <a-config-provider :locale="zhCN">
    <router-view />
  </a-config-provider>
</template>
