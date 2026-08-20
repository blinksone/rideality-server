import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import FleetPortalLayout from '@/fleet-portal/FleetPortalLayout';
import FleetPortalHome from '@/fleet-portal/pages/FleetPortalHome';
import FleetDashboardPage from '@/fleet-portal/pages/FleetDashboardPage';
import FleetDriversPage from '@/fleet-portal/pages/FleetDriversPage';
import FleetInvitationsPage from '@/fleet-portal/pages/FleetInvitationsPage';
import FleetWalletPage from '@/fleet-portal/pages/FleetWalletPage';
import FleetTransactionsPage from '@/fleet-portal/pages/FleetTransactionsPage';
import FleetPayoutsPage from '@/fleet-portal/pages/FleetPayoutsPage';
import FleetTeamPage from '@/fleet-portal/pages/FleetTeamPage';
import FleetCompanyPage, { FleetSettingsPage } from '@/fleet-portal/pages/FleetCompanyPage';
import FleetVehiclesPage from '@/fleet-portal/pages/FleetVehiclesPage';
import FleetTripsPage from '@/fleet-portal/pages/FleetTripsPage';
import FleetEarningsPage from '@/fleet-portal/pages/FleetEarningsPage';
import FleetReportsPage from '@/fleet-portal/pages/FleetReportsPage';
import FleetNotificationsPage from '@/fleet-portal/pages/FleetNotificationsPage';
import FleetDocumentsPage from '@/fleet-portal/pages/FleetDocumentsPage';
import FleetRegionsPage from '@/fleet-portal/pages/FleetRegionsPage';
import FleetCityProfilePage from '@/fleet-portal/pages/FleetCityProfilePage';
import CompanyCreatePage from '@/modules/fleet/CompanyCreatePage';
import { useFleetAccessTier } from '@/hooks/useFleetPortalMode';
import { fleetLandingSegment, fleetPath } from '@/fleet-portal/fleetNavConfig';
import type { FleetAccessTier } from '@/api/types';

function TierGuard({
  allow,
  children,
}: {
  allow: FleetAccessTier[];
  children: React.ReactNode;
}) {
  const { companyId = '' } = useParams();
  const tier = useFleetAccessTier(companyId);
  if (tier && !allow.includes(tier)) {
    return <Navigate to={fleetPath(companyId, fleetLandingSegment(tier))} replace />;
  }
  return <>{children}</>;
}

export default function FleetPortalRoutes() {
  return (
    <Routes>
      <Route path="/portal" element={<FleetPortalLayout />}>
        <Route index element={<FleetPortalHome />} />
        <Route path=":companyId/dashboard" element={<FleetDashboardPage />} />
        <Route
          path=":companyId/companies"
          element={
            <TierGuard allow={['owner']}>
              <FleetCompanyPage />
            </TierGuard>
          }
        />
        <Route
          path=":companyId/drivers"
          element={
            <TierGuard allow={['regional', 'support']}>
              <FleetDriversPage />
            </TierGuard>
          }
        />
        <Route
          path=":companyId/regions"
          element={
            <TierGuard allow={['owner']}>
              <FleetRegionsPage />
            </TierGuard>
          }
        />
        <Route
          path=":companyId/regions/:regionId"
          element={
            <TierGuard allow={['owner', 'regional', 'support']}>
              <FleetCityProfilePage />
            </TierGuard>
          }
        />
        <Route
          path=":companyId/vehicles"
          element={
            <TierGuard allow={['regional']}>
              <FleetVehiclesPage />
            </TierGuard>
          }
        />
        <Route
          path=":companyId/invitations"
          element={
            <TierGuard allow={['regional']}>
              <FleetInvitationsPage />
            </TierGuard>
          }
        />
        <Route
          path=":companyId/trips"
          element={
            <TierGuard allow={['regional', 'support']}>
              <FleetTripsPage />
            </TierGuard>
          }
        />
        <Route
          path=":companyId/wallet"
          element={
            <TierGuard allow={['owner']}>
              <FleetWalletPage />
            </TierGuard>
          }
        />
        <Route
          path=":companyId/transactions"
          element={
            <TierGuard allow={['owner']}>
              <FleetTransactionsPage />
            </TierGuard>
          }
        />
        <Route
          path=":companyId/earnings"
          element={
            <TierGuard allow={['owner']}>
              <FleetEarningsPage />
            </TierGuard>
          }
        />
        <Route
          path=":companyId/payouts"
          element={
            <TierGuard allow={['owner']}>
              <FleetPayoutsPage />
            </TierGuard>
          }
        />
        <Route
          path=":companyId/reports"
          element={
            <TierGuard allow={['owner']}>
              <FleetReportsPage />
            </TierGuard>
          }
        />
        <Route path=":companyId/notifications" element={<FleetNotificationsPage />} />
        <Route
          path=":companyId/team"
          element={
            <TierGuard allow={['owner', 'regional']}>
              <FleetTeamPage />
            </TierGuard>
          }
        />
        <Route
          path=":companyId/documents"
          element={
            <TierGuard allow={['regional']}>
              <FleetDocumentsPage />
            </TierGuard>
          }
        />
        <Route path=":companyId/settings" element={<FleetSettingsPage />} />
        <Route path="create" element={<CompanyCreatePage />} />
      </Route>
      <Route path="/" element={<Navigate to="/portal" replace />} />
      <Route path="*" element={<Navigate to="/portal" replace />} />
    </Routes>
  );
}
