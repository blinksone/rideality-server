import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, Chip, TextField, Tooltip, Typography } from '@mui/material';
import { listAuditLogs } from '@/api/audit.api';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import PageHeader from '@/components/PageHeader';
import { useDebounce } from '@/hooks/useDebounce';
import type { GlobalAuditLogEntry } from '@/api/types';
import { formatDate } from '@/utils/format';

function actionColor(action: string): 'default' | 'success' | 'warning' | 'error' | 'info' {
  if (action.endsWith('.delete') || action.includes('revoke') || action.includes('remove')) {
    return 'error';
  }
  if (action.endsWith('.create') || action.includes('assign')) return 'success';
  if (action.endsWith('.update')) return 'info';
  return 'default';
}

function renderDetails(details: unknown): string {
  if (!details || typeof details !== 'object') return '—';
  const entries = Object.entries(details as Record<string, unknown>);
  if (entries.length === 0) return '—';
  return entries
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(', ');
}

export default function AuditLogPage() {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [action, setAction] = useState('');
  const debouncedAction = useDebounce(action);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, rowsPerPage, debouncedAction],
    queryFn: () =>
      listAuditLogs({
        page: page + 1,
        limit: rowsPerPage,
        action: debouncedAction || undefined,
      }),
  });

  const columns: DataTableColumn<GlobalAuditLogEntry>[] = [
    {
      id: 'action',
      label: 'Action',
      width: '16%',
      render: (r) => <Chip size="small" label={r.action} color={actionColor(r.action)} />,
    },
    { id: 'actorName', label: 'Actor', width: '16%', render: (r) => r.actorName ?? '—' },
    { id: 'targetName', label: 'Target', width: '16%', render: (r) => r.targetName ?? '—' },
    {
      id: 'details',
      label: 'Details',
      width: '28%',
      nowrap: false,
      render: (r) => (
        <Tooltip title={renderDetails(r.details)}>
          <Typography variant="body2" sx={{ maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {renderDetails(r.details)}
          </Typography>
        </Tooltip>
      ),
    },
    { id: 'ipAddress', label: 'IP', width: '10%', render: (r) => r.ipAddress ?? '—' },
    { id: 'createdAt', label: 'Time', width: '14%', render: (r) => formatDate(r.createdAt) },
  ];

  return (
    <>
      <PageHeader
        badge="Security"
        title="Audit log"
        subtitle="Every administrative action — role, permission, user, and finance changes — with actor, IP, and timestamp."
      />

      <Box sx={{ mb: 2 }}>
        <TextField
          size="small"
          label="Filter by action"
          placeholder="e.g. role.delete"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(0);
          }}
        />
      </Box>

      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(r) => r.id}
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
    </>
  );
}
