import { useMemo } from 'react';
import { useAppSelector } from '@/store/hooks';
import type { PermissionKey } from '@/api/types';
import { hasPermission } from '@/utils/permissions';

export function useAuth() {
  const auth = useAppSelector((s) => s.auth);
  return {
    ...auth,
    isAuthenticated: Boolean(auth.accessToken),
  };
}

export function usePermissions() {
  const { permissions, isSuperAdmin } = useAppSelector((s) => s.auth);

  return useMemo(
    () => ({
      permissions,
      isSuperAdmin,
      can: (required: PermissionKey | PermissionKey[]) =>
        hasPermission(permissions, required, isSuperAdmin),
    }),
    [permissions, isSuperAdmin],
  );
}
