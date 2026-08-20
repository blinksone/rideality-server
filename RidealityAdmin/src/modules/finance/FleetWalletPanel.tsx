import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import {
  createFleetPayoutRequest,
  getFleetWallet,
  listFleetWalletTransactions,
} from '@/api/fleet.api';
import { getApiErrorMessage } from '@/api/client';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import { usePermissions } from '@/hooks/usePermissions';
import { useNotify } from '@/services/notification';
import type { WalletTransaction } from '@/api/types';
import { formatDate, formatLabel } from '@/utils/format';

interface FleetWalletPanelProps {
  fleetId: string;
}

export default function FleetWalletPanel({ fleetId }: FleetWalletPanelProps) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountTitle, setAccountTitle] = useState('');
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { can } = usePermissions();

  const { data: wallet, isLoading } = useQuery({
    queryKey: ['fleet-wallet', fleetId],
    queryFn: () => getFleetWallet(fleetId),
    enabled: Boolean(fleetId),
  });

  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ['fleet-wallet-transactions', fleetId, page, rowsPerPage],
    queryFn: () => listFleetWalletTransactions(fleetId, { page: page + 1, limit: rowsPerPage }),
    enabled: Boolean(fleetId),
  });

  const payoutMutation = useMutation({
    mutationFn: () =>
      createFleetPayoutRequest(fleetId, {
        amount: Number(amount),
        bankName: bankName || undefined,
        accountNumber: accountNumber || undefined,
        accountTitle: accountTitle || undefined,
      }),
    onSuccess: () => {
      notify.success('Payout request submitted for approval');
      setPayoutOpen(false);
      setAmount('');
      queryClient.invalidateQueries({ queryKey: ['fleet-wallet', fleetId] });
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const columns: DataTableColumn<WalletTransaction>[] = [
    { id: 'type', label: 'Type', render: (t) => formatLabel(t.type) },
    { id: 'amount', label: 'Amount', render: (t) => `${t.amount} ${t.currency}` },
    { id: 'description', label: 'Description', render: (t) => t.description ?? '—' },
    { id: 'created', label: 'Date', render: (t) => formatDate(t.createdAt) },
  ];

  if (isLoading) return <Typography>Loading wallet…</Typography>;

  return (
    <Box>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
          <Box>
            <Typography variant="body2" color="text.secondary">
              Fleet wallet balance
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {wallet ? `${wallet.balance.toLocaleString()} ${wallet.currency}` : '—'}
            </Typography>
          </Box>
          {can('manage_fleets') && (
            <Button variant="outlined" onClick={() => setPayoutOpen(true)}>
              Request payout
            </Button>
          )}
        </Box>
      </Paper>
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

      <Dialog open={payoutOpen} onClose={() => setPayoutOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Request fleet payout</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField label="Amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required fullWidth />
          <TextField label="Bank name" value={bankName} onChange={(e) => setBankName(e.target.value)} fullWidth />
          <TextField label="Account title" value={accountTitle} onChange={(e) => setAccountTitle(e.target.value)} fullWidth />
          <TextField label="Account number" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} fullWidth />
          <Typography variant="body2" color="text.secondary">
            Payout requires finance approval. Manual bank transfer until gateway integration.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayoutOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!amount || payoutMutation.isPending} onClick={() => payoutMutation.mutate()}>
            Submit
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
