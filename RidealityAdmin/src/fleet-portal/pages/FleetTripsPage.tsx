import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Box, Chip, Drawer, Typography } from '@mui/material';
import RouteIcon from '@mui/icons-material/Route';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DirectionsCarFilledIcon from '@mui/icons-material/DirectionsCarFilled';
import { downloadFleetExport, getFleetDashboard, getFleetTrip, listFleetTrips } from '@/api/fleet.api';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import FleetContentCard from '@/fleet-portal/components/FleetContentCard';
import FleetFilters, { type FleetFilterValues } from '@/fleet-portal/components/FleetFilters';
import FleetMetricCard from '@/fleet-portal/components/FleetMetricCard';
import FleetMetricRow, { FleetMetricCell } from '@/fleet-portal/components/FleetMetricRow';
import FleetPageHero from '@/fleet-portal/components/FleetPageHero';
import { formatDate, formatLabel } from '@/utils/format';
import type { FleetTrip } from '@/api/fleet.api';

const TRIP_STATUS_COLOR: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  completed: 'success',
  in_progress: 'info',
  assigned: 'warning',
  requested: 'default',
  cancelled: 'error',
};

export default function FleetTripsPage() {
  const { companyId = '' } = useParams();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [filters, setFilters] = useState<FleetFilterValues>({ search: '', status: '', from: '', to: '' });
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);

  const params = useMemo(
    () => ({
      page: page + 1,
      limit: rowsPerPage,
      search: filters.search || undefined,
      status: filters.status || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    }),
    [page, rowsPerPage, filters],
  );

  const { data: dash } = useQuery({
    queryKey: ['fleet-dashboard', companyId],
    queryFn: () => getFleetDashboard(companyId),
    enabled: Boolean(companyId),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['fleet-trips', companyId, params],
    queryFn: () => listFleetTrips(companyId, params),
    enabled: Boolean(companyId),
  });

  const { data: tripDetail } = useQuery({
    queryKey: ['fleet-trip', companyId, selectedTripId],
    queryFn: () => getFleetTrip(companyId, selectedTripId!),
    enabled: Boolean(companyId && selectedTripId),
  });

  const columns: DataTableColumn<FleetTrip>[] = [
    { id: 'id', label: 'Trip', render: (t) => t.id.slice(0, 8) },
    {
      id: 'status',
      label: 'Status',
      render: (t) => (
        <Chip size="small" label={formatLabel(t.status)} color={TRIP_STATUS_COLOR[t.status] ?? 'default'} />
      ),
    },
    { id: 'driver', label: 'Driver', render: (t) => t.driverName ?? '—' },
    { id: 'passenger', label: 'Passenger', render: (t) => t.passengerName ?? '—' },
    { id: 'fare', label: 'Fare', render: (t) => `${t.fare} ${t.currency}` },
    { id: 'distance', label: 'Distance', render: (t) => `${t.distanceKm} km` },
    { id: 'date', label: 'Created', render: (t) => formatDate(t.createdAt) },
  ];

  const trips = data?.data ?? [];
  const completedOnPage = trips.filter((t) => t.status === 'completed').length;

  return (
    <Box>
      <FleetPageHero
        badge="Trip operations"
        title="Trip history"
        description="Monitor completed and active trips, filter by date and status, and export trip records."
      />
      <FleetMetricRow>
        <FleetMetricCell>
          <FleetMetricCard label="Total trips" value={data?.pagination.total ?? 0} icon={<RouteIcon fontSize="small" />} accent="blue" />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard label="Trips today" value={dash?.tripsToday ?? 0} icon={<DirectionsCarFilledIcon fontSize="small" />} accent="indigo" />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard label="Completed (page)" value={completedOnPage} icon={<CheckCircleIcon fontSize="small" />} accent="emerald" />
        </FleetMetricCell>
      </FleetMetricRow>
      <FleetFilters
        values={filters}
        onChange={(next) => {
          setFilters((f) => ({ ...f, ...next }));
          setPage(0);
        }}
        statusOptions={[
          { value: 'requested', label: 'Requested' },
          { value: 'assigned', label: 'Assigned' },
          { value: 'in_progress', label: 'In progress' },
          { value: 'completed', label: 'Completed' },
          { value: 'cancelled', label: 'Cancelled' },
        ]}
        onExport={() =>
          downloadFleetExport(companyId, 'trips', {
            from: filters.from,
            to: filters.to,
            status: filters.status,
          })
        }
      />
      <FleetContentCard title="Trip ledger" subtitle="Click a row to view trip details">
        <DataTable
          columns={columns}
          rows={trips}
          rowKey={(t) => t.id}
          page={page}
          rowsPerPage={rowsPerPage}
          total={data?.pagination.total ?? 0}
          onPageChange={setPage}
          onRowsPerPageChange={(n) => {
            setRowsPerPage(n);
            setPage(0);
          }}
          loading={isLoading}
          paperSx={{ border: 0, boxShadow: 'none' }}
          onRowClick={(t) => setSelectedTripId(t.id)}
        />
      </FleetContentCard>
      <Drawer anchor="right" open={Boolean(selectedTripId)} onClose={() => setSelectedTripId(null)}>
        <Box sx={{ width: 360, p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            Trip details
          </Typography>
          {tripDetail ? (
            <Box sx={{ display: 'grid', gap: 1.5 }}>
              <Typography variant="body2">
                <strong>Status:</strong> {formatLabel(tripDetail.status)}
              </Typography>
              <Typography variant="body2">
                <strong>Driver:</strong> {tripDetail.driverName}
              </Typography>
              <Typography variant="body2">
                <strong>Pickup:</strong> {tripDetail.pickupAddress}
              </Typography>
              <Typography variant="body2">
                <strong>Dropoff:</strong> {tripDetail.dropoffAddress}
              </Typography>
              <Typography variant="body2">
                <strong>Fare:</strong> {tripDetail.fare} {tripDetail.currency}
              </Typography>
              <Typography variant="body2">
                <strong>Completed:</strong>{' '}
                {tripDetail.completedAt ? formatDate(tripDetail.completedAt) : '—'}
              </Typography>
            </Box>
          ) : (
            <Typography color="text.secondary">Loading…</Typography>
          )}
        </Box>
      </Drawer>
    </Box>
  );
}
