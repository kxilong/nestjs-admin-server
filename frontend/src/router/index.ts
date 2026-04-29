import { createRouter, createWebHistory } from 'vue-router';
import { AUTH_KEYS } from '@/auth/storage';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { public: true },
    },
    {
      path: '/admin',
      component: () => import('@/layouts/AdminLayout.vue'),
      children: [
        {
          path: '',
          redirect: { name: 'admin-dashboard' },
        },
        {
          path: 'dashboard',
          name: 'admin-dashboard',
          component: () => import('@/views/DashboardView.vue'),
          meta: { title: '工作台' },
        },
        {
          path: 'system',
          name: 'admin-system',
          component: () => import('@/views/SystemInfoView.vue'),
          meta: { title: '服务状态' },
        },
        {
          path: 'users',
          name: 'admin-users',
          component: () => import('@/views/UserManageView.vue'),
          meta: { title: '用户管理' },
        },
        {
          path: 'roles',
          name: 'admin-roles',
          component: () => import('@/views/RoleManageView.vue'),
          meta: { title: '角色管理' },
        },
        {
          path: 'security',
          name: 'admin-security',
          component: () => import('@/views/SecurityView.vue'),
          meta: { title: '账号安全' },
        },
        {
          path: 'ai-chat',
          name: 'admin-ai-chat',
          component: () => import('@/views/AiChatView.vue'),
          meta: { title: 'AI 对话' },
        },
        {
          path: 'rag',
          name: 'admin-rag',
          component: () => import('@/views/RagTestView.vue'),
          meta: { title: '知识库' },
        },
      ],
    },
    {
      path: '/',
      redirect: () =>
        localStorage.getItem(AUTH_KEYS.access) ? '/admin/dashboard' : '/login',
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
});

router.beforeEach((to) => {
  const token = localStorage.getItem(AUTH_KEYS.access);

  if (to.meta.public) {
    if (token && (to.name === 'login' || to.name === 'register')) {
      return { name: 'admin-dashboard' };
    }
    return true;
  }

  if (to.path.startsWith('/admin') && !token) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }

  return true;
});

export default router;
