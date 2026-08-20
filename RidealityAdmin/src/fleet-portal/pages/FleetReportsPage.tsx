import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import {
  Box,
  Card,
  MenuItem,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import RouteIcon from '@mui/icons-material/Route';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  downloadFleetExport,
  getFleetReports,
  listFleetAuditLogs,
} from '@/api/fleet.api';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import FleetContentCard from '@/fleet-portal/components/FleetContentCard';
import FleetMetricCard from '@/fleet-portal/components/FleetMetricCard';
import FleetMetricRow, { FleetMetricCell } from '@/fleet-portal/components/FleetMetricRow';
import FleetPageHero from '@/fleet-portal/components/FleetPageHero';
import { useFleetAccessTier } from '@/hooks/useFleetPortalMode';
import { formatDate, formatLabel } from '@/utils/format';
import type { FleetAuditLog } from '@/api/fleet.api';

export default function FleetReportsPage() {
  const { companyId = '' } = useParams();
  const isOwner = useFleetAccessTier(companyId) === 'owner';
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState(0);
  const [auditPage, setAuditPage] = useState(0);
  const [auditRows, setAuditRows] = useState(20);
  const auditTab = isOwner ? 0 : 1;
  const exportTab = isOwner ? 1 : 2;

  const { data, isLoading } = useQuery({
    queryKey: ['fleet-reports', companyId, days],
    queryFn: () => getFleetReports(companyId, { days }),
    enabled: Boolean(companyId),
  });

  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ['fleet-audit-logs', companyId, auditPage, auditRows],
    queryFn: () => listFleetAuditLogs(companyId, { page: auditPage + 1, limit: auditRows }),
    enabled: Boolean(companyId) && tab === auditTab,
  });

  const driverColumns: DataTableColumn<NonNullable<typeof data>['topDrivers'][number]>[] = [
    { id: 'driver', label: 'Driver', render: (r) => r.driverName },
    { id: 'trips', label: 'Trips', render: (r) => r.trips },
    { id: 'revenue', label: 'Revenue', render: (r) => `${r.revenue} ${data?.currency ?? ''}` },
    { id: 'distance', label: 'Distance', render: (r) => `${r.distanceKm} km` },
  ];

  const auditColumns: DataTableColumn<FleetAuditLog>[] = [
    { id: 'action', label: 'Action', render: (r) => formatLabel(r.action.replace(/\./g, ' ')) },
    { id: 'actor', label: 'Actor', render: (r) => r.actorName ?? '—' },
    { id: 'date', label: 'When', render: (r) => formatDate(r.createdAt) },
  ];

  const periodRevenue = data?.daily.reduce((s, d) => s + d.revenue, 0) ?? 0;
  const periodTrips = data?.daily.reduce((s, d) => s + d.trips, 0) ?? 0;

  return (
    <Box>
      <FleetPageHero
        badge="Analytics"
        title="Fleet reports"
        description="Performance trends, top drivers, audit logs, and downloadable exports."
        actions={
          <TextField
            select
            size="small"
            label="Period"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            sx={{ minWidth: 140, bgcolor: 'rgba(255,255,255,0.1)', borderRadius: 2 }}
            slotProps={{ input: { sx: { color: '#fff' } }, inputLabel: { sx: { color: 'rgba(255,255,255,0.7)' } } }}
          >
            <MenuItem value={7}>7 days</MenuItem>
            <MenuItem value={30}>30 days</MenuItem>
            <MenuItem value={90}>90 days</MenuItem>
          </TextField>
        }
      />

      <FleetMetricRow>
        <FleetMetricCell>
          <FleetMetricCard
            label="Period revenue"
            value={isLoading ? '…' : `${periodRevenue.toLocaleString()} ${data?.currency ?? ''}`}
            icon={<TrendingUpIcon fontSize="small" />}
            accent="emerald"
          />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard
            label="Period trips"
            value={isLoading ? '…' : periodTrips}
            icon={<RouteIcon fontSize="small" />}
            accent="blue"
          />
        </FleetMetricCell>
        {!isOwner && (
        <FleetMetricCell>
          <FleetMetricCard
            label="Expiring documents"
            value={isLoading ? '…' : (data?.expiringDocuments ?? 0)}
            icon={<WarningAmberIcon fontSize="small" />}
            accent="amber"
          />
        </FleetMetricCell>
        )}
      </FleetMetricRow>

      <FleetContentCard title="Revenue trend" subtitle={`Last ${days} days`}>
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5, height: 140, overflowX: 'auto' }}>
          {(data?.daily ?? []).map((bar) => {
            const max = Math.max(...(data?.daily.map((b) => b.revenue) ?? [1]), 1);
            const h = Math.max(6, (bar.revenue / max) * 120);
            return (
              <Box key={bar.date} sx={{ minWidth: 28, textAlign: 'center' }}>
                <Box
                  sx={{
                    height: h,
                    borderRadius: 2,
                    mb: 0.5,
                    background: 'linear-gradient(180deg, #2563EB 0%, #4F46E5 100%)',
                  }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: 10 }}>
                  {bar.date.slice(8)}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </FleetContentCard>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        {!isOwner && <Tab label="Top drivers" />}
        <Tab label="Audit log" />
        <Tab label="Exports" />
      </Tabs>

      {!isOwner && tab === 0 && (
        <FleetContentCard title="Top drivers" subtitle="Highest revenue drivers in period">
          <DataTable
            columns={driverColumns}
            rows={data?.topDrivers ?? []}
            rowKey={(r) => r.driverUserId}
            page={0}
            rowsPerPage={10}
            total={data?.topDrivers.length ?? 0}
            onPageChange={() => {}}
            onRowsPerPageChange={() => {}}
            loading={isLoading}
            paperSx={{ border: 0, boxShadow: 'none' }}
          />
        </FleetContentCard>
      )}

      {tab === auditTab && (
        <FleetContentCard title="Audit log" subtitle="Fleet activity and change history">
          <DataTable
            columns={auditColumns}
            rows={auditData?.data ?? []}
            rowKey={(r) => r.id}
            page={auditPage}
            rowsPerPage={auditRows}
            total={auditData?.pagination.total ?? 0}
            onPageChange={setAuditPage}
            onRowsPerPageChange={(n) => {
              setAuditRows(n);
              setAuditPage(0);
            }}
            loading={auditLoading}
            paperSx={{ border: 0, boxShadow: 'none' }}
          />
        </FleetContentCard>
      )}

      {tab === exportTab && (
        <FleetContentCard title="Download reports" subtitle="Export fleet data as CSV">
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Card
              variant="outlined"
              sx={{ p: 2, minWidth: 220, cursor: 'pointer' }}
              onClick={() => downloadFleetExport(companyId, 'trips')}
            >
              <Typography sx={{ fontWeight: 600 }}>Trips CSV</Typography>
              <Typography variant="body2" color="text.secondary">
                Full trip history export
              </Typography>
            </Card>
            <Card
              variant="outlined"
              sx={{ p: 2, minWidth: 220, cursor: 'pointer' }}
              onClick={() => downloadFleetExport(companyId, 'wallet-statement')}
            >
              <Typography sx={{ fontWeight: 600 }}>Wallet statement</Typography>
              <Typography variant="body2" color="text.secondary">
                Transaction ledger CSV
              </Typography>
            </Card>
          </Box>
        </FleetContentCard>
      )}
    </Box>
  );
}
