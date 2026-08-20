import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Box, Chip } from '@mui/material';
import PaidIcon from '@mui/icons-material/Paid';
import ScheduleIcon from '@mui/icons-material/Schedule';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { listFleetPayouts } from '@/api/fleet.api';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import FleetContentCard from '@/fleet-portal/components/FleetContentCard';
import FleetMetricCard from '@/fleet-portal/components/FleetMetricCard';
import FleetMetricRow, { FleetMetricCell } from '@/fleet-portal/components/FleetMetricRow';
import FleetPageHero from '@/fleet-portal/components/FleetPageHero';
import type { FinancePayout } from '@/api/types';
import { formatDate, formatLabel } from '@/utils/format';

export default function FleetPayoutsPage() {
  const { companyId = '' } = useParams();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const { data, isLoading } = useQuery({
    queryKey: ['fleet-payouts', companyId, page, rowsPerPage],
    queryFn: () => listFleetPayouts(companyId, { page: page + 1, limit: rowsPerPage }),
    enabled: Boolean(companyId),
  });

  const rows = data?.data ?? [];
  const stats = useMemo(
    () => ({
      total: data?.pagination.total ?? 0,
      pending: rows.filter((p) => p.status === 'pending').length,
      completed: rows.filter((p) => p.status === 'completed').length,
    }),
    [data, rows],
  );

  const columns: DataTableColumn<FinancePayout>[] = [
    { id: 'amount', label: 'Amount', render: (p) => `${p.amount} ${p.currency}` },
    { id: 'bank', label: 'Bank', render: (p) => p.bankName ?? '—' },
    {
      id: 'status',
      label: 'Status',
      render: (p) => (
        <Chip
          size="small"
          label={formatLabel(p.status)}
          color={p.status === 'pending' ? 'warning' : p.status === 'completed' ? 'success' : 'default'}
        />
      ),
    },
    { id: 'created', label: 'Requested', render: (p) => formatDate(p.createdAt) },
  ];

  return (
    <Box>
      <FleetPageHero
        badge="Payouts"
        title="Payout requests"
        description="Track withdrawal requests and payout status for your fleet wallet."
      />
      <FleetMetricRow>
        <FleetMetricCell>
          <FleetMetricCard label="Total payouts" value={stats.total} icon={<PaidIcon fontSize="small" />} accent="blue" />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard label="Pending" value={stats.pending} icon={<ScheduleIcon fontSize="small" />} accent="amber" />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard label="Completed" value={stats.completed} icon={<CheckCircleIcon fontSize="small" />} accent="emerald" />
        </FleetMetricCell>
      </FleetMetricRow>
      <FleetContentCard title="Payout history" subtitle="All payout requests for this fleet">
        <DataTable
          columns={columns}
          rows={rows}
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
          paperSx={{ border: 0, boxShadow: 'none' }}
        />
      </FleetContentCard>
    </Box>
  );
}
