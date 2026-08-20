import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  TextField,
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { listFleetDocuments, reviewFleetDocument } from '@/api/fleet.api';
import { getApiErrorMessage } from '@/api/client';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import FleetContentCard from '@/fleet-portal/components/FleetContentCard';
import FleetFilters, { type FleetFilterValues } from '@/fleet-portal/components/FleetFilters';
import FleetMetricCard from '@/fleet-portal/components/FleetMetricCard';
import FleetMetricRow, { FleetMetricCell } from '@/fleet-portal/components/FleetMetricRow';
import FleetPageHero from '@/fleet-portal/components/FleetPageHero';
import { useActiveFleetMembership, useFleetAccessTier } from '@/hooks/useFleetPortalMode';
import { useNotify } from '@/services/notification';
import { formatDate, formatLabel } from '@/utils/format';
import type { FleetDocument } from '@/api/fleet.api';

const DOC_STATUS_COLOR: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'error',
  expired: 'default',
};

export default function FleetDocumentsPage() {
  const { companyId = '' } = useParams();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const membership = useActiveFleetMembership(companyId);
  const tier = useFleetAccessTier(companyId);
  const canReview = tier === 'regional' || tier === 'owner';
  const cityName = membership?.fleetRegionName;
  const [filters, setFilters] = useState<FleetFilterValues>({ search: '', status: '', from: '', to: '' });
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<FleetDocument | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const params = useMemo(
    () => ({
      status: filters.status || undefined,
      search: filters.search || undefined,
      expiringWithinDays: expiringOnly ? 30 : undefined,
    }),
    [filters, expiringOnly],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['fleet-documents', companyId, params],
    queryFn: () => listFleetDocuments(companyId, params),
    enabled: Boolean(companyId),
  });

  const reviewMutation = useMutation({
    mutationFn: ({
      documentId,
      status,
      reason,
    }: {
      documentId: string;
      status: 'approved' | 'rejected';
      reason?: string;
    }) => reviewFleetDocument(companyId, documentId, { status, rejectionReason: reason }),
    onSuccess: () => {
      notify.success('Document updated');
      queryClient.invalidateQueries({ queryKey: ['fleet-documents', companyId] });
      setRejectTarget(null);
      setRejectionReason('');
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const columns: DataTableColumn<FleetDocument>[] = [
    { id: 'driver', label: 'Driver', render: (d) => d.driverName ?? '—' },
    { id: 'type', label: 'Type', render: (d) => formatLabel(d.type) },
    {
      id: 'status',
      label: 'Status',
      render: (d) => (
        <Chip size="small" label={formatLabel(d.status)} color={DOC_STATUS_COLOR[d.status] ?? 'default'} />
      ),
    },
    { id: 'expires', label: 'Expires', render: (d) => (d.expiresAt ? formatDate(d.expiresAt) : '—') },
    { id: 'submitted', label: 'Submitted', render: (d) => formatDate(d.submittedAt) },
    {
      id: 'file',
      label: 'File',
      render: (d) => (
        <Link href={d.fileUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
          View
        </Link>
      ),
    },
    ...(canReview
      ? [
          {
            id: 'actions',
            label: 'Actions',
            align: 'right' as const,
            nowrap: false,
            minWidth: 180,
            width: 180,
            render: (d: FleetDocument) =>
              d.status.toLowerCase() === 'pending' ? (
                <Box sx={{ display: 'inline-flex', gap: 1, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => reviewMutation.mutate({ documentId: d.id, status: 'approved' })}
                    disabled={reviewMutation.isPending}
                  >
                    Approve
                  </Button>
                  <Button size="small" color="error" onClick={() => setRejectTarget(d)}>
                    Reject
                  </Button>
                </Box>
              ) : null,
          } satisfies DataTableColumn<FleetDocument>,
        ]
      : []),
  ];

  const docs = data?.documents ?? [];
  const stats = useMemo(
    () => ({
      total: data?.total ?? docs.length,
      pending: docs.filter((d) => d.status.toLowerCase() === 'pending').length,
      approved: docs.filter((d) => d.status.toLowerCase() === 'approved').length,
    }),
    [data, docs],
  );

  return (
    <Box>
      <FleetPageHero
        badge={cityName ? `City · ${cityName}` : 'Compliance'}
        title={cityName ? `Documents · ${cityName}` : 'Driver documents'}
        description={
          canReview
            ? 'Approve or reject verification documents for drivers in your city. Open the file, then approve or reject with a reason.'
            : 'View driver verification documents. Approve and reject is limited to fleet owner and regional fleet.'
        }
      />
      {!canReview && tier === 'support' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          You can view documents. Approve and reject is limited to fleet owner and regional fleet for this city.
        </Alert>
      )}
      {canReview && !cityName && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Your account is not linked to a city. Ask the fleet owner to assign you to a city so documents are scoped correctly.
        </Alert>
      )}
      <FleetMetricRow>
        <FleetMetricCell>
          <FleetMetricCard label="Total documents" value={stats.total} icon={<FolderIcon fontSize="small" />} accent="blue" />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard label="Pending review" value={stats.pending} icon={<PendingActionsIcon fontSize="small" />} accent="amber" />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard label="Approved" value={stats.approved} icon={<CheckCircleIcon fontSize="small" />} accent="emerald" />
        </FleetMetricCell>
      </FleetMetricRow>
      <FleetFilters
        values={filters}
        onChange={(next) => setFilters((f) => ({ ...f, ...next }))}
        statusOptions={[
          { value: 'pending', label: 'Pending' },
          { value: 'approved', label: 'Approved' },
          { value: 'rejected', label: 'Rejected' },
          { value: 'expired', label: 'Expired' },
        ]}
      />
      <Box sx={{ mb: 2 }}>
        <Chip
          label="Expiring within 30 days"
          color={expiringOnly ? 'warning' : 'default'}
          variant={expiringOnly ? 'filled' : 'outlined'}
          onClick={() => setExpiringOnly((v) => !v)}
          sx={{ cursor: 'pointer' }}
        />
      </Box>
      <FleetContentCard title="Document registry" subtitle="Filter by status or expiring documents">
        <DataTable
          columns={columns}
          rows={docs}
          rowKey={(d) => d.id}
          page={0}
          rowsPerPage={Math.max(docs.length, 10)}
          total={data?.total ?? 0}
          onPageChange={() => {}}
          onRowsPerPageChange={() => {}}
          loading={isLoading}
          paperSx={{ border: 0, boxShadow: 'none' }}
        />
      </FleetContentCard>

      <Dialog open={Boolean(rejectTarget)} onClose={() => setRejectTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Reject document</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={3}
            label="Rejection reason"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value.slice(0, 500))}
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectTarget(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={rejectionReason.trim().length < 3 || reviewMutation.isPending}
            onClick={() =>
              rejectTarget &&
              reviewMutation.mutate({
                documentId: rejectTarget.id,
                status: 'rejected',
                reason: rejectionReason.trim(),
              })
            }
          >
            Reject
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
