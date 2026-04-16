import { computed, ref } from 'vue';
import {
  AUTH_KEYS,
  clearStoredProfile,
  getStoredProfile,
  setStoredProfile,
  type AuthProfile,
} from '@/auth/storage';
import * as authApi from '@/api/auth';
import type { LoginResult } from '@/api/auth';

const accessToken = ref(localStorage.getItem(AUTH_KEYS.access) ?? '');
const refreshToken = ref(localStorage.getItem(AUTH_KEYS.refresh) ?? '');
const authProfile = ref<AuthProfile | null>(getStoredProfile());

function persistTokens(nextAccess: string, nextRefresh: string) {
  accessToken.value = nextAccess;
  refreshToken.value = nextRefresh;
  localStorage.setItem(AUTH_KEYS.access, nextAccess);
  localStorage.setItem(AUTH_KEYS.refresh, nextRefresh);
}

if (typeof window !== 'undefined') {
  window.addEventListener(
    'admin-tokens-updated',
    ((e: Event) => {
      const d = (e as CustomEvent<{ accessToken: string; refreshToken: string }>)
        .detail;
      persistTokens(d.accessToken, d.refreshToken);
    }) as EventListener,
  );
}

export function useAuth() {
  const isLoggedIn = computed(() => Boolean(accessToken.value));

  const user = computed(() => authProfile.value?.user ?? null);

  function can(permissionCode: string): boolean {
    const p = authProfile.value;
    if (!p) {
      return false;
    }
    if (p.isSuperAdmin) {
      return true;
    }
    return p.permissionCodes.includes(permissionCode);
  }

  function applyProfile(profile: AuthProfile) {
    authProfile.value = profile;
    setStoredProfile(profile);
  }

  function applyLogin(data: LoginResult) {
    const { accessToken: a, refreshToken: r, ...profile } = data;
    applyProfile(profile);
    persistTokens(a, r);
  }

  function applyRefreshedTokens(next: {
    accessToken: string;
    refreshToken: string;
  }) {
    persistTokens(next.accessToken, next.refreshToken);
  }

  async function refreshProfile() {
    const token = accessToken.value;
    if (!token) {
      return;
    }
    const profile = await authApi.getMe(token);
    applyProfile(profile);
  }

  function clearSession() {
    accessToken.value = '';
    refreshToken.value = '';
    authProfile.value = null;
    localStorage.removeItem(AUTH_KEYS.access);
    localStorage.removeItem(AUTH_KEYS.refresh);
    clearStoredProfile();
  }

  async function logout() {
    const token = accessToken.value;
    try {
      if (token) {
        await authApi.logout(token);
      }
    } finally {
      clearSession();
    }
  }

  return {
    user,
    authProfile,
    accessToken,
    refreshToken,
    isLoggedIn,
    can,
    applyLogin,
    applyProfile,
    applyRefreshedTokens,
    refreshProfile,
    clearSession,
    logout,
  };
}
