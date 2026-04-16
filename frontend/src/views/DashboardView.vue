<script setup lang="ts">
import { useAuth } from '@/composables/useAuth';

const { user } = useAuth();
</script>

<template>
  <div>
    <a-typography-title :level="4">工作台</a-typography-title>
    <a-typography-paragraph type="secondary">
      你好，{{ user?.username ?? '用户' }}。这是后台首页，可从左侧菜单进入各功能页。
    </a-typography-paragraph>
    <a-alert
      type="info"
      show-icon
      message="权限说明"
      description="登录后由后端根据用户角色返回权限码；受保护接口使用 JWT + 权限校验。超级管理员角色拥有全部接口权限。"
    />
  </div>
</template>
