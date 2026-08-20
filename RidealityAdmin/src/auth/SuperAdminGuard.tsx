import { Navigate, Outlet } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';

export default function SuperAdminGuard() {
  const { isSuperAdmin } = usePermissions();

  if (!isSuperAdmin) {
    return <Navigate to="/forbidden" replace />;
  }

  return <Outlet />;
}
