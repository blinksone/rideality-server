import { Navigate, Outlet } from 'react-router-dom';
import type { PermissionKey } from '@/api/types';
import { usePermissions } from '@/hooks/usePermissions';

interface PermissionGuardProps {
  permission: PermissionKey | PermissionKey[];
  anyPermission?: boolean;
}

export default function PermissionGuard({ permission, anyPermission = false }: PermissionGuardProps) {
  const { can } = usePermissions();
  const required = Array.isArray(permission) ? permission : [permission];
  const allowed = anyPermission
    ? required.some((key) => can(key))
    : can(required.length === 1 ? required[0] : required);

  if (!allowed) {
    return <Navigate to="/forbidden" replace />;
  }

  return <Outlet />;
}
