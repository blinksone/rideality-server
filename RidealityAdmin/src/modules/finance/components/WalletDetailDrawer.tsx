import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Avatar,
  Box,
  Button,
  Chip,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import {
  addWalletNote,
  createFinanceAdjustment,
  getWalletDashboardDetail,
  updateWalletStatus,
} from '@/api/finance.api';
import { getApiErrorMessage } from '@/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { useNotify } from '@/services/notification';
import { formatDate, formatLabel } from '@/utils/format';
import {
  accountStatusChipColor,
  balanceColor,
  formatWalletMoney,
  ownerInitials,
  shortWalletId,
  walletStatusChipColor,
} from '@/modules/finance/utils/walletUi';

interface WalletDetailDrawerProps {
  walletId: string | null;
  open: boolean;
  onClose: () => void;
}

export default function WalletDetailDrawer({ walletId, open, onClose }: WalletDetailDrawerProps) {
  const [tab, setTab] = useState(0);
  const [note, setNote] = useState('');
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ direction: 'credit' as 'credit' | 'debit', amount: '', reason: '' });
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { can } = usePermissions();

  const { data, isLoading } = useQuery({
    queryKey: ['wallet-dashboard', walletId],
    queryFn: () => getWalletDashboardDetail(walletId!),
    enabled: open && Boolean(walletId),
  });

  const statusMutation = useMutation({
    mutationFn: (status: 'active' | 'frozen' | 'closed') => updateWalletStatus(walletId!, status),
    onSuccess: () => {
      notify.success('Wallet status updated');
      queryClient.invalidateQueries({ queryKey: ['wallet-dashboard', walletId] });
      queryClient.invalidateQueries({ queryKey: ['finance-wallets'] });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
    },
    onError: (err) => notify.error(getApiErrorMessage(err)),
  });

  const noteMutation = useMutation({
    mutationFn: (content: string) => addWalletNote(walletId!, content),
    onSuccess: () => {
      setNote('');
      notify.success('Note added');
      queryClient.invalidateQueries({ queryKey: ['wallet-dashboard', walletId] });
    },
    onError: (err) => notify.error(getApiErrorMessage(err)),
  });

  const adjustMutation = useMutation({
    mutationFn: () =>
      createFinanceAdjustment({
        walletId: walletId!,
        direction: adjustForm.direction,
        amount: Number(adjustForm.amount),
        reason: adjustForm.reason,
        topupMethod: 'admin_manual',
      }),
    onSuccess: () => {
      notify.success('Adjustment requested');
      setAdjustOpen(false);
      setAdjustForm({ direction: 'credit', amount: '', reason: '' });
      queryClient.invalidateQueries({ queryKey: ['wallet-dashboard', walletId] });
      queryClient.invalidateQueries({ queryKey: ['finance-adjustments'] });
    },
    onError: (err) => notify.error(getApiErrorMessage(err)),
  });

  const wallet = data?.wallet;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{ zIndex: (theme) => theme.zIndex.drawer }}
      slotProps={{
        paper: {
          sx: {
            width: { xs: '100%', sm: 480, md: 560 },
            top: '73px',
            height: 'calc(100% - 73px)',
            borderRadius: '12px 0 0 12px',
          },
        },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ p: 2.5, borderBottom: 1, borderColor: 'divider' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', gap: 1.5, minWidth: 0 }}>
              <Avatar sx={{ bgcolor: 'primary.main', width: 44, height: 44 }}>
                {ownerInitials(wallet?.ownerLabel ?? 'W')}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" noWrap>
                  {wallet?.ownerLabel ?? (isLoading ? 'Loading…' : 'Wallet')}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                  {wallet ? shortWalletId(wallet.id) : ''}
                </Typography>
                <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
                  {wallet && <Chip size="small" label={formatLabel(wallet.ownerType)} variant="outlined" />}
                  {wallet?.ownerStatus && (
                    <Chip
                      size="small"
                      label={formatLabel(wallet.ownerStatus)}
                      color={accountStatusChipColor(wallet.ownerStatus)}
                    />
                  )}
                  {wallet && (!wallet.ownerStatus || wallet.status !== 'active') && (
                    <Chip
                      size="small"
                      variant={wallet.ownerStatus ? 'outlined' : 'filled'}
                      label={formatLabel(wallet.status)}
                      color={walletStatusChipColor(wallet.status)}
                    />
                  )}
                </Stack>
              </Box>
            </Box>
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Stack>

          {wallet && (
            <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Available
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: balanceColor(wallet.availableBalance ?? wallet.balance) }}>
                  {formatWalletMoney(wallet.availableBalance ?? wallet.balance, wallet.currency)}
                </Typography>
              </Box>
              <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Pending
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#F59E0B' }}>
                  {formatWalletMoney(wallet.pendingBalance ?? 0, wallet.currency)}
                </Typography>
              </Box>
            </Box>
          )}

          {wallet && can('approve_wallet_adjustments') && (
            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
              {wallet.status !== 'frozen' && (
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  startIcon={<AcUnitIcon />}
                  onClick={() => statusMutation.mutate('frozen')}
                  disabled={statusMutation.isPending}
                >
                  Freeze
                </Button>
              )}
              {wallet.status === 'frozen' && (
                <Button
                  size="small"
                  variant="outlined"
                  color="success"
                  startIcon={<PlayArrowIcon />}
                  onClick={() => statusMutation.mutate('active')}
                  disabled={statusMutation.isPending}
                >
                  Activate
                </Button>
              )}
              {can('manage_wallet_adjustments') && (
                <Button size="small" variant="contained" onClick={() => setAdjustOpen((v) => !v)}>
                  Adjust balance
                </Button>
              )}
            </Stack>
          )}

          {adjustOpen && wallet && (
            <Box sx={{ mt: 2, p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
              <Stack spacing={1.5}>
                <FormControl size="small" fullWidth>
                  <InputLabel id="adj-direction">Direction</InputLabel>
                  <Select
                    labelId="adj-direction"
                    label="Direction"
                    value={adjustForm.direction}
                    onChange={(e) =>
                      setAdjustForm((f) => ({ ...f, direction: e.target.value as 'credit' | 'debit' }))
                    }
                  >
                    <MenuItem value="credit">Credit</MenuItem>
                    <MenuItem value="debit">Debit</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  label={`Amount (${wallet.currency})`}
                  type="number"
                  value={adjustForm.amount}
                  onChange={(e) => setAdjustForm((f) => ({ ...f, amount: e.target.value }))}
                />
                <TextField
                  size="small"
                  label="Reason"
                  multiline
                  minRows={2}
                  value={adjustForm.reason}
                  onChange={(e) => setAdjustForm((f) => ({ ...f, reason: e.target.value }))}
                />
                <Button
                  variant="contained"
                  onClick={() => adjustMutation.mutate()}
                  disabled={adjustMutation.isPending || !adjustForm.amount || adjustForm.reason.length < 3}
                >
                  Request adjustment
                </Button>
              </Stack>
            </Box>
          )}
        </Box>

        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" sx={{ px: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="Transactions" />
          <Tab label="Adjustments" />
          <Tab label="Payouts" />
          <Tab label="Audit" />
          <Tab label="Notes" />
        </Tabs>

        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          {tab === 0 && (
            <List dense disablePadding>
              {(data?.recentTransactions ?? []).map((tx) => (
                <ListItem key={tx.id} divider sx={{ px: 0 }}>
                  <ListItemText
                    primary={formatLabel(tx.type)}
                    secondary={tx.description ?? formatDate(tx.createdAt)}
                    slotProps={{ primary: { sx: { fontWeight: 600 } } }}
                  />
                  <Typography sx={{ fontWeight: 600, color: balanceColor(tx.type.includes('credit') || tx.type.includes('earnings') || tx.type === 'topup' || tx.type === 'refund' ? 1 : -1) }}>
                    {formatWalletMoney(tx.amount, tx.currency)}
                  </Typography>
                </ListItem>
              ))}
              {!isLoading && (data?.recentTransactions.length ?? 0) === 0 && (
                <Typography color="text.secondary" sx={{ py: 2 }}>
                  No transactions yet.
                </Typography>
              )}
            </List>
          )}

          {tab === 1 && (
            <List dense disablePadding>
              {(data?.recentAdjustments ?? []).map((adj) => (
                <ListItem key={adj.id} divider sx={{ px: 0 }}>
                  <ListItemText
                    primary={`${formatLabel(adj.direction)} · ${formatWalletMoney(adj.amount, adj.currency)}`}
                    secondary={adj.reason}
                  />
                  <Chip size="small" label={formatLabel(adj.status)} />
                </ListItem>
              ))}
            </List>
          )}

          {tab === 2 && (
            <List dense disablePadding>
              {(data?.recentPayouts ?? []).map((p) => (
                <ListItem key={p.id} divider sx={{ px: 0 }}>
                  <ListItemText
                    primary={formatWalletMoney(p.amount, p.currency)}
                    secondary={p.bankName ?? p.accountTitle ?? '—'}
                  />
                  <Chip size="small" label={formatLabel(p.status)} />
                </ListItem>
              ))}
            </List>
          )}

          {tab === 3 && (
            <List dense disablePadding>
              {(data?.auditHistory ?? []).map((entry) => (
                <ListItem key={entry.id} divider sx={{ px: 0, alignItems: 'flex-start' }}>
                  <ListItemText
                    primary={formatLabel(entry.action.replace(/\./g, ' '))}
                    secondary={
                      <>
                        {formatDate(entry.createdAt)}
                        {entry.actor?.fullName || entry.actor?.email
                          ? ` · ${entry.actor.fullName ?? entry.actor.email}`
                          : ''}
                      </>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}

          {tab === 4 && (
            <Box>
              {can('manage_wallet_adjustments') && (
                <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="Add an internal note…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <Button
                    variant="contained"
                    onClick={() => noteMutation.mutate(note)}
                    disabled={!note.trim() || noteMutation.isPending}
                  >
                    Add
                  </Button>
                </Stack>
              )}
              <List dense disablePadding>
                {(data?.notes ?? []).map((n) => (
                  <ListItem key={n.id} divider sx={{ px: 0, alignItems: 'flex-start', flexDirection: 'column' }}>
                    <Typography variant="body2">{n.content}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatDate(n.createdAt)}
                      {n.author?.fullName || n.author?.email ? ` · ${n.author.fullName ?? n.author.email}` : ''}
                    </Typography>
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
        </Box>
      </Box>
    </Drawer>
  );
}
