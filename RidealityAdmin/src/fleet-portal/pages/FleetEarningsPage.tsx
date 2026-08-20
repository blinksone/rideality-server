import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Box } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import RouteIcon from '@mui/icons-material/Route';
import StraightenIcon from '@mui/icons-material/Straighten';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import { getFleetEarnings } from '@/api/fleet.api';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import FleetContentCard from '@/fleet-portal/components/FleetContentCard';
import FleetFilters, { type FleetFilterValues } from '@/fleet-portal/components/FleetFilters';
import FleetMetricCard from '@/fleet-portal/components/FleetMetricCard';
import FleetMetricRow, { FleetMetricCell } from '@/fleet-portal/components/FleetMetricRow';
import FleetPageHero from '@/fleet-portal/components/FleetPageHero';

export default function FleetEarningsPage() {
  const { companyId = '' } = useParams();
  const [filters, setFilters] = useState<FleetFilterValues>({ search: '', status: '', from: '', to: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['fleet-earnings', companyId, filters.from, filters.to],
    queryFn: () =>
      getFleetEarnings(companyId, {
        from: filters.from || undefined,
        to: filters.to || undefined,
      }),
    enabled: Boolean(companyId),
  });

  const fmt = (n: number) =>
    `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${data?.currency ?? ''}`.trim();

  const driverColumns: DataTableColumn<NonNullable<typeof data>['byDriver'][number]>[] = [
    { id: 'driver', label: 'Driver', render: (r) => r.driverName },
    { id: 'trips', label: 'Trips', render: (r) => r.trips },
    { id: 'revenue', label: 'Revenue', render: (r) => fmt(r.revenue) },
  ];

  return (
    <Box>
      <FleetPageHero
        badge="Revenue analytics"
        title="Earnings breakdown"
        description="Analyze trip revenue, distance, and per-driver earnings for your fleet."
      />
      <FleetFilters values={filters} onChange={(next) => setFilters((f) => ({ ...f, ...next }))} />
      <FleetMetricRow>
        <FleetMetricCell>
          <FleetMetricCard
            label="Trip revenue"
            value={isLoading ? '…' : fmt(data?.totalTripRevenue ?? 0)}
            icon={<TrendingUpIcon fontSize="small" />}
            accent="emerald"
          />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard
            label="Completed trips"
            value={isLoading ? '…' : (data?.totalTrips ?? 0)}
            icon={<RouteIcon fontSize="small" />}
            accent="blue"
          />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard
            label="Distance"
            value={isLoading ? '…' : `${data?.totalDistanceKm ?? 0} km`}
            icon={<StraightenIcon fontSize="small" />}
            accent="indigo"
          />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard
            label="Wallet earnings"
            value={isLoading ? '…' : fmt(data?.walletEarnings ?? 0)}
            icon={<AccountBalanceWalletIcon fontSize="small" />}
            accent="teal"
          />
        </FleetMetricCell>
      </FleetMetricRow>
      <FleetContentCard title="Earnings by driver" subtitle="Revenue attributed to each fleet driver">
        <DataTable
          columns={driverColumns}
          rows={data?.byDriver ?? []}
          rowKey={(r) => r.driverUserId}
          page={0}
          rowsPerPage={Math.max(data?.byDriver.length ?? 10, 10)}
          total={data?.byDriver.length ?? 0}
          onPageChange={() => {}}
          onRowsPerPageChange={() => {}}
          loading={isLoading}
          paperSx={{ border: 0, boxShadow: 'none' }}
        />
      </FleetContentCard>
    </Box>
  );
}
