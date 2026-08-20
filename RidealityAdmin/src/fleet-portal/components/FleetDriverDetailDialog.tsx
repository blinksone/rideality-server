import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  Link,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { getFleetDriverDetail, type FleetDriverDetail } from '@/api/fleet.api';
import { getApiErrorMessage } from '@/api/client';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import { formatDate, formatLabel } from '@/utils/format';

function statusColor(status: string): 'default' | 'success' | 'warning' | 'error' {
  if (status === 'approved' || status === 'active') return 'success';
  if (status === 'pending_review' || status === 'draft' || status === 'pending') return 'warning';
  if (status === 'rejected') return 'error';
  return 'default';
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
        {value ?? '—'}
      </Typography>
    </Box>
  );
}

interface Props {
  open: boolean;
  companyId: string;
  driverUserId: string | null;
  onClose: () => void;
  onApprove?: (userId: string) => void;
  onReject?: (userId: string) => void;
  actionsPending?: boolean;
}

export default function FleetDriverDetailDialog({
  open,
  companyId,
  driverUserId,
  onClose,
  onApprove,
  onReject,
  actionsPending,
}: Props) {
  const [tab, setTab] = useState(0);

  const { data, isLoading, error } = useQuery({
    queryKey: ['fleet-driver-detail', companyId, driverUserId],
    queryFn: () => getFleetDriverDetail(companyId, driverUserId!),
    enabled: open && Boolean(companyId && driverUserId),
  });

  const canReview =
    data &&
    (data.onboardingStatus === 'pending_review' || data.onboardingStatus === 'draft');

  const vehicleColumns: DataTableColumn<FleetDriverDetail['vehicles'][number]>[] = [
    { id: 'plate', label: 'Plate', render: (v) => v.numberPlate },
    { id: 'model', label: 'Vehicle', render: (v) => `${formatLabel(v.vehicleType)} · ${v.model}` },
    { id: 'color', label: 'Color', render: (v) => v.color ?? '—' },
    { id: 'seats', label: 'Seats', render: (v) => v.availableSeats },
    {
      id: 'status',
      label: 'Status',
      render: (v) => (
        <Chip size="small" label={formatLabel(v.operationalStatus)} color={statusColor(v.operationalStatus)} />
      ),
    },
    { id: 'verified', label: 'Verified', render: (v) => (v.isVerified ? 'Yes' : 'No') },
  ];

  const txColumns: DataTableColumn<FleetDriverDetail['walletTransactions'][number]>[] = [
    { id: 'type', label: 'Type', render: (t) => formatLabel(t.type) },
    {
      id: 'amount',
      label: 'Amount',
      render: (t) => `${t.amount.toLocaleString()} ${t.currency}`,
    },
    { id: 'description', label: 'Description', render: (t) => t.description ?? '—' },
    {
      id: 'balance',
      label: 'Balance after',
      render: (t) => `${t.balanceAfter.toLocaleString()} ${t.currency}`,
    },
    { id: 'date', label: 'Date', render: (t) => formatDate(t.createdAt) },
  ];

  const tripColumns: DataTableColumn<FleetDriverDetail['trips'][number]>[] = [
    { id: 'id', label: 'Trip', render: (t) => t.id.slice(0, 8) },
    { id: 'status', label: 'Status', render: (t) => formatLabel(t.status) },
    { id: 'passenger', label: 'Passenger', render: (t) => t.passengerName ?? '—' },
    { id: 'fare', label: 'Fare', render: (t) => `${t.fare} ${t.currency}` },
    { id: 'date', label: 'Created', render: (t) => formatDate(t.createdAt) },
  ];

  const docColumns: DataTableColumn<FleetDriverDetail['documents'][number]>[] = [
    { id: 'type', label: 'Type', render: (d) => formatLabel(d.type) },
    {
      id: 'status',
      label: 'Status',
      render: (d) => (
        <Chip size="small" label={formatLabel(d.status)} color={statusColor(d.status)} />
      ),
    },
    { id: 'reason', label: 'Rejection reason', render: (d) => d.rejectionReason ?? '—' },
    { id: 'submitted', label: 'Submitted', render: (d) => formatDate(d.submittedAt) },
    {
      id: 'file',
      label: 'File',
      render: (d) =>
        d.fileUrl ? (
          <Link href={d.fileUrl} target="_blank" rel="noopener noreferrer">
            View
          </Link>
        ) : (
          '—'
        ),
    },
  ];

  const complaintColumns: DataTableColumn<FleetDriverDetail['complaints'][number]>[] = [
    { id: 'reason', label: 'Reason', render: (c) => c.reason },
    { id: 'reporter', label: 'Reporter', render: (c) => c.reporterName },
    { id: 'status', label: 'Status', render: (c) => formatLabel(c.status) },
    { id: 'date', label: 'When', render: (c) => formatDate(c.createdAt) },
  ];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle sx={{ pr: 6 }}>
        {isLoading ? 'Loading driver…' : data?.fullName ?? data?.phone ?? 'Driver details'}
      </DialogTitle>
      <DialogContent dividers sx={{ minHeight: 360 }}>
        {error ? (
          <Typography color="error">{getApiErrorMessage(error)}</Typography>
        ) : isLoading || !data ? (
          <Typography color="text.secondary">Loading…</Typography>
        ) : (
          <>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', mb: 2 }}>
              <Avatar src={data.photoUrl ?? undefined} sx={{ width: 56, height: 56 }}>
                {(data.fullName ?? data.phone).charAt(0).toUpperCase()}
              </Avatar>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6">{data.fullName ?? data.phone}</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                  <Chip
                    size="small"
                    label={formatLabel(data.onboardingStatus)}
                    color={statusColor(data.onboardingStatus)}
                  />
                  <Chip
                    size="small"
                    variant="outlined"
                    label={data.isOnline ? 'Online' : 'Offline'}
                    color={data.isOnline ? 'success' : 'default'}
                  />
                  {data.fleetRegionName && (
                    <Chip size="small" variant="outlined" label={data.fleetRegionName} />
                  )}
                </Box>
              </Box>
            </Box>

            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }} variant="scrollable">
              <Tab label="Overview" />
              <Tab label={`Vehicles (${data.vehicles.length})`} />
              <Tab label="Wallet" />
              <Tab label={`Trips (${data.tripCount})`} />
              <Tab label={`Documents (${data.documents.length})`} />
              <Tab label={`Complaints (${data.complaints.length})`} />
            </Tabs>

            {tab === 0 && (
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <DetailField label="Phone" value={data.phone} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <DetailField label="Email" value={data.email} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <DetailField label="Driver type" value={formatLabel(data.driverType)} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <DetailField label="Service modes" value={data.serviceModes.map(formatLabel).join(', ')} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <DetailField label="Total trips" value={data.totalRides} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <DetailField label="Distance (km)" value={data.totalDistanceKm.toLocaleString()} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <DetailField label="Active hours" value={data.activeHours.toLocaleString()} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <DetailField label="Joined" value={formatDate(data.joinedAt)} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <DetailField label="License number" value={data.licenseNumber} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <DetailField
                    label="License expiry"
                    value={data.licenseExpiry ? formatDate(data.licenseExpiry) : null}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <DetailField label="User ID" value={data.userId} />
                </Grid>
              </Grid>
            )}

            {tab === 1 && (
              <DataTable
                columns={vehicleColumns}
                rows={data.vehicles}
                rowKey={(v) => v.id}
                page={0}
                rowsPerPage={Math.max(data.vehicles.length, 5)}
                total={data.vehicles.length}
                onPageChange={() => undefined}
                onRowsPerPageChange={() => undefined}
                emptyMessage="No vehicle assigned to this driver"
                paperSx={{ border: 0, boxShadow: 'none' }}
              />
            )}

            {tab === 2 && (
              <Box>
                {data.wallet ? (
                  <>
                    <Grid container spacing={2} sx={{ mb: 2 }}>
                      <Grid size={{ xs: 12, sm: 4 }}>
                        <DetailField
                          label="Balance"
                          value={`${data.wallet.balance.toLocaleString()} ${data.wallet.currency}`}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 4 }}>
                        <DetailField label="Status" value={formatLabel(data.wallet.status)} />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 4 }}>
                        <DetailField label="Wallet ID" value={data.wallet.id} />
                      </Grid>
                    </Grid>
                    <Divider sx={{ mb: 2 }} />
                    <Typography variant="subtitle2" gutterBottom>
                      Recent transactions
                    </Typography>
                    <DataTable
                      columns={txColumns}
                      rows={data.walletTransactions}
                      rowKey={(t) => t.id}
                      page={0}
                      rowsPerPage={Math.max(data.walletTransactions.length, 5)}
                      total={data.walletTransactions.length}
                      onPageChange={() => undefined}
                      onRowsPerPageChange={() => undefined}
                      emptyMessage="No wallet transactions yet"
                      paperSx={{ border: 0, boxShadow: 'none' }}
                    />
                  </>
                ) : (
                  <Typography color="text.secondary">This driver has no wallet yet.</Typography>
                )}
              </Box>
            )}

            {tab === 3 && (
              <DataTable
                columns={tripColumns}
                rows={data.trips}
                rowKey={(t) => t.id}
                page={0}
                rowsPerPage={Math.max(data.trips.length, 5)}
                total={data.trips.length}
                onPageChange={() => undefined}
                onRowsPerPageChange={() => undefined}
                emptyMessage="No trips yet"
                paperSx={{ border: 0, boxShadow: 'none' }}
              />
            )}

            {tab === 4 && (
              <DataTable
                columns={docColumns}
                rows={data.documents}
                rowKey={(d) => d.id}
                page={0}
                rowsPerPage={Math.max(data.documents.length, 5)}
                total={data.documents.length}
                onPageChange={() => undefined}
                onRowsPerPageChange={() => undefined}
                emptyMessage="No documents uploaded"
                paperSx={{ border: 0, boxShadow: 'none' }}
              />
            )}

            {tab === 5 && (
              <DataTable
                columns={complaintColumns}
                rows={data.complaints}
                rowKey={(c) => c.id}
                page={0}
                rowsPerPage={Math.max(data.complaints.length, 5)}
                total={data.complaints.length}
                onPageChange={() => undefined}
                onRowsPerPageChange={() => undefined}
                emptyMessage="No complaints against this driver"
                paperSx={{ border: 0, boxShadow: 'none' }}
              />
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {canReview && onApprove && (
            <Button
              variant="contained"
              disabled={actionsPending}
              onClick={() => data && onApprove(data.userId)}
            >
              Approve driver
            </Button>
          )}
          {canReview && onReject && (
            <Button
              color="error"
              disabled={actionsPending}
              onClick={() => data && onReject(data.userId)}
            >
              Reject driver
            </Button>
          )}
        </Box>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
