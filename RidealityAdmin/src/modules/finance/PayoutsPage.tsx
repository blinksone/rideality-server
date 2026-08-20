import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography,
} from '@mui/material';
import { listFinancePayouts, reviewFinancePayout } from '@/api/finance.api';
import { getApiErrorMessage } from '@/api/client';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useNotify } from '@/services/notification';
import type { FinancePayout } from '@/api/types';
import { formatDate, formatLabel } from '@/utils/format';

function payoutStatusColor(status: FinancePayout['status']) {
  if (status === 'completed') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'rejected' || status === 'cancelled') return 'default';
  return 'info';
}

function formatBankDetails(payout: FinancePayout) {
  const parts = [payout.bankName, payout.accountTitle, payout.accountNumber].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
}

export default function PayoutsPage() {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [status, setStatus] = useState('');
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { can, isSuperAdmin } = usePermissions();
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['finance-payouts', page, rowsPerPage, status],
    queryFn: () =>
      listFinancePayouts({
        page: page + 1,
        limit: rowsPerPage,
        status: status || undefined,
      }),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      reviewFinancePayout(id, { action }),
    onSuccess: () => {
      notify.success('Payout reviewed');
      queryClient.invalidateQueries({ queryKey: ['finance-payouts'] });
      queryClient.invalidateQueries({ queryKey: ['finance-wallets'] });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const columns: DataTableColumn<FinancePayout>[] = [
    { id: 'owner', label: 'Wallet', render: (p) => p.wallet?.ownerLabel ?? p.walletId },
    {
      id: 'amount',
      label: 'Amount',
      render: (p) => `${p.amount.toLocaleString()} ${p.currency}`,
    },
    { id: 'bank', label: 'Bank details', render: formatBankDetails },
    {
      id: 'status',
      label: 'Status',
      render: (p) => (
        <Chip size="small" label={formatLabel(p.status)} color={payoutStatusColor(p.status)} />
      ),
    },
    {
      id: 'requested',
      label: 'Requested',
      render: (p) => p.requestedBy?.fullName ?? p.requestedBy?.email ?? '—',
    },
    { id: 'created', label: 'Created', render: (p) => formatDate(p.createdAt) },
    {
      id: 'actions',
      label: 'Actions',
      align: 'right',
      render: (p) => {
        if (p.status !== 'pending' || !can('approve_wallet_adjustments')) return null;
        const isOwnRequest = p.requestedById === user?.id;
        if (isOwnRequest && !isSuperAdmin) {
          return (
            <Typography variant="caption" color="text.secondary">
              Awaiting another approver
            </Typography>
          );
        }
        return (
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button size="small" onClick={() => reviewMutation.mutate({ id: p.id, action: 'approve' })}>
              Approve
            </Button>
            <Button size="small" color="inherit" onClick={() => reviewMutation.mutate({ id: p.id, action: 'reject' })}>
              Reject
            </Button>
          </Box>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Payouts"
        subtitle="Fleet and wallet withdrawal requests require approval before funds are sent."
      />
      <Box sx={{ mb: 2, maxWidth: 220 }}>
        <FormControl fullWidth size="small">
          <InputLabel id="payout-status">Status</InputLabel>
          <Select
            labelId="payout-status"
            label="Status"
            value={status}
            displayEmpty
            renderValue={(v) =>
              v ? String(v).charAt(0).toUpperCase() + String(v).slice(1) : 'All'
            }
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="completed">Completed</MenuItem>
            <MenuItem value="rejected">Rejected</MenuItem>
          </Select>
        </FormControl>
      </Box>
      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(p) => p.id}
        page={page}
        rowsPerPage={rowsPerPage}
        total={data?.pagination.total ?? 0}
        onPageChange={setPage}
        onRowsPerPageChange={(n) => {
          setRowsPerPage(n);
          setPage(0);
        }}
        loading={isLoading}
      />
    </>
  );
}
