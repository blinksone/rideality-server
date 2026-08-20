import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { PLATFORM_ROLES } from '@/utils/permissions';
import LoadingOverlay from '@/components/LoadingOverlay';

export default function ProtectedRoute() {
  const { isAuthenticated, user, initialized } = useAuth();
  const location = useLocation();

  if (!initialized) {
    return <LoadingOverlay open />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const hasPortalRole = user?.platformRoles?.some((r) => PLATFORM_ROLES.includes(r));
  const hasFleetMembership = (user?.fleetMemberships?.length ?? 0) > 0;
  if (user && !hasPortalRole && !hasFleetMembership) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
