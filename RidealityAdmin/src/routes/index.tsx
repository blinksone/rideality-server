import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '@/auth/ProtectedRoute';
import PermissionGuard from '@/auth/PermissionGuard';
import AdminLayout from '@/layouts/AdminLayout';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import ForbiddenPage from '@/pages/ForbiddenPage';
import NotFoundPage from '@/pages/NotFoundPage';
import UsersListPage from '@/modules/users/UsersListPage';
import UserDetailPage from '@/modules/users/UserDetailPage';
import RolesListPage from '@/modules/roles/RolesListPage';
import PermissionsListPage from '@/modules/permissions/PermissionsListPage';
import CompaniesListPage from '@/modules/fleet/CompaniesListPage';
import CompanyCreatePage from '@/modules/fleet/CompanyCreatePage';
import CompanyDetailPage from '@/modules/fleet/CompanyDetailPage';
import SuperAdminGuard from '@/auth/SuperAdminGuard';
import RegionsListPage from '@/modules/regions/RegionsListPage';
import AuditLogPage from '@/modules/audit/AuditLogPage';
import SupportPage from '@/modules/support/SupportPage';
import FinanceDashboardPage from '@/modules/finance/FinanceDashboardPage';
import WalletsListPage from '@/modules/finance/WalletsListPage';
import AdjustmentsPage from '@/modules/finance/AdjustmentsPage';
import PayoutsPage from '@/modules/finance/PayoutsPage';
import WalletDetailPage from '@/modules/finance/WalletDetailPage';
import PasswordResetGuard from '@/auth/PasswordResetGuard';
import { useFleetPortalMode } from '@/hooks/useFleetPortalMode';
import FleetPortalRoutes from '@/fleet-portal/FleetPortalRoutes';
import ResetPasswordPage from '@/pages/ResetPasswordPage';
import TestPortalPage from '@/test-portal/TestPortalPage';
import { useAuth } from '@/hooks/useAuth';

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  if (isAuthenticated) {
    if (user?.mustResetPassword) return <Navigate to="/reset-password" replace />;
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function AppShell() {
  const fleetPortal = useFleetPortalMode();
  if (fleetPortal) return <FleetPortalRoutes />;
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<DashboardPage />} />
        <Route element={<PermissionGuard permission="manage_users" />}>
          <Route path="users" element={<UsersListPage />} />
          <Route path="users/:id" element={<UserDetailPage />} />
        </Route>
        <Route element={<PermissionGuard permission="manage_roles" />}>
          <Route path="roles" element={<RolesListPage />} />
          <Route path="permissions" element={<PermissionsListPage />} />
        </Route>
        <Route element={<PermissionGuard permission="manage_fleets" />}>
          <Route path="fleet" element={<CompaniesListPage />} />
          <Route path="fleet/create" element={<CompanyCreatePage />} />
          <Route path="fleet/:id" element={<CompanyDetailPage />} />
        </Route>
        <Route element={<PermissionGuard permission="view_finance" />}>
          <Route path="finance" element={<FinanceDashboardPage />} />
          <Route path="finance/wallets" element={<WalletsListPage />} />
          <Route path="finance/wallets/:id" element={<WalletDetailPage />} />
          <Route path="finance/adjustments" element={<AdjustmentsPage />} />
          <Route path="finance/payouts" element={<PayoutsPage />} />
        </Route>
        <Route element={<PermissionGuard permission="manage_users" />}>
          <Route path="support" element={<SupportPage />} />
        </Route>
        <Route element={<PermissionGuard permission="view_reports" />}>
          <Route path="audit-logs" element={<AuditLogPage />} />
        </Route>
        <Route element={<SuperAdminGuard />}>
          <Route path="regions" element={<RegionsListPage />} />
        </Route>
        <Route path="forbidden" element={<ForbiddenPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/test-app" element={<TestPortalPage />} />
      <Route
        path="/login"
        element={
          <PublicOnly>
            <LoginPage />
          </PublicOnly>
        }
      />
      <Route element={<ProtectedRoute />}>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route element={<PasswordResetGuard />}>
          <Route path="*" element={<AppShell />} />
        </Route>
      </Route>
    </Routes>
  );
}
