import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Chip,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { getFinanceSummary } from '@/api/finance.api';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import { balanceColor, FINANCE_COLORS, formatWalletMoney } from '@/modules/finance/utils/walletUi';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import PaidIcon from '@mui/icons-material/Paid';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';

function formatMoney(amount: number, currency?: string) {
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return currency ? `${formatted} ${currency}` : formatted;
}

export default function FinanceDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['finance-summary'],
    queryFn: getFinanceSummary,
  });

  const totalWallets = data?.totalWallets ?? data?.walletsByType.reduce((sum, row) => sum + row.count, 0) ?? 0;
  const balancesByCurrency = data?.balancesByCurrency ?? [];
  const volumeByCurrency = data?.volumeByCurrency ?? [];
  const currencyCount = balancesByCurrency.length;

  return (
    <>
      <PageHeader
        title="Finance"
        subtitle="Wallet balances, pending approvals, and platform money flow."
      />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
          <StatCard
            title="Total wallets"
            value={isLoading ? '…' : totalWallets}
            icon={<AccountBalanceWalletIcon fontSize="small" />}
            color={FINANCE_COLORS.primary}
            to="/finance/wallets"
            component={RouterLink}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
          <StatCard
            title="Currencies"
            value={isLoading ? '…' : currencyCount}
            subtitle={currencyCount === 1 ? balancesByCurrency[0]?.currency : 'Active currency pools'}
            icon={<TrendingUpIcon fontSize="small" />}
            color={FINANCE_COLORS.positive}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
          <StatCard
            title="Negative wallets"
            value={isLoading ? '…' : (data?.negativeWallets ?? 0)}
            icon={<TrendingDownIcon fontSize="small" />}
            color={FINANCE_COLORS.danger}
            to="/finance/wallets"
            component={RouterLink}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
          <StatCard
            title="Frozen wallets"
            value={isLoading ? '…' : (data?.frozenWalletCount ?? 0)}
            subtitle={
              data?.frozenWalletCount ? 'Accounts with frozen status' : undefined
            }
            icon={<AcUnitIcon fontSize="small" />}
            color={FINANCE_COLORS.warning}
            to="/finance/wallets"
            component={RouterLink}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
          <StatCard
            title="Pending adjustments"
            value={isLoading ? '…' : (data?.pendingAdjustments ?? 0)}
            icon={<PendingActionsIcon fontSize="small" />}
            color={FINANCE_COLORS.warning}
            to="/finance/adjustments"
            component={RouterLink}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
          <StatCard
            title="Pending payouts"
            value={isLoading ? '…' : (data?.pendingPayouts ?? 0)}
            icon={<PaidIcon fontSize="small" />}
            color={FINANCE_COLORS.warning}
            to="/finance/payouts"
            component={RouterLink}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
          <StatCard
            title="Today's transactions"
            value={isLoading ? '…' : (data?.todayTransactionCount ?? 0)}
            icon={<ReceiptLongIcon fontSize="small" />}
            color={FINANCE_COLORS.primary}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
          <StatCard
            title="24h transaction volume"
            value={isLoading ? '…' : formatMoney(data?.last24hTransactionVolume ?? 0)}
            subtitle="Mixed-currency sum"
            icon={<TrendingUpIcon fontSize="small" />}
            color={FINANCE_COLORS.primary}
          />
        </Grid>
      </Grid>

      <Alert severity="info" sx={{ mt: 3, mb: 2 }}>
        Balances and volume are shown per currency. Do not add different currencies together — they
        are not converted to a single FX rate.
      </Alert>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper variant="outlined" sx={{ overflow: 'hidden', borderRadius: 3 }}>
            <Box
              sx={{
                px: 2,
                py: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2,
                flexWrap: 'wrap',
                borderBottom: 1,
                borderColor: 'divider',
              }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Balances by currency
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Not FX-converted
              </Typography>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Currency</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      Wallets
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      Total balance
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={3}>Loading…</TableCell>
                    </TableRow>
                  ) : balancesByCurrency.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3}>No wallets</TableCell>
                    </TableRow>
                  ) : (
                    balancesByCurrency.map((row) => (
                      <TableRow key={row.currency} hover>
                        <TableCell>
                          <Chip size="small" label={row.currency} variant="outlined" />
                        </TableCell>
                        <TableCell align="right">{row.count}</TableCell>
                        <TableCell
                          align="right"
                          sx={{ fontWeight: 700, color: balanceColor(row.totalBalance) }}
                        >
                          {formatWalletMoney(row.totalBalance, row.currency)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper variant="outlined" sx={{ overflow: 'hidden', borderRadius: 3 }}>
            <Box
              sx={{
                px: 2,
                py: 1.5,
                borderBottom: 1,
                borderColor: 'divider',
              }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                24h volume by currency
              </Typography>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Currency</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      Volume
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={2}>Loading…</TableCell>
                    </TableRow>
                  ) : volumeByCurrency.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2}>No transactions in the last 24 hours</TableCell>
                    </TableRow>
                  ) : (
                    volumeByCurrency.map((row) => (
                      <TableRow key={row.currency} hover>
                        <TableCell>
                          <Chip size="small" label={row.currency} variant="outlined" />
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          {formatMoney(row.totalVolume, row.currency)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>
    </>
  );
}
