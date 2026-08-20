import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export default function PasswordResetGuard() {
  const { user } = useAuth();

  if (user?.mustResetPassword) {
    return <Navigate to="/reset-password" replace />;
  }

  return <Outlet />;
}
