import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, Chip, Grid, Paper, Typography } from '@mui/material';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import { getPassengerWallet, type PassengerWalletTransaction } from '@/api/passengers.api';
import { formatDate, formatLabel } from '@/utils/format';

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'default'> = {
  active: 'success',
  frozen: 'warning',
  closed: 'default',
};

export default function PassengerWalletTab({ userId }: { userId: string }) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const { data, isLoading } = useQuery({
    queryKey: ['passenger-wallet', userId, page, rowsPerPage],
    queryFn: () => getPassengerWallet(userId, { page: page + 1, limit: rowsPerPage }),
    enabled: Boolean(userId),
  });

  const wallet = data?.wallet;

  const columns: DataTableColumn<PassengerWalletTransaction>[] = [
    {
      id: 'type',
      label: 'Type',
      render: (r) => <Chip size="small" variant="outlined" label={formatLabel(r.type)} />,
    },
    {
      id: 'description',
      label: 'Description',
      minWidth: 200,
      render: (r) => r.description ?? '—',
    },
    {
      id: 'amount',
      label: 'Amount',
      align: 'right',
      render: (r) => (
        <Typography
          variant="body2"
          sx={{ fontWeight: 600, color: r.amount >= 0 ? 'success.main' : 'error.main' }}
        >
          {r.amount >= 0 ? '+' : ''}
          {r.amount.toLocaleString()} {r.currency}
        </Typography>
      ),
    },
    {
      id: 'balanceAfter',
      label: 'Balance after',
      align: 'right',
      render: (r) => `${r.balanceAfter.toLocaleString()} ${r.currency}`,
    },
    {
      id: 'createdAt',
      label: 'When',
      render: (r) => formatDate(r.createdAt),
    },
  ];

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Typography variant="caption" color="text.secondary">
              Balance
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {wallet ? `${wallet.balance.toLocaleString()} ${wallet.currency}` : '—'}
            </Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Typography variant="caption" color="text.secondary">
              Status
            </Typography>
            <Box sx={{ mt: 1 }}>
              {wallet ? (
                <Chip
                  label={formatLabel(wallet.status)}
                  color={STATUS_COLORS[wallet.status] ?? 'default'}
                  size="small"
                />
              ) : (
                '—'
              )}
            </Box>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Typography variant="caption" color="text.secondary">
              Last updated
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              {wallet ? formatDate(wallet.updatedAt) : '—'}
            </Typography>
          </Paper>
        </Grid>
      </Grid>
      <DataTable
        columns={columns}
        rows={data?.transactions ?? []}
        rowKey={(r) => r.id}
        page={page}
        rowsPerPage={rowsPerPage}
        total={data?.total ?? 0}
        onPageChange={setPage}
        onRowsPerPageChange={(n) => {
          setRowsPerPage(n);
          setPage(0);
        }}
        loading={isLoading}
        emptyMessage="No wallet transactions"
      />
    </Box>
  );
}
