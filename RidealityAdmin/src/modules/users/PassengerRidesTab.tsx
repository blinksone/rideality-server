import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, Chip, MenuItem, Rating, Stack, TextField, Typography } from '@mui/material';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import { getPassengerRides, type PassengerRide } from '@/api/passengers.api';
import { formatDate, formatLabel } from '@/utils/format';

const STATUS_COLORS: Record<
  PassengerRide['status'],
  'default' | 'success' | 'error' | 'warning' | 'info'
> = {
  requested: 'info',
  assigned: 'warning',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'error',
};

export default function PassengerRidesTab({ userId }: { userId: string }) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [status, setStatus] = useState<'all' | 'active' | 'completed' | 'cancelled'>('all');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['passenger-rides', userId, page, rowsPerPage, status, search],
    queryFn: () =>
      getPassengerRides(userId, {
        page: page + 1,
        limit: rowsPerPage,
        status: status === 'all' ? undefined : status,
        search: search.trim() || undefined,
      }),
    enabled: Boolean(userId),
  });

  const columns: DataTableColumn<PassengerRide>[] = [
    {
      id: 'route',
      label: 'Route',
      minWidth: 220,
      render: (r) => (
        <Box>
          <Typography variant="body2" noWrap>
            {r.pickupAddress}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            → {r.dropoffAddress}
          </Typography>
        </Box>
      ),
    },
    {
      id: 'driver',
      label: 'Driver',
      render: (r) => r.driver.fullName ?? '—',
    },
    {
      id: 'status',
      label: 'Status',
      render: (r) => (
        <Chip size="small" label={formatLabel(r.status)} color={STATUS_COLORS[r.status]} variant="outlined" />
      ),
    },
    {
      id: 'fare',
      label: 'Fare',
      align: 'right',
      render: (r) => `${r.fare.toLocaleString()} ${r.currency}`,
    },
    {
      id: 'distanceKm',
      label: 'Distance',
      align: 'right',
      render: (r) => `${r.distanceKm} km`,
    },
    {
      id: 'ratingGiven',
      label: 'Rated driver',
      render: (r) =>
        r.ratingGiven ? <Rating size="small" value={r.ratingGiven} readOnly /> : <Typography variant="caption" color="text.secondary">—</Typography>,
    },
    {
      id: 'createdAt',
      label: 'When',
      render: (r) => formatDate(r.completedAt ?? r.createdAt),
    },
  ];

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <TextField
          select
          size="small"
          label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            setPage(0);
          }}
          sx={{ minWidth: 160 }}
        >
          {['all', 'active', 'completed', 'cancelled'].map((s) => (
            <MenuItem key={s} value={s}>
              {formatLabel(s)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          label="Search pickup / dropoff"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: 240 }}
        />
      </Stack>
      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(r) => r.id}
        page={page}
        rowsPerPage={rowsPerPage}
        total={data?.pagination.total ?? 0}
        onPageChange={setPage}
        onRowsPerPageChange={(n) => {
          setRowsPerPage(n);
          setPage(0);
        }}
        loading={isLoading}
        emptyMessage="No rides yet"
      />
    </Box>
  );
}
