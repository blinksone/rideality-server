import { Navigate, Outlet } from 'react-router-dom';
import type { PermissionKey } from '@/api/types';
import { usePermissions } from '@/hooks/usePermissions';

interface PermissionGuardProps {
  permission: PermissionKey | PermissionKey[];
  requireAll?: boolean;
}

export default function PermissionGuard({ permission }: PermissionGuardProps) {
  const { can } = usePermissions();
  const required = Array.isArray(permission) ? permission : [permission];

  if (!can(required.length === 1 ? required[0] : required)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <Outlet />;
}
