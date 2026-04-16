<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  DashboardOutlined,
  LogoutOutlined,
  SafetyOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons-vue';
import { API_BASE } from '@/config';
import { useAuth } from '@/composables/useAuth';

const collapsed = ref(false);
const router = useRouter();
const route = useRoute();
const { user, logout, can } = useAuth();

const selectedKeys = computed(() => [route.path]);

const pageTitle = computed(
  () => (route.meta.title as string) ?? '管理后台',
);

async function onLogout() {
  await logout();
  router.replace({ name: 'login' });
}

function openSwagger() {
  window.open(`${API_BASE}/api`, '_blank', 'noopener,noreferrer');
}
</script>

<template>
  <a-layout class="admin-root">
    <a-layout-sider v-model:collapsed="collapsed" collapsible theme="dark">
      <div class="logo">Admin</div>
      <a-menu
        theme="dark"
        mode="inline"
        :selected-keys="selectedKeys"
      >
        <a-menu-item
          key="/admin/dashboard"
          @click="router.push({ name: 'admin-dashboard' })"
        >
          <template #icon>
            <DashboardOutlined />
          </template>
          工作台
        </a-menu-item>

        <a-sub-menu key="system">
          <template #title>
            <span>
              <SettingOutlined />
              <span>系统</span>
            </span>
          </template>
          <a-menu-item
            key="/admin/system"
            @click="router.push({ name: 'admin-system' })"
          >
            服务状态
          </a-menu-item>
          <a-menu-item
            v-if="can('system:user:list')"
            key="/admin/users"
            @click="router.push({ name: 'admin-users' })"
          >
            <template #icon>
              <UserOutlined />
            </template>
            用户管理
          </a-menu-item>
          <a-menu-item
            v-if="can('system:role:list')"
            key="/admin/roles"
            @click="router.push({ name: 'admin-roles' })"
          >
            <template #icon>
              <TeamOutlined />
            </template>
            角色管理
          </a-menu-item>
          <a-menu-item key="swagger" @click="openSwagger">
            API 文档（Swagger）
          </a-menu-item>
        </a-sub-menu>

        <a-menu-item
          key="/admin/security"
          @click="router.push({ name: 'admin-security' })"
        >
          <template #icon>
            <SafetyOutlined />
          </template>
          账号安全
        </a-menu-item>
      </a-menu>
    </a-layout-sider>

    <a-layout>
      <a-layout-header class="header">
        <div class="header-title">{{ pageTitle }}</div>
        <a-dropdown>
          <a class="user-trigger" @click.prevent>
            <span class="username">{{ user?.username ?? '用户' }}</span>
          </a>
          <template #overlay>
            <a-menu>
              <a-menu-item key="logout" @click="onLogout">
                <template #icon>
                  <LogoutOutlined />
                </template>
                退出登录
              </a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </a-layout-header>

      <a-layout-content class="content">
        <router-view />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<style scoped>
.admin-root {
  min-height: 100vh;
}

.logo {
  height: 48px;
  margin: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 600;
  font-size: 18px;
  letter-spacing: 0.5px;
}

.header {
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  border-bottom: 1px solid #f0f0f0;
}

.header-title {
  font-size: 16px;
  font-weight: 500;
}

.user-trigger {
  color: rgba(0, 0, 0, 0.85);
}

.username {
  cursor: pointer;
}

.content {
  margin: 24px;
  padding: 24px;
  background: #fff;
  min-height: calc(100vh - 112px);
  border-radius: 8px;
}
</style>
