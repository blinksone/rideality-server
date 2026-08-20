import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink, useParams } from 'react-router-dom';
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
  List,
  ListItem,
  ListItemText,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PeopleIcon from '@mui/icons-material/People';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import RouteIcon from '@mui/icons-material/Route';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import WifiIcon from '@mui/icons-material/Wifi';
import {
  getFleetCityProfile,
  reviewFleetComplaint,
  reviewFleetDocument,
  updateFleetDriver,
  type FleetCityProfile,
} from '@/api/fleet.api';
import { getApiErrorMessage } from '@/api/client';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import FleetContentCard from '@/fleet-portal/components/FleetContentCard';
import FleetMetricCard from '@/fleet-portal/components/FleetMetricCard';
import FleetMetricRow, { FleetMetricCell } from '@/fleet-portal/components/FleetMetricRow';
import FleetPageHero from '@/fleet-portal/components/FleetPageHero';
import FleetDriverDetailDialog from '@/fleet-portal/components/FleetDriverDetailDialog';
import { fleetPath } from '@/fleet-portal/fleetNavConfig';
import { useNotify } from '@/services/notification';
import { formatDate, formatLabel } from '@/utils/format';

const TRIP_STATUS_COLOR: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  completed: 'success',
  in_progress: 'info',
  assigned: 'warning',
  requested: 'default',
  cancelled: 'error',
};

export default function FleetCityProfilePage() {
  const { companyId = '', regionId = '' } = useParams();
  const [tab, setTab] = useState(0);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ id: string; driverName: string; type: string } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const notify = useNotify();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['fleet-city-profile', companyId, regionId],
    queryFn: () => getFleetCityProfile(companyId, regionId),
    enabled: Boolean(companyId && regionId),
  });

  const invalidateCity = () => {
    queryClient.invalidateQueries({ queryKey: ['fleet-city-profile', companyId, regionId] });
  };

  const reviewMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'in_review' | 'resolved' }) =>
      reviewFleetComplaint(companyId, id, status),
    onSuccess: () => {
      notify.success('Complaint updated');
      invalidateCity();
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const driverMutation = useMutation({
    mutationFn: ({ userId, onboardingStatus }: { userId: string; onboardingStatus: string }) =>
      updateFleetDriver(companyId, userId, { onboardingStatus }),
    onSuccess: () => {
      notify.success('Driver updated');
      invalidateCity();
      queryClient.invalidateQueries({ queryKey: ['fleet-driver-detail', companyId] });
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const documentMutation = useMutation({
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
      setRejectTarget(null);
      setRejectionReason('');
      invalidateCity();
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const actionsPending = reviewMutation.isPending || driverMutation.isPending || documentMutation.isPending;

  const canReviewDriver = (status: string) =>
    status === 'pending_review' || status === 'draft';
  const isPendingDocument = (status: string) => status.toLowerCase() === 'pending';

  const driverColumns: DataTableColumn<FleetCityProfile['drivers'][number]>[] = useMemo(
    () => [
      {
        id: 'name',
        label: 'Driver',
        minWidth: 120,
        render: (d) => d.fullName ?? d.phone,
      },
      { id: 'phone', label: 'Phone', minWidth: 130, nowrap: false, render: (d) => d.phone },
      {
        id: 'status',
        label: 'Status',
        minWidth: 110,
        render: (d) => (
          <Chip
            size="small"
            label={formatLabel(d.onboardingStatus)}
            color={
              d.onboardingStatus === 'approved'
                ? 'success'
                : d.onboardingStatus === 'pending_review' || d.onboardingStatus === 'draft'
                  ? 'warning'
                  : d.onboardingStatus === 'rejected'
                    ? 'error'
                    : 'default'
            }
          />
        ),
      },
      {
        id: 'online',
        label: 'Online',
        minWidth: 90,
        render: (d) => (
          <Chip size="small" variant="outlined" color={d.isOnline ? 'success' : 'default'} label={d.isOnline ? 'Online' : 'Offline'} />
        ),
      },
      { id: 'trips', label: 'Trips', minWidth: 70, render: (d) => d.totalRides },
      {
        id: 'actions',
        label: 'Actions',
        align: 'right' as const,
        nowrap: false,
        minWidth: 200,
        width: 200,
        render: (d) => (
          <Box sx={{ display: 'inline-flex', gap: 1, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
            <Button size="small" variant="outlined" onClick={() => setSelectedDriverId(d.userId)}>
              View
            </Button>
            {canReviewDriver(d.onboardingStatus) && (
              <>
                <Button
                  size="small"
                  variant="contained"
                  disabled={actionsPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    driverMutation.mutate({ userId: d.userId, onboardingStatus: 'approved' });
                  }}
                >
                  Approve
                </Button>
                <Button
                  size="small"
                  color="error"
                  disabled={actionsPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    driverMutation.mutate({ userId: d.userId, onboardingStatus: 'rejected' });
                  }}
                >
                  Reject
                </Button>
              </>
            )}
          </Box>
        ),
      },
    ],
    [actionsPending, driverMutation],
  );

  const vehicleColumns: DataTableColumn<FleetCityProfile['vehicles'][number]>[] = [
    { id: 'plate', label: 'Plate', render: (v) => v.numberPlate },
    { id: 'model', label: 'Vehicle', render: (v) => `${v.vehicleType} · ${v.model}` },
    { id: 'driver', label: 'Driver', render: (v) => v.driverName },
    {
      id: 'status',
      label: 'Status',
      render: (v) => <Chip size="small" label={formatLabel(v.operationalStatus)} color={v.operationalStatus === 'active' ? 'success' : 'default'} />,
    },
    { id: 'verified', label: 'Verified', render: (v) => (v.isVerified ? 'Yes' : 'No') },
  ];

  const tripColumns: DataTableColumn<FleetCityProfile['trips'][number]>[] = [
    { id: 'id', label: 'Trip', render: (t) => t.id.slice(0, 8) },
    {
      id: 'status',
      label: 'Status',
      render: (t) => <Chip size="small" label={formatLabel(t.status)} color={TRIP_STATUS_COLOR[t.status] ?? 'default'} />,
    },
    { id: 'driver', label: 'Driver', render: (t) => t.driverName ?? '—' },
    { id: 'passenger', label: 'Passenger', render: (t) => t.passengerName ?? '—' },
    { id: 'fare', label: 'Fare', render: (t) => `${t.fare} ${t.currency}` },
    { id: 'date', label: 'Created', render: (t) => formatDate(t.createdAt) },
  ];

  const walletColumns: DataTableColumn<FleetCityProfile['wallets'][number]>[] = [
    { id: 'driver', label: 'Driver', render: (w) => w.driverName },
    {
      id: 'balance',
      label: 'Balance',
      render: (w) => (w.wallet ? `${w.wallet.balance.toLocaleString()} ${w.wallet.currency}` : 'No wallet'),
    },
    { id: 'status', label: 'Status', render: (w) => (w.wallet ? formatLabel(w.wallet.status) : '—') },
  ];

  const complaintColumns: DataTableColumn<FleetCityProfile['complaints'][number]>[] = [
    { id: 'driver', label: 'Driver', render: (c) => c.driverName },
    { id: 'reason', label: 'Reason', render: (c) => c.reason },
    { id: 'reporter', label: 'Reporter', render: (c) => c.reporterName },
    {
      id: 'status',
      label: 'Status',
      render: (c) => (
        <Chip size="small" color={c.needsSupport ? 'warning' : 'success'} label={c.needsSupport ? 'Needs support' : formatLabel(c.status)} />
      ),
    },
    { id: 'date', label: 'When', render: (c) => formatDate(c.createdAt) },
    {
      id: 'actions',
      label: '',
      align: 'right',
      render: (c) =>
        c.needsSupport ? (
          <Button
            size="small"
            disabled={reviewMutation.isPending}
            onClick={(e) => {
              e.stopPropagation();
              reviewMutation.mutate({ id: c.id, status: 'resolved' });
            }}
          >
            Mark resolved
          </Button>
        ) : null,
    },
  ];

  const documentColumns: DataTableColumn<FleetCityProfile['documents'][number]>[] = [
    { id: 'driver', label: 'Driver', render: (d) => d.driverName },
    { id: 'type', label: 'Type', render: (d) => formatLabel(d.type) },
    {
      id: 'status',
      label: 'Status',
      render: (d) => (
        <Chip size="small" color={d.status.toLowerCase() === 'pending' ? 'warning' : d.status.toLowerCase() === 'approved' ? 'success' : 'default'} label={formatLabel(d.status)} />
      ),
    },
    { id: 'submitted', label: 'Submitted', render: (d) => formatDate(d.submittedAt) },
    {
      id: 'file',
      label: 'File',
      render: (d) =>
        d.fileUrl ? (
          <Link href={d.fileUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
            View
          </Link>
        ) : (
          '—'
        ),
    },
    {
      id: 'actions',
      label: 'Actions',
      align: 'right',
      nowrap: false,
      minWidth: 180,
      width: 180,
      render: (d) =>
        isPendingDocument(d.status) ? (
          <Box sx={{ display: 'inline-flex', gap: 1, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
            <Button
              size="small"
              variant="contained"
              disabled={actionsPending}
              onClick={() => documentMutation.mutate({ documentId: d.id, status: 'approved' })}
            >
              Approve
            </Button>
            <Button
              size="small"
              color="error"
              disabled={actionsPending}
              onClick={() => setRejectTarget({ id: d.id, driverName: d.driverName, type: d.type })}
            >
              Reject
            </Button>
          </Box>
        ) : null,
    },
  ];

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {getApiErrorMessage(error)}
      </Alert>
    );
  }

  const stats = data?.stats;
  const cityName = data?.city.name ?? 'City';

  return (
    <Box>
      <FleetPageHero
        badge="City profile"
        title={isLoading ? 'Loading city…' : cityName}
        description="Drivers, vehicles, trips, wallets, and complaints for this city. Approve pending drivers and documents from the Drivers and Documents tabs."
        actions={
          <Button
            component={RouterLink}
            to={fleetPath(companyId, 'regions')}
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            sx={{ borderColor: 'rgba(255,255,255,0.2)', color: '#fff' }}
          >
            All cities
          </Button>
        }
      />

      <FleetMetricRow>
        <FleetMetricCell>
          <FleetMetricCard label="Drivers" value={isLoading ? '…' : (stats?.drivers ?? 0)} icon={<PeopleIcon fontSize="small" />} accent="blue" />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard label="Online" value={isLoading ? '…' : (stats?.online ?? 0)} icon={<WifiIcon fontSize="small" />} accent="emerald" />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard label="Vehicles" value={isLoading ? '…' : (stats?.vehicles ?? 0)} icon={<DirectionsCarIcon fontSize="small" />} accent="indigo" />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard label="Trips" value={isLoading ? '…' : (stats?.trips ?? 0)} icon={<RouteIcon fontSize="small" />} accent="teal" />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard
            label="Driver wallets"
            value={isLoading ? '…' : `${(stats?.walletTotal ?? 0).toLocaleString()} ${stats?.currency ?? ''}`}
            icon={<AccountBalanceWalletIcon fontSize="small" />}
            accent="blue"
          />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard
            label="Needs support"
            value={isLoading ? '…' : (stats?.pendingComplaints ?? 0) + (stats?.pendingApprovals ?? 0) + (stats?.pendingDocuments ?? 0)}
            icon={<ReportProblemIcon fontSize="small" />}
            accent="amber"
          />
        </FleetMetricCell>
      </FleetMetricRow>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }} variant="scrollable" allowScrollButtonsMobile>
        <Tab label="Overview" />
        <Tab label={`Drivers (${stats?.drivers ?? 0})`} />
        <Tab label={`Vehicles (${stats?.vehicles ?? 0})`} />
        <Tab label={`Trips (${stats?.trips ?? 0})`} />
        <Tab label="Wallets" />
        <Tab label={`Complaints (${stats?.pendingComplaints ?? 0})`} />
        <Tab label="Documents" />
      </Tabs>

      {tab === 0 && (
        <>
          <FleetContentCard title="Regional fleet" subtitle="City admins who manage day-to-day driver operations">
            {(data?.regionalAdmins.length ?? 0) === 0 ? (
              <Typography color="text.secondary">No regional fleet admin for this city yet.</Typography>
            ) : (
              <List dense disablePadding>
                {data?.regionalAdmins.map((a) => (
                  <ListItem key={a.userId} divider sx={{ px: 0 }}>
                    <ListItemText primary={a.fullName ?? a.phone} secondary={[a.phone, a.email].filter(Boolean).join(' · ')} />
                  </ListItem>
                ))}
              </List>
            )}
          </FleetContentCard>

          <FleetContentCard title="Support required" subtitle="Complaints, pending driver approvals, and documents that need action">
            {(data?.supportNeeded.length ?? 0) === 0 ? (
              <Typography color="text.secondary">Nothing needs attention in this city.</Typography>
            ) : (
              <List dense disablePadding>
                {data?.supportNeeded.map((item) => (
                  <ListItem key={item.id} divider sx={{ px: 0, alignItems: 'flex-start' }}>
                    <ListItemText
                      primary={item.title}
                      secondary={`${item.subtitle}${item.createdAt ? ` · ${formatDate(item.createdAt)}` : ''}`}
                    />
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', ml: 2, mt: 0.5 }}>
                      <Chip size="small" color="warning" label={formatLabel(item.type)} />
                      {item.type === 'onboarding' && (
                        <Button
                          size="small"
                          variant="contained"
                          disabled={actionsPending}
                          onClick={() => driverMutation.mutate({ userId: item.driverUserId, onboardingStatus: 'approved' })}
                        >
                          Approve driver
                        </Button>
                      )}
                      {item.type === 'document' && item.documentId && (
                        <>
                          <Button
                            size="small"
                            variant="contained"
                            disabled={actionsPending}
                            onClick={() => documentMutation.mutate({ documentId: item.documentId!, status: 'approved' })}
                          >
                            Approve
                          </Button>
                          <Button
                            size="small"
                            color="error"
                            disabled={actionsPending}
                            onClick={() =>
                              setRejectTarget({
                                id: item.documentId!,
                                driverName: item.subtitle,
                                type: item.title,
                              })
                            }
                          >
                            Reject
                          </Button>
                        </>
                      )}
                    </Box>
                  </ListItem>
                ))}
              </List>
            )}
          </FleetContentCard>
        </>
      )}

      {tab === 1 && (
        <FleetContentCard title="Drivers" subtitle="Approve or reject onboarding for drivers in this city">
          <DataTable
            columns={driverColumns}
            rows={data?.drivers ?? []}
            rowKey={(d) => d.userId}
            page={0}
            rowsPerPage={Math.max(data?.drivers.length ?? 0, 10)}
            total={data?.drivers.length ?? 0}
            onPageChange={() => {}}
            onRowsPerPageChange={() => {}}
            loading={isLoading}
            emptyMessage="No drivers in this city"
            onRowClick={(d) => setSelectedDriverId(d.userId)}
            paperSx={{ border: 0, boxShadow: 'none' }}
          />
        </FleetContentCard>
      )}

      {tab === 2 && (
        <FleetContentCard title="Vehicles" subtitle="Vehicles assigned to drivers in this city">
          <DataTable
            columns={vehicleColumns}
            rows={data?.vehicles ?? []}
            rowKey={(v) => v.id}
            page={0}
            rowsPerPage={Math.max(data?.vehicles.length ?? 0, 10)}
            total={data?.vehicles.length ?? 0}
            onPageChange={() => {}}
            onRowsPerPageChange={() => {}}
            loading={isLoading}
            emptyMessage="No vehicles in this city"
            paperSx={{ border: 0, boxShadow: 'none' }}
          />
        </FleetContentCard>
      )}

      {tab === 3 && (
        <FleetContentCard title="Trips" subtitle="Recent trips by drivers in this city">
          <DataTable
            columns={tripColumns}
            rows={data?.trips ?? []}
            rowKey={(t) => t.id}
            page={0}
            rowsPerPage={Math.max(data?.trips.length ?? 0, 10)}
            total={data?.trips.length ?? 0}
            onPageChange={() => {}}
            onRowsPerPageChange={() => {}}
            loading={isLoading}
            emptyMessage="No trips in this city yet"
            paperSx={{ border: 0, boxShadow: 'none' }}
          />
        </FleetContentCard>
      )}

      {tab === 4 && (
        <FleetContentCard title="Driver wallets" subtitle="Wallet balance for each driver in this city">
          <DataTable
            columns={walletColumns}
            rows={data?.wallets ?? []}
            rowKey={(w) => w.driverUserId}
            page={0}
            rowsPerPage={Math.max(data?.wallets.length ?? 0, 10)}
            total={data?.wallets.length ?? 0}
            onPageChange={() => {}}
            onRowsPerPageChange={() => {}}
            loading={isLoading}
            emptyMessage="No driver wallets yet"
            paperSx={{ border: 0, boxShadow: 'none' }}
          />
        </FleetContentCard>
      )}

      {tab === 5 && (
        <FleetContentCard title="Complaints" subtitle="Reports against drivers in this city. Pending items need support.">
          <DataTable
            columns={complaintColumns}
            rows={data?.complaints ?? []}
            rowKey={(c) => c.id}
            page={0}
            rowsPerPage={Math.max(data?.complaints.length ?? 0, 10)}
            total={data?.complaints.length ?? 0}
            onPageChange={() => {}}
            onRowsPerPageChange={() => {}}
            loading={isLoading}
            emptyMessage="No complaints for this city"
            paperSx={{ border: 0, boxShadow: 'none' }}
          />
        </FleetContentCard>
      )}

      {tab === 6 && (
        <FleetContentCard title="Documents" subtitle="Open the file, then approve or reject pending verification documents">
          <DataTable
            columns={documentColumns}
            rows={data?.documents ?? []}
            rowKey={(d) => d.id}
            page={0}
            rowsPerPage={Math.max(data?.documents.length ?? 0, 10)}
            total={data?.documents.length ?? 0}
            onPageChange={() => {}}
            onRowsPerPageChange={() => {}}
            loading={isLoading}
            emptyMessage="No documents for this city"
            paperSx={{ border: 0, boxShadow: 'none' }}
          />
        </FleetContentCard>
      )}

      <FleetDriverDetailDialog
        open={Boolean(selectedDriverId)}
        companyId={companyId}
        driverUserId={selectedDriverId}
        onClose={() => setSelectedDriverId(null)}
        actionsPending={actionsPending}
        onApprove={(userId) => driverMutation.mutate({ userId, onboardingStatus: 'approved' })}
        onReject={(userId) => driverMutation.mutate({ userId, onboardingStatus: 'rejected' })}
      />

      <Dialog open={Boolean(rejectTarget)} onClose={() => setRejectTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Reject document</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {rejectTarget ? `${formatLabel(rejectTarget.type)} · ${rejectTarget.driverName}` : ''}
          </Typography>
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
            disabled={rejectionReason.trim().length < 3 || documentMutation.isPending}
            onClick={() =>
              rejectTarget &&
              documentMutation.mutate({
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
