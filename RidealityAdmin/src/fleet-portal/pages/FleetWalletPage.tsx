import { useParams } from 'react-router-dom';
import FleetWalletPanel from '@/modules/finance/FleetWalletPanel';
import { useQuery } from '@tanstack/react-query';
import { downloadFleetExport, getFleetDashboard } from '@/api/fleet.api';
import { Box, Button, Grid } from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PaidIcon from '@mui/icons-material/Paid';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import FleetContentCard from '@/fleet-portal/components/FleetContentCard';
import FleetMetricCard from '@/fleet-portal/components/FleetMetricCard';
import FleetPageHero from '@/fleet-portal/components/FleetPageHero';

export default function FleetWalletPage() {
  const { companyId = '' } = useParams();
  const { data, isLoading } = useQuery({
    queryKey: ['fleet-dashboard', companyId],
    queryFn: () => getFleetDashboard(companyId),
    enabled: Boolean(companyId),
  });

  const fmt = (n: number) =>
    `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${data?.currency ?? ''}`.trim();

  return (
    <Box>
      <FleetPageHero
        badge="Fleet finance"
        title="Wallet & earnings"
        description="Monitor available balance, pending earnings, and request payouts for your fleet company."
        actions={
          <Button
            variant="outlined"
            startIcon={<FileDownloadIcon />}
            onClick={() => downloadFleetExport(companyId, 'wallet-statement')}
            sx={{ borderColor: 'rgba(255,255,255,0.2)', color: '#fff' }}
          >
            Download statement
          </Button>
        }
      />
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {[
          { label: 'Available balance', value: isLoading ? '…' : fmt(data?.availableBalance ?? 0), icon: <AccountBalanceWalletIcon fontSize="small" />, accent: 'blue' as const },
          { label: 'Pending earnings', value: isLoading ? '…' : fmt(data?.pendingEarnings ?? 0), icon: <PaidIcon fontSize="small" />, accent: 'amber' as const },
          { label: 'Lifetime earnings', value: isLoading ? '…' : fmt(data?.lifetimeEarnings ?? 0), icon: <TrendingUpIcon fontSize="small" />, accent: 'emerald' as const },
        ].map((card) => (
          <Grid key={card.label} size={{ xs: 12, md: 4 }}>
            <FleetMetricCard label={card.label} value={card.value} icon={card.icon} accent={card.accent} />
          </Grid>
        ))}
      </Grid>
      <FleetContentCard title="Transaction history" subtitle="Recent wallet movements and payout requests">
        <FleetWalletPanel fleetId={companyId} />
      </FleetContentCard>
    </Box>
  );
}
