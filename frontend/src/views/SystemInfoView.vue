<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import { fetchHello } from '@/api/system';
import { API_BASE } from '@/config';

const loading = ref(false);
const hello = ref<string | null>(null);

onMounted(async () => {
  loading.value = true;
  try {
    hello.value = await fetchHello();
  } catch (e) {
    message.error((e as Error).message);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div>
    <a-typography-title :level="4">服务状态</a-typography-title>
    <a-spin :spinning="loading">
      <a-descriptions bordered :column="1" size="small">
        <a-descriptions-item label="API 根地址">
          {{ API_BASE }}
        </a-descriptions-item>
        <a-descriptions-item label="GET / 响应">
          {{ hello ?? '—' }}
        </a-descriptions-item>
      </a-descriptions>
    </a-spin>
  </div>
</template>
