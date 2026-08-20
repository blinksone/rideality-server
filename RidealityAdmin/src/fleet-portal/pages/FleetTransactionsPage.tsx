import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Box } from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { getFleetDashboard, listFleetWalletTransactions } from '@/api/fleet.api';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import FleetContentCard from '@/fleet-portal/components/FleetContentCard';
import FleetMetricCard from '@/fleet-portal/components/FleetMetricCard';
import FleetMetricRow, { FleetMetricCell } from '@/fleet-portal/components/FleetMetricRow';
import FleetPageHero from '@/fleet-portal/components/FleetPageHero';
import type { WalletTransaction } from '@/api/types';
import { formatDate, formatLabel } from '@/utils/format';

export default function FleetTransactionsPage() {
  const { companyId = '' } = useParams();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const { data: dash } = useQuery({
    queryKey: ['fleet-dashboard', companyId],
    queryFn: () => getFleetDashboard(companyId),
    enabled: Boolean(companyId),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['fleet-wallet-transactions', companyId, page, rowsPerPage],
    queryFn: () => listFleetWalletTransactions(companyId, { page: page + 1, limit: rowsPerPage }),
    enabled: Boolean(companyId),
  });

  const fmt = (n: number) =>
    `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${dash?.currency ?? ''}`.trim();

  const columns: DataTableColumn<WalletTransaction>[] = [
    { id: 'type', label: 'Type', render: (t) => formatLabel(t.type) },
    { id: 'amount', label: 'Amount', render: (t) => `${t.amount} ${t.currency}` },
    { id: 'balance', label: 'Balance after', render: (t) => `${t.balanceAfter} ${t.currency}` },
    { id: 'description', label: 'Description', render: (t) => t.description ?? '—' },
    { id: 'date', label: 'Date', render: (t) => formatDate(t.createdAt) },
  ];

  return (
    <Box>
      <FleetPageHero
        badge="Ledger"
        title="Transactions"
        description="Full wallet transaction history with balance tracking for your fleet account."
      />
      <FleetMetricRow>
        <FleetMetricCell>
          <FleetMetricCard
            label="Total transactions"
            value={data?.pagination.total ?? 0}
            icon={<ReceiptLongIcon fontSize="small" />}
            accent="blue"
          />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard label="Wallet balance" value={fmt(dash?.walletBalance ?? 0)} accent="emerald" />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard label="Today's revenue" value={fmt(dash?.todayRevenue ?? 0)} accent="indigo" />
        </FleetMetricCell>
      </FleetMetricRow>
      <FleetContentCard title="Transaction log" subtitle="Paginated wallet movements">
        <DataTable
          columns={columns}
          rows={data?.data ?? []}
          rowKey={(t) => t.id}
          page={page}
          rowsPerPage={rowsPerPage}
          total={data?.pagination.total ?? 0}
          onPageChange={setPage}
          onRowsPerPageChange={(n) => {
            setRowsPerPage(n);
            setPage(0);
          }}
          loading={isLoading}
          paperSx={{ border: 0, boxShadow: 'none' }}
        />
      </FleetContentCard>
    </Box>
  );
}
