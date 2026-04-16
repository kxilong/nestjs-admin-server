export const AUTH_KEYS = {
  access: 'admin_access_token',
  refresh: 'admin_refresh_token',
  profile: 'admin_auth_profile',
  /** 旧版仅存 user，登录后会迁移 */
  legacyUser: 'admin_user',
} as const;

export interface AuthProfile {
  user: {
    id: number;
    username: string;
    createdAt?: string;
  };
  roles: { id: number; code: string; name: string }[];
  permissionCodes: string[];
  isSuperAdmin: boolean;
}

export function getStoredProfile(): AuthProfile | null {
  const raw = localStorage.getItem(AUTH_KEYS.profile);
  if (raw) {
    try {
      return JSON.parse(raw) as AuthProfile;
    } catch {
      return null;
    }
  }
  const legacy = localStorage.getItem(AUTH_KEYS.legacyUser);
  if (legacy) {
    try {
      const user = JSON.parse(legacy) as AuthProfile['user'];
      localStorage.removeItem(AUTH_KEYS.legacyUser);
      const migrated: AuthProfile = {
        user,
        roles: [],
        permissionCodes: [],
        isSuperAdmin: false,
      };
      setStoredProfile(migrated);
      return migrated;
    } catch {
      return null;
    }
  }
  return null;
}

export function setStoredProfile(profile: AuthProfile) {
  localStorage.setItem(AUTH_KEYS.profile, JSON.stringify(profile));
}

export function clearStoredProfile() {
  localStorage.removeItem(AUTH_KEYS.profile);
  localStorage.removeItem(AUTH_KEYS.legacyUser);
}
