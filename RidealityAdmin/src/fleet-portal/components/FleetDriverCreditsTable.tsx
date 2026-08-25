import { useState } from 'react';
import { Box, Button, Chip, FormControl, InputLabel, MenuItem, Select, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listFleetDriverCredits, reviewFleetDriverCredit } from '@/api/fleet.api';
import { getApiErrorMessage } from '@/api/client';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import { useNotify } from '@/services/notification';
import { formatDate, formatLabel } from '@/utils/format';
import { useAuth } from '@/hooks/useAuth';
import type { FleetDriverCredit } from '@/api/types';

type Props = {
  companyId: string;
  canReview?: boolean;
};

export default function FleetDriverCreditsTable({ companyId, canReview = false }: Props) {
  const { user } = useAuth();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['fleet-driver-credits', companyId, page, rowsPerPage, status],
    queryFn: () =>
      listFleetDriverCredits(companyId, {
        page: page + 1,
        limit: rowsPerPage,
        status: status || undefined,
      }),
    enabled: Boolean(companyId),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      reviewFleetDriverCredit(companyId, id, { action }),
    onSuccess: (_, vars) => {
      notify.success(vars.action === 'approve' ? 'Credit approved' : 'Credit rejected');
      queryClient.invalidateQueries({ queryKey: ['fleet-driver-credits', companyId] });
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const columns: DataTableColumn<FleetDriverCredit>[] = [
    {
      id: 'driver',
      label: 'Driver',
      render: (c) => c.wallet?.ownerLabel ?? c.driverPhone ?? '—',
    },
    {
      id: 'amount',
      label: 'Amount',
      render: (c) => `${c.amount.toLocaleString()} ${c.currency}`,
    },
    {
      id: 'method',
      label: 'Where paid',
      render: (c) => formatLabel(c.topupMethod ?? '—'),
    },
    { id: 'reason', label: 'Reason', render: (c) => c.reason },
    {
      id: 'status',
      label: 'Status',
      render: (c) => (
        <Chip
          size="small"
          label={formatLabel(c.status)}
          color={c.status === 'approved' ? 'success' : c.status === 'pending' ? 'warning' : 'default'}
        />
      ),
    },
    {
      id: 'requested',
      label: 'Requested by',
      render: (c) => c.requestedBy?.fullName ?? c.requestedBy?.email ?? '—',
    },
    { id: 'created', label: 'Created', render: (c) => formatDate(c.createdAt) },
    {
      id: 'actions',
      label: 'Actions',
      align: 'right',
      render: (c) => {
        if (!canReview || c.status !== 'pending') return null;
        if (c.requestedById === user?.id) {
          return (
            <Typography variant="caption" color="text.secondary">
              Awaiting owner
            </Typography>
          );
        }
        return (
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button
              size="small"
              disabled={reviewMutation.isPending}
              onClick={() => reviewMutation.mutate({ id: c.id, action: 'approve' })}
            >
              Approve
            </Button>
            <Button
              size="small"
              color="inherit"
              disabled={reviewMutation.isPending}
              onClick={() => reviewMutation.mutate({ id: c.id, action: 'reject' })}
            >
              Reject
            </Button>
          </Box>
        );
      },
    },
  ];

  return (
    <>
      <Box sx={{ mb: 2, maxWidth: 220 }}>
        <FormControl fullWidth size="small">
          <InputLabel id="credit-status">Status</InputLabel>
          <Select
            labelId="credit-status"
            label="Status"
            value={status}
            displayEmpty
            renderValue={(v) => (v ? formatLabel(String(v)) : 'All')}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="approved">Approved</MenuItem>
            <MenuItem value="rejected">Rejected</MenuItem>
          </Select>
        </FormControl>
      </Box>
      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(c) => c.id}
        page={page}
        rowsPerPage={rowsPerPage}
        total={data?.pagination.total ?? 0}
        onPageChange={setPage}
        onRowsPerPageChange={(n) => {
          setRowsPerPage(n);
          setPage(0);
        }}
        loading={isLoading}
        emptyMessage="No driver credits yet"
      />
    </>
  );
}
