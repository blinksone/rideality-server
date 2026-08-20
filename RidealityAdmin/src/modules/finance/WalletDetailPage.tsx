import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Box, Chip, Paper, Typography } from '@mui/material';
import { getFinanceWallet, listFinanceWalletTransactions } from '@/api/finance.api';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import PageHeader from '@/components/PageHeader';
import type { WalletTransaction } from '@/api/types';
import { formatDate, formatLabel } from '@/utils/format';

export default function WalletDetailPage() {
  const { id = '' } = useParams();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const { data: wallet, isLoading: walletLoading } = useQuery({
    queryKey: ['finance-wallet', id],
    queryFn: () => getFinanceWallet(id),
    enabled: Boolean(id),
  });

  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ['finance-wallet-transactions', id, page, rowsPerPage],
    queryFn: () => listFinanceWalletTransactions(id, { page: page + 1, limit: rowsPerPage }),
    enabled: Boolean(id),
  });

  const columns: DataTableColumn<WalletTransaction>[] = [
    { id: 'type', label: 'Type', render: (t) => formatLabel(t.type) },
    { id: 'amount', label: 'Amount', render: (t) => `${t.amount} ${t.currency}` },
    {
      id: 'balance',
      label: 'Balance after',
      render: (t) => `${t.balanceAfter} ${t.currency}`,
    },
    { id: 'description', label: 'Description', render: (t) => t.description ?? '—' },
    { id: 'created', label: 'Date', render: (t) => formatDate(t.createdAt) },
  ];

  return (
    <>
      <PageHeader
        title={wallet?.ownerLabel ?? 'Wallet'}
        breadcrumbs={[
          { label: 'Finance', to: '/finance' },
          { label: 'Wallets', to: '/finance/wallets' },
          { label: wallet?.ownerLabel ?? id },
        ]}
      />
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        {walletLoading ? (
          <Typography>Loading…</Typography>
        ) : wallet ? (
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Balance
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {wallet.balance.toLocaleString()} {wallet.currency}
              </Typography>
            </Box>
            <Chip label={formatLabel(wallet.ownerType)} />
            <Chip
              label={formatLabel(wallet.status)}
              color={wallet.status === 'active' ? 'success' : wallet.status === 'frozen' ? 'warning' : 'default'}
            />
          </Box>
        ) : null}
      </Paper>
      <Typography variant="h6" sx={{ mb: 1 }}>
        Transaction history
      </Typography>
      <DataTable
        columns={columns}
        rows={txData?.data ?? []}
        rowKey={(t) => t.id}
        page={page}
        rowsPerPage={rowsPerPage}
        total={txData?.pagination.total ?? 0}
        onPageChange={setPage}
        onRowsPerPageChange={(n) => {
          setRowsPerPage(n);
          setPage(0);
        }}
        loading={txLoading}
      />
    </>
  );
}
