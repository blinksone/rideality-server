import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Avatar,
  Box,
  Button,
  Chip,
  Collapse,
  FormControl,
  IconButton,
  InputLabel,
  Menu,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import DownloadIcon from '@mui/icons-material/Download';
import FilterListIcon from '@mui/icons-material/FilterList';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { Link as RouterLink } from 'react-router-dom';
import {
  bulkUpdateWalletStatus,
  exportFinanceWallets,
  getFinanceSummary,
  listFinanceWallets,
  updateWalletStatus,
  type WalletListParams,
} from '@/api/finance.api';
import { getApiErrorMessage } from '@/api/client';
import type { WalletDetail } from '@/api/types';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import PageHeader from '@/components/PageHeader';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermissions } from '@/hooks/usePermissions';
import { useNotify } from '@/services/notification';
import { formatDate, formatLabel } from '@/utils/format';
import BulkAdjustmentDialog from '@/modules/finance/components/BulkAdjustmentDialog';
import WalletDetailDrawer from '@/modules/finance/components/WalletDetailDrawer';
import {
  accountStatusChipColor,
  balanceColor,
  formatWalletMoney,
  ownerInitials,
  shortWalletId,
  walletStatusChipColor,
  FINANCE_COLORS,
} from '@/modules/finance/utils/walletUi';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toIsoDateStart(date: string): string | undefined {
  if (!date) return undefined;
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}

function toIsoDateEnd(date: string): string | undefined {
  if (!date) return undefined;
  return new Date(`${date}T23:59:59.999Z`).toISOString();
}

export default function WalletsListPage() {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [ownerType, setOwnerType] = useState('');
  const [currency, setCurrency] = useState('');
  const [status, setStatus] = useState('');
  const [balanceMin, setBalanceMin] = useState('');
  const [balanceMax, setBalanceMax] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const dateRangeError =
    dateFrom && dateTo && dateFrom > dateTo
      ? '"Updated from" must be on or before "Updated to"'
      : '';
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawerWalletId, setDrawerWalletId] = useState<string | null>(null);
  const [bulkAdjustOpen, setBulkAdjustOpen] = useState(false);
  const [actionAnchor, setActionAnchor] = useState<{ el: HTMLElement; wallet: WalletDetail } | null>(null);

  const debouncedSearch = useDebounce(search);
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { can } = usePermissions();

  const listParams: WalletListParams = useMemo(
    () => ({
      page: page + 1,
      limit: rowsPerPage,
      search: debouncedSearch || undefined,
      ownerType: ownerType || undefined,
      currency: currency || undefined,
      status: status || undefined,
      balanceMin: balanceMin ? Number(balanceMin) : undefined,
      balanceMax: balanceMax ? Number(balanceMax) : undefined,
      updatedFrom: toIsoDateStart(dateFrom),
      updatedTo: toIsoDateEnd(dateTo),
    }),
    [page, rowsPerPage, debouncedSearch, ownerType, currency, status, balanceMin, balanceMax, dateFrom, dateTo],
  );

  const exportParams = useMemo(() => {
    const { page: _p, limit: _l, ...rest } = listParams;
    return rest;
  }, [listParams]);

  const { data: summary } = useQuery({
    queryKey: ['finance-summary'],
    queryFn: getFinanceSummary,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['finance-wallets', listParams],
    queryFn: () => listFinanceWallets(listParams),
    enabled: !dateRangeError,
  });

  const bulkMutation = useMutation({
    mutationFn: ({ ids, status: s }: { ids: string[]; status: 'active' | 'frozen' | 'closed' }) =>
      bulkUpdateWalletStatus(ids, s),
    onSuccess: (result) => {
      notify.success(`Updated ${result.updated} wallet(s)`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['finance-wallets'] });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
    },
    onError: (err) => notify.error(getApiErrorMessage(err)),
  });

  const exportMutation = useMutation({
    mutationFn: (params: Omit<WalletListParams, 'page' | 'limit'>) => exportFinanceWallets(params),
    onSuccess: (blob) => {
      downloadBlob(blob, `wallets-${new Date().toISOString().slice(0, 10)}.csv`);
      notify.success('Export downloaded');
    },
    onError: (err) => notify.error(getApiErrorMessage(err)),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status: s }: { id: string; status: 'active' | 'frozen' | 'closed' }) =>
      updateWalletStatus(id, s),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-wallets'] });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
      notify.success('Wallet status updated');
    },
    onError: (err) => notify.error(getApiErrorMessage(err)),
  });


  const columns: DataTableColumn<WalletDetail>[] = [
    {
      id: 'owner',
      label: 'Owner',
      width: '22%',
      render: (w) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
          <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: 'primary.main' }}>
            {ownerInitials(w.ownerLabel)}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
              {w.ownerLabel}
            </Typography>
            {w.user?.email && (
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {w.user.email}
              </Typography>
            )}
          </Box>
        </Box>
      ),
    },
    {
      id: 'walletId',
      label: 'Wallet ID',
      width: '10%',
      render: (w) => (
        <Tooltip title={w.id}>
          <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
            {shortWalletId(w.id)}
          </Typography>
        </Tooltip>
      ),
    },
    {
      id: 'type',
      label: 'Owner type',
      width: '9%',
      render: (w) => <Chip size="small" label={formatLabel(w.ownerType)} variant="outlined" />,
    },
    {
      id: 'currency',
      label: 'Currency',
      width: '7%',
      render: (w) => (
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {w.currency}
        </Typography>
      ),
    },
    {
      id: 'available',
      label: 'Available',
      width: '11%',
      align: 'right',
      render: (w) => (
        <Typography variant="body2" sx={{ fontWeight: 700, color: balanceColor(w.availableBalance ?? w.balance) }}>
          {formatWalletMoney(w.availableBalance ?? w.balance, w.currency)}
        </Typography>
      ),
    },
    {
      id: 'pending',
      label: 'Pending',
      width: '10%',
      align: 'right',
      render: (w) => (
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            color: (w.pendingBalance ?? 0) > 0 ? FINANCE_COLORS.warning : FINANCE_COLORS.zero,
          }}
        >
          {formatWalletMoney(w.pendingBalance ?? 0, w.currency)}
        </Typography>
      ),
    },
    {
      id: 'lastTx',
      label: 'Last transaction',
      width: '14%',
      render: (w) =>
        w.lastTransaction ? (
          <Box>
            <Typography variant="body2" noWrap>
              {formatLabel(w.lastTransaction.type)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatDate(w.lastTransaction.createdAt)}
            </Typography>
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            —
          </Typography>
        ),
    },
    {
      id: 'status',
      label: 'Status',
      width: '12%',
      nowrap: false,
      render: (w) => (
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
          {w.ownerStatus ? (
            <Chip
              size="small"
              label={formatLabel(w.ownerStatus)}
              color={accountStatusChipColor(w.ownerStatus)}
            />
          ) : (
            <Chip size="small" label={formatLabel(w.status)} color={walletStatusChipColor(w.status)} />
          )}
          {w.ownerStatus && w.status !== 'active' && (
            <Chip
              size="small"
              variant="outlined"
              label={formatLabel(w.status)}
              color={walletStatusChipColor(w.status)}
            />
          )}
        </Stack>
      ),
    },
    {
      id: 'actions',
      label: 'Actions',
      width: '48px',
      align: 'center',
      nowrap: false,
      render: (w) => (
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            setActionAnchor({ el: e.currentTarget, wallet: w });
          }}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  const handleBulkExport = () => {
    const ids = Array.from(selectedIds).join(',');
    exportMutation.mutate({ ...exportParams, ids });
  };

  return (
    <>
      <PageHeader
        title="Wallet Management"
        subtitle="Search, filter, and manage wallet accounts. Summary metrics are on Finance overview."
        actions={
          <Stack direction="row" spacing={1}>
            {can('export_finance_reports') && (
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={() => exportMutation.mutate(exportParams)}
                disabled={exportMutation.isPending}
              >
                Export
              </Button>
            )}
          </Stack>
        }
      />

      <Box
        sx={{
          mb: 2,
          p: 2,
          bgcolor: 'background.paper',
          borderRadius: 3,
          border: 1,
          borderColor: 'divider',
        }}
      >
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: filtersOpen ? 2 : 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <FilterListIcon fontSize="small" color="action" />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Filters
            </Typography>
          </Stack>
          <IconButton size="small" onClick={() => setFiltersOpen((v) => !v)}>
            <FilterListIcon />
          </IconButton>
        </Stack>
        <Collapse in={filtersOpen}>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="Search"
              placeholder="Owner, email, wallet ID…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              sx={{ minWidth: 220 }}
            />
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel id="flt-owner-type">Owner type</InputLabel>
              <Select
                labelId="flt-owner-type"
                label="Owner type"
                value={ownerType}
                onChange={(e) => {
                  setOwnerType(e.target.value);
                  setPage(0);
                }}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="user">User</MenuItem>
                <MenuItem value="fleet">Fleet</MenuItem>
                <MenuItem value="platform">Platform</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 110 }}>
              <InputLabel id="flt-currency">Currency</InputLabel>
              <Select
                labelId="flt-currency"
                label="Currency"
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value);
                  setPage(0);
                }}
              >
                <MenuItem value="">All</MenuItem>
                {(summary?.balancesByCurrency ?? []).map((c) => (
                  <MenuItem key={c.currency} value={c.currency}>
                    {c.currency}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel id="flt-status">Status</InputLabel>
              <Select
                labelId="flt-status"
                label="Status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(0);
                }}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="frozen">Frozen</MenuItem>
                <MenuItem value="closed">Closed</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Min balance"
              type="number"
              value={balanceMin}
              onChange={(e) => {
                setBalanceMin(e.target.value);
                setPage(0);
              }}
              sx={{ width: 120 }}
            />
            <TextField
              size="small"
              label="Max balance"
              type="number"
              value={balanceMax}
              onChange={(e) => {
                setBalanceMax(e.target.value);
                setPage(0);
              }}
              sx={{ width: 120 }}
            />
            <TextField
              size="small"
              label="Updated from"
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(0);
              }}
              error={Boolean(dateRangeError)}
              helperText={dateRangeError || undefined}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ width: 150 }}
            />
            <TextField
              size="small"
              label="Updated to"
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(0);
              }}
              error={Boolean(dateRangeError)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ width: 150 }}
            />
          </Box>
        </Collapse>
      </Box>

      {selectedIds.size > 0 && (
        <Box
          sx={{
            mb: 2,
            p: 1.5,
            px: 2,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {selectedIds.size} wallet{selectedIds.size > 1 ? 's' : ''} selected
          </Typography>
          <Stack direction="row" spacing={1}>
            {can('approve_wallet_adjustments') && (
              <>
                <Button
                  size="small"
                  variant="contained"
                  color="warning"
                  startIcon={<AcUnitIcon />}
                  onClick={() => bulkMutation.mutate({ ids: Array.from(selectedIds), status: 'frozen' })}
                  disabled={bulkMutation.isPending}
                  sx={{ bgcolor: 'rgba(255,255,255,0.15)', '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' } }}
                >
                  Freeze
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<PlayArrowIcon />}
                  onClick={() => bulkMutation.mutate({ ids: Array.from(selectedIds), status: 'active' })}
                  disabled={bulkMutation.isPending}
                  sx={{ bgcolor: 'rgba(255,255,255,0.15)', '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' } }}
                >
                  Activate
                </Button>
              </>
            )}
            {can('manage_wallet_adjustments') && (
              <Button
                size="small"
                variant="contained"
                onClick={() => setBulkAdjustOpen(true)}
                sx={{ bgcolor: 'rgba(255,255,255,0.15)', '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' } }}
              >
                Manual adjustment
              </Button>
            )}
            {can('export_finance_reports') && (
              <Button
                size="small"
                variant="contained"
                startIcon={<DownloadIcon />}
                onClick={handleBulkExport}
                disabled={exportMutation.isPending}
                sx={{ bgcolor: 'rgba(255,255,255,0.15)', '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' } }}
              >
                Export
              </Button>
            )}
          </Stack>
        </Box>
      )}

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(w) => w.id}
        page={page}
        rowsPerPage={rowsPerPage}
        total={data?.pagination.total ?? 0}
        onPageChange={setPage}
        onRowsPerPageChange={(n) => {
          setRowsPerPage(n);
          setPage(0);
        }}
        loading={isLoading}
        onRowClick={(w) => setDrawerWalletId(w.id)}
        selectable={can('approve_wallet_adjustments')}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
      />

      <Menu
        anchorEl={actionAnchor?.el}
        open={Boolean(actionAnchor)}
        onClose={() => setActionAnchor(null)}
      >
        <MenuItem
          onClick={() => {
            setDrawerWalletId(actionAnchor!.wallet.id);
            setActionAnchor(null);
          }}
        >
          View details
        </MenuItem>
        <MenuItem
          component={RouterLink}
          to={`/finance/wallets/${actionAnchor?.wallet.id}`}
          onClick={() => setActionAnchor(null)}
        >
          Full page
        </MenuItem>
        {can('manage_wallet_adjustments') && (
          <MenuItem
            onClick={() => {
              setDrawerWalletId(actionAnchor!.wallet.id);
              setActionAnchor(null);
            }}
          >
            Adjust balance
          </MenuItem>
        )}
        {can('approve_wallet_adjustments') && actionAnchor?.wallet.status !== 'frozen' && (
          <MenuItem
            onClick={() => {
              statusMutation.mutate({ id: actionAnchor!.wallet.id, status: 'frozen' });
              setActionAnchor(null);
            }}
          >
            Freeze
          </MenuItem>
        )}
      </Menu>

      <WalletDetailDrawer
        walletId={drawerWalletId}
        open={Boolean(drawerWalletId)}
        onClose={() => setDrawerWalletId(null)}
      />
      <BulkAdjustmentDialog
        open={bulkAdjustOpen}
        walletIds={Array.from(selectedIds)}
        onClose={() => setBulkAdjustOpen(false)}
        onSuccess={() => setSelectedIds(new Set())}
      />
    </>
  );
}
