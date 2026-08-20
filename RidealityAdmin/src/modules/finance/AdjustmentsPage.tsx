import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import {
  createFinanceAdjustment,
  listFinanceAdjustments,
  lookupFinanceWalletsByEmail,
  reviewFinanceAdjustment,
} from '@/api/finance.api';
import { getApiErrorMessage } from '@/api/client';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import PageHeader from '@/components/PageHeader';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { useNotify } from '@/services/notification';
import type { FinanceAdjustment, WalletDetail } from '@/api/types';
import { formatDate, formatLabel } from '@/utils/format';

function resetAdjustmentForm() {
  return {
    email: '',
    walletId: '',
    ownerTitle: '',
    currency: '',
    direction: 'credit' as 'credit' | 'debit',
    amount: '',
    reason: '',
    topupMethod: 'bank_transfer',
    externalRef: '',
    walletOptions: [] as WalletDetail[],
    lookupError: '',
    lookupLoading: false,
  };
}

export default function AdjustmentsPage() {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [status, setStatus] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(resetAdjustmentForm);
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { can, isSuperAdmin } = usePermissions();
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['finance-adjustments', page, rowsPerPage, status],
    queryFn: () =>
      listFinanceAdjustments({
        page: page + 1,
        limit: rowsPerPage,
        status: status || undefined,
      }),
  });

  useEffect(() => {
    const email = form.email.trim();
    if (!dialogOpen) return;

    if (!email.includes('@')) {
      setForm((f) => ({
        ...f,
        walletId: '',
        ownerTitle: '',
        currency: '',
        walletOptions: [],
        lookupError: '',
        lookupLoading: false,
      }));
      return;
    }

    const timer = window.setTimeout(async () => {
      setForm((f) => ({ ...f, lookupLoading: true, lookupError: '' }));
      try {
        const wallets = await lookupFinanceWalletsByEmail(email);
        if (wallets.length === 0) {
          setForm((f) => ({
            ...f,
            walletId: '',
            ownerTitle: '',
            currency: '',
            walletOptions: [],
            lookupError: 'No wallet found for this email',
            lookupLoading: false,
          }));
          return;
        }

        const selected = wallets.length === 1 ? wallets[0] : null;
        setForm((f) => ({
          ...f,
          walletOptions: wallets,
          walletId: selected?.id ?? '',
          ownerTitle: selected?.ownerLabel ?? '',
          currency: selected?.currency ?? '',
          lookupError: '',
          lookupLoading: false,
        }));
      } catch (e) {
        setForm((f) => ({
          ...f,
          walletId: '',
          ownerTitle: '',
          currency: '',
          walletOptions: [],
          lookupError: getApiErrorMessage(e),
          lookupLoading: false,
        }));
      }
    }, 400);

    return () => window.clearTimeout(timer);
  }, [dialogOpen, form.email]);

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setForm(resetAdjustmentForm());
  };

  const handleSelectWallet = (walletId: string) => {
    const wallet = form.walletOptions.find((w) => w.id === walletId);
    setForm((f) => ({
      ...f,
      walletId,
      ownerTitle: wallet?.ownerLabel ?? '',
      currency: wallet?.currency ?? '',
    }));
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createFinanceAdjustment({
        walletId: form.walletId,
        direction: form.direction,
        amount: Number(form.amount),
        reason: form.reason,
        topupMethod: form.direction === 'credit' ? form.topupMethod : undefined,
        externalRef: form.externalRef || undefined,
      }),
    onSuccess: () => {
      notify.success('Adjustment submitted for approval');
      handleCloseDialog();
      queryClient.invalidateQueries({ queryKey: ['finance-adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      reviewFinanceAdjustment(id, { action }),
    onSuccess: () => {
      notify.success('Adjustment reviewed');
      queryClient.invalidateQueries({ queryKey: ['finance-adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['finance-wallets'] });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const canSubmit =
    Boolean(form.walletId) &&
    Boolean(form.amount) &&
    Boolean(form.reason.trim()) &&
    !form.lookupLoading &&
    !form.lookupError;

  const columns: DataTableColumn<FinanceAdjustment>[] = [
    { id: 'owner', label: 'Wallet', render: (a) => a.wallet?.ownerLabel ?? a.walletId },
    {
      id: 'direction',
      label: 'Type',
      render: (a) => `${formatLabel(a.direction)} · ${a.amount} ${a.currency}`,
    },
    { id: 'reason', label: 'Reason', render: (a) => a.reason },
    {
      id: 'status',
      label: 'Status',
      render: (a) => (
        <Chip
          size="small"
          label={formatLabel(a.status)}
          color={a.status === 'approved' ? 'success' : a.status === 'pending' ? 'warning' : 'default'}
        />
      ),
    },
    {
      id: 'requested',
      label: 'Requested',
      render: (a) => a.requestedBy?.fullName ?? a.requestedBy?.email ?? '—',
    },
    { id: 'created', label: 'Created', render: (a) => formatDate(a.createdAt) },
    {
      id: 'actions',
      label: 'Actions',
      align: 'right',
      render: (a) => {
        if (a.status !== 'pending' || !can('approve_wallet_adjustments')) return null;
        const isOwnRequest = a.requestedById === user?.id;
        if (isOwnRequest && !isSuperAdmin) {
          return (
            <Typography variant="caption" color="text.secondary">
              Awaiting another approver
            </Typography>
          );
        }
        return (
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button size="small" onClick={() => reviewMutation.mutate({ id: a.id, action: 'approve' })}>
              Approve
            </Button>
            <Button size="small" color="inherit" onClick={() => reviewMutation.mutate({ id: a.id, action: 'reject' })}>
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
        title="Adjustments"
        subtitle="Manual credits/debits require a second approver before posting to the ledger."
        actions={
          can('manage_wallet_adjustments') ? (
            <Button variant="contained" onClick={() => setDialogOpen(true)}>
              Request adjustment
            </Button>
          ) : undefined
        }
      />
      <Box sx={{ mb: 2, maxWidth: 220 }}>
        <FormControl fullWidth size="small">
          <InputLabel id="adjustment-status">Status</InputLabel>
          <Select
            labelId="adjustment-status"
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
            <MenuItem value="approved">Approved</MenuItem>
            <MenuItem value="rejected">Rejected</MenuItem>
          </Select>
        </FormControl>
      </Box>
      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(a) => a.id}
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

      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Request wallet adjustment</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            helperText="User or fleet owner email — wallet details load automatically"
            required
            fullWidth
            autoFocus
          />
          {form.lookupLoading && (
            <Typography variant="body2" color="text.secondary">
              Looking up wallet…
            </Typography>
          )}
          {form.lookupError && <Alert severity="error">{form.lookupError}</Alert>}
          {form.walletOptions.length > 1 && (
            <FormControl fullWidth required>
              <InputLabel id="adj-wallet">Wallet</InputLabel>
              <Select
                labelId="adj-wallet"
                label="Wallet"
                value={form.walletId}
                onChange={(e) => handleSelectWallet(e.target.value)}
              >
                {form.walletOptions.map((wallet) => (
                  <MenuItem key={wallet.id} value={wallet.id}>
                    {formatLabel(wallet.ownerType)} · {wallet.ownerLabel} ({wallet.currency})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          {form.ownerTitle && (
            <TextField
              label="Account title"
              value={form.ownerTitle}
              fullWidth
              slotProps={{ input: { readOnly: true } }}
            />
          )}
          <FormControl fullWidth>
            <InputLabel id="adj-direction">Direction</InputLabel>
            <Select
              labelId="adj-direction"
              label="Direction"
              value={form.direction}
              onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value as 'credit' | 'debit' }))}
            >
              <MenuItem value="credit">Credit (top-up)</MenuItem>
              <MenuItem value="debit">Debit</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Amount"
            type="number"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            required
            fullWidth
            disabled={!form.walletId}
            helperText="Max 9,999,999,999.99"
            inputProps={{ min: 0.01, max: 9999999999.99, step: '0.01' }}
            slotProps={{
              input: {
                endAdornment: form.currency ? (
                  <InputAdornment position="end">{form.currency}</InputAdornment>
                ) : undefined,
              },
            }}
          />
          {form.direction === 'credit' && (
            <FormControl fullWidth>
              <InputLabel id="topup-method">Top-up method</InputLabel>
              <Select
                labelId="topup-method"
                label="Top-up method"
                value={form.topupMethod}
                onChange={(e) => setForm((f) => ({ ...f, topupMethod: e.target.value }))}
              >
                <MenuItem value="cash">Cash</MenuItem>
                <MenuItem value="bank_transfer">Bank transfer</MenuItem>
                <MenuItem value="admin_manual">Admin manual</MenuItem>
              </Select>
            </FormControl>
          )}
          <TextField
            label="External reference"
            value={form.externalRef}
            onChange={(e) => setForm((f) => ({ ...f, externalRef: e.target.value.slice(0, 120) }))}
            helperText="Receipt no., bank ref, etc. (max 120)"
            fullWidth
            inputProps={{ maxLength: 120 }}
          />
          <TextField
            label="Reason"
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value.slice(0, 500) }))}
            required
            fullWidth
            multiline
            minRows={2}
            inputProps={{ maxLength: 500 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!canSubmit || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Submit for approval
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
