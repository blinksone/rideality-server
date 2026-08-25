import { Box, Button, Grid, List, ListItem, ListItemText, Paper, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { getFleetDashboard, getFleetMapData } from '@/api/fleet.api';
import { fleetPath } from '@/fleet-portal/fleetNavConfig';
import FleetLiveMap from '@/fleet-portal/components/FleetLiveMap';
import FleetMetricCard from '@/fleet-portal/components/FleetMetricCard';
import FleetPageHero from '@/fleet-portal/components/FleetPageHero';
import { useActiveFleetMembership, useFleetAccessTier } from '@/hooks/useFleetPortalMode';
import { formatDate, formatLabel } from '@/utils/format';
import AddIcon from '@mui/icons-material/Add';
import PaidIcon from '@mui/icons-material/Paid';
import PeopleIcon from '@mui/icons-material/People';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import RouteIcon from '@mui/icons-material/Route';
import MailOutlineOutlinedIcon from '@mui/icons-material/MailOutlineOutlined';
import PendingActionsIcon from '@mui/icons-material/PendingActions';

export default function FleetDashboardPage() {
  const { companyId = '' } = useParams();
  const membership = useActiveFleetMembership(companyId);
  const tier = useFleetAccessTier(companyId);
  const isOwner = tier === 'owner';
  const isFinance = tier === 'finance';
  const canAccessCompany = Boolean(membership);
  const { data, isLoading } = useQuery({
    queryKey: ['fleet-dashboard', companyId],
    queryFn: () => getFleetDashboard(companyId),
    enabled: canAccessCompany,
  });

  const { data: mapData } = useQuery({
    queryKey: ['fleet-map', companyId],
    queryFn: () => getFleetMapData(companyId),
    enabled: canAccessCompany && !isOwner,
    refetchInterval: isOwner ? false : 30000,
  });

  const fmt = (n: number) =>
    `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${data?.currency ?? ''}`.trim();

  return (
    <Box>
      <FleetPageHero
        badge="Rideality Fleet Console"
        title="Fleet performance monitor"
        description={
          isOwner
            ? 'Country-level revenue, wallet, and city coverage. Driver operations stay with regional fleet.'
            : 'Real-time driver operations, revenue tracking, and wallet management for your fleet company.'
        }
        actions={
          isOwner ? (
            <Button component={RouterLink} to={fleetPath(companyId, 'payouts')} variant="outlined" startIcon={<PaidIcon />} sx={{ borderColor: 'rgba(255,255,255,0.2)', color: '#fff' }}>
              Request payout
            </Button>
          ) : isFinance ? (
            <>
              <Button component={RouterLink} to={fleetPath(companyId, 'drivers')} variant="contained" startIcon={<PeopleIcon />}>
                Credit a driver
              </Button>
              <Button component={RouterLink} to={fleetPath(companyId, 'driver-credits')} variant="outlined" startIcon={<PaidIcon />} sx={{ borderColor: 'rgba(255,255,255,0.2)', color: '#fff' }}>
                Credit requests
              </Button>
            </>
          ) : (
          <>
            <Button component={RouterLink} to={fleetPath(companyId, 'invitations')} variant="contained" startIcon={<AddIcon />}>
              Invite driver
            </Button>
            <Button component={RouterLink} to={fleetPath(companyId, 'vehicles')} variant="contained" color="success" startIcon={<DirectionsCarIcon />}>
              Manage vehicles
            </Button>
            <Button component={RouterLink} to={fleetPath(companyId, 'payouts')} variant="outlined" startIcon={<PaidIcon />} sx={{ borderColor: 'rgba(255,255,255,0.2)', color: '#fff' }}>
              Request payout
            </Button>
          </>
          )
        }
      />

      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <FleetMetricCard
            label="Wallet balance"
            value={isLoading ? '…' : fmt(data?.walletBalance ?? 0)}
            icon={<AccountBalanceWalletIcon fontSize="small" />}
            accent="blue"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <FleetMetricCard
            label="Today's revenue"
            value={isLoading ? '…' : fmt(data?.todayRevenue ?? 0)}
            icon={<TrendingUpIcon fontSize="small" />}
            accent="emerald"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <FleetMetricCard
            label="Available balance"
            value={isLoading ? '…' : fmt(data?.availableBalance ?? 0)}
            icon={<PaidIcon fontSize="small" />}
            accent="teal"
          />
        </Grid>
        {!isOwner && (
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <FleetMetricCard
            label="Active drivers"
            value={isLoading ? '…' : (data?.activeDrivers ?? 0)}
            subtitle={`${data?.onlineDrivers ?? 0} online`}
            icon={<PeopleIcon fontSize="small" />}
            accent="indigo"
          />
        </Grid>
        )}
        {!isOwner && (
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <FleetMetricCard
            label="Active vehicles"
            value={isLoading ? '…' : (data?.activeVehicles ?? 0)}
            subtitle={`${data?.assignedVehicles ?? 0} assigned · ${data?.totalVehicles ?? 0} total`}
            icon={<DirectionsCarIcon fontSize="small" />}
            accent="blue"
          />
        </Grid>
        )}
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <FleetMetricCard
            label="Trips today"
            value={isLoading ? '…' : (data?.tripsToday ?? 0)}
            icon={<RouteIcon fontSize="small" />}
            accent="indigo"
          />
        </Grid>
        {!isOwner && (
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <FleetMetricCard
            label="Pending approvals"
            value={isLoading ? '…' : (data?.pendingApprovals ?? 0)}
            icon={<PendingActionsIcon fontSize="small" />}
            accent="amber"
          />
        </Grid>
        )}
        {!isOwner && (
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <FleetMetricCard
            label="Pending invitations"
            value={isLoading ? '…' : (data?.pendingInvites ?? 0)}
            icon={<MailOutlineOutlinedIcon fontSize="small" />}
            accent="rose"
          />
        </Grid>
        )}
      </Grid>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, fontFamily: '"Space Grotesk", sans-serif', mb: 0.5 }}>
              7-day revenue
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Completed trip earnings aggregated daily
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 180 }}>
              {(data?.revenueChart ?? []).map((bar) => {
                const max = Math.max(...(data?.revenueChart.map((b) => b.revenue) ?? [1]), 1);
                const h = Math.max(8, (bar.revenue / max) * 150);
                return (
                  <Box key={bar.date} sx={{ flex: 1, textAlign: 'center' }}>
                    <Box
                      sx={{
                        height: h,
                        borderRadius: 2,
                        mb: 0.5,
                        background: 'linear-gradient(180deg, #2563EB 0%, #4F46E5 100%)',
                        opacity: 0.9,
                      }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: 10 }}>
                      {bar.date.slice(5)}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Paper>
        </Grid>
        {!isOwner && (
        <Grid size={{ xs: 12, lg: 5 }}>
          <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, fontFamily: '"Space Grotesk", sans-serif', mb: 0.5 }}>
              Live dispatch map
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Online drivers and active trips
            </Typography>
            <FleetLiveMap
              drivers={mapData?.drivers ?? data?.onlineDriverLocations ?? []}
              activeTrips={mapData?.activeTrips ?? []}
              height={180}
            />
          </Paper>
        </Grid>
        )}
        <Grid size={{ xs: 12 }}>
          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, fontFamily: '"Space Grotesk", sans-serif', mb: 2 }}>
              Recent activity
            </Typography>
            <List dense disablePadding>
              {(data?.recentActivities ?? []).map((a) => (
                <ListItem key={a.id} divider sx={{ px: 0 }}>
                  <ListItemText
                    primary={`${formatLabel(a.type)} · ${a.amount} ${a.currency}`}
                    secondary={a.description ?? formatDate(a.createdAt)}
                    slotProps={{ primary: { sx: { fontWeight: 500, fontSize: 13 } } }}
                  />
                </ListItem>
              ))}
              {!isLoading && (data?.recentActivities.length ?? 0) === 0 && (
                <Typography color="text.secondary" sx={{ py: 2 }}>
                  No wallet activity yet.
                </Typography>
              )}
            </List>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
