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
import { fleetPath } from '@/fleet-portal/fleetNavConfig';

function OwnerBlocked({ children }: { children: React.ReactNode }) {
  const { companyId = '' } = useParams();
  const tier = useFleetAccessTier(companyId);
  if (tier === 'owner') {
    return <Navigate to={fleetPath(companyId, 'regions')} replace />;
  }
  return <>{children}</>;
}

function OwnerOnly({ children }: { children: React.ReactNode }) {
  const { companyId = '' } = useParams();
  const tier = useFleetAccessTier(companyId);
  if (tier && tier !== 'owner') {
    return <Navigate to={fleetPath(companyId, 'drivers')} replace />;
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
            <OwnerOnly>
              <FleetCompanyPage />
            </OwnerOnly>
          }
        />
        <Route
          path=":companyId/drivers"
          element={
            <OwnerBlocked>
              <FleetDriversPage />
            </OwnerBlocked>
          }
        />
        <Route path=":companyId/regions" element={<FleetRegionsPage />} />
        <Route path=":companyId/regions/:regionId" element={<FleetCityProfilePage />} />
        <Route
          path=":companyId/vehicles"
          element={
            <OwnerBlocked>
              <FleetVehiclesPage />
            </OwnerBlocked>
          }
        />
        <Route
          path=":companyId/invitations"
          element={
            <OwnerBlocked>
              <FleetInvitationsPage />
            </OwnerBlocked>
          }
        />
        <Route
          path=":companyId/trips"
          element={
            <OwnerBlocked>
              <FleetTripsPage />
            </OwnerBlocked>
          }
        />
        <Route
          path=":companyId/wallet"
          element={
            <OwnerOnly>
              <FleetWalletPage />
            </OwnerOnly>
          }
        />
        <Route
          path=":companyId/transactions"
          element={
            <OwnerOnly>
              <FleetTransactionsPage />
            </OwnerOnly>
          }
        />
        <Route
          path=":companyId/earnings"
          element={
            <OwnerOnly>
              <FleetEarningsPage />
            </OwnerOnly>
          }
        />
        <Route
          path=":companyId/payouts"
          element={
            <OwnerOnly>
              <FleetPayoutsPage />
            </OwnerOnly>
          }
        />
        <Route
          path=":companyId/reports"
          element={
            <OwnerOnly>
              <FleetReportsPage />
            </OwnerOnly>
          }
        />
        <Route path=":companyId/notifications" element={<FleetNotificationsPage />} />
        <Route
          path=":companyId/team"
          element={
            <OwnerOnly>
              <FleetTeamPage />
            </OwnerOnly>
          }
        />
        <Route
          path=":companyId/documents"
          element={
            <OwnerBlocked>
              <FleetDocumentsPage />
            </OwnerBlocked>
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
