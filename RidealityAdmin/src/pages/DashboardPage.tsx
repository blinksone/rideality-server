import { Grid } from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import DescriptionIcon from '@mui/icons-material/Description';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import MailIcon from '@mui/icons-material/Mail';
import { useQuery } from '@tanstack/react-query';
import { fetchDashboardStats } from '@/api/auth.api';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import LoadingOverlay from '@/components/LoadingOverlay';

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
  });

  const scope = data?.roleScope;

  return (
    <>
      <LoadingOverlay open={isLoading} />
      <PageHeader
        badge="Overview"
        title="Dashboard"
        subtitle="Overview of platform activity based on your role"
      />
      <Grid container spacing={2.5}>
        {(scope?.isAdmin || scope?.isSupport) && (
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <StatCard title="Total users" value={data?.totalUsers ?? 0} icon={<PeopleIcon />} />
          </Grid>
        )}
        {(scope?.isAdmin || scope?.isFleet) && (
          <>
            {scope?.isAdmin && (
              <>
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                  <StatCard title="Total drivers" value={data?.totalDrivers ?? 0} icon={<DirectionsCarIcon />} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                  <StatCard
                    title="Pending driver approvals"
                    value={data?.pendingDriverApprovals ?? 0}
                    icon={<PendingActionsIcon />}
                    color="warning.main"
                  />
                </Grid>
              </>
            )}
            {scope?.isAdmin && (
              <>
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                  <StatCard title="Total fleets" value={data?.totalFleets ?? 0} icon={<LocalShippingIcon />} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                  <StatCard
                    title="Active fleet drivers"
                    value={data?.activeFleetDrivers ?? 0}
                    icon={<DirectionsCarIcon />}
                  />
                </Grid>
              </>
            )}
          </>
        )}
        {scope?.isAdmin && (
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <StatCard
              title="Pending documents"
              value={data?.pendingDocuments ?? 0}
              icon={<DescriptionIcon />}
              color="warning.main"
            />
          </Grid>
        )}
        {scope?.isFleet && (
          <>
            {!scope?.isAdmin && (
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <StatCard
                  title="Pending driver approvals"
                  value={data?.pendingDriverApprovals ?? 0}
                  icon={<PendingActionsIcon />}
                  color="warning.main"
                />
              </Grid>
            )}
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <StatCard title="My fleets" value={data?.myFleets ?? 0} icon={<LocalShippingIcon />} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <StatCard title="My fleet drivers" value={data?.myFleetDrivers ?? 0} icon={<DirectionsCarIcon />} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <StatCard
                title="Pending invites"
                value={data?.pendingInvites ?? 0}
                icon={<MailIcon />}
                color="info.main"
              />
            </Grid>
          </>
        )}
      </Grid>
    </>
  );
}
