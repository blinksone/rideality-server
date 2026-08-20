import { useMemo, useState, useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  Alert,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import {
  addNote,
  applyPenalty,
  getAuditLog,
  getUser,
  resetUserPassword,
  reviewDocument,
  reviewDriver,
  updateUserStatus,
} from '@/api/users.api';
import { getApiErrorMessage } from '@/api/client';
import ConfirmDialog from '@/components/ConfirmDialog';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import PageHeader from '@/components/PageHeader';
import UserAccessPanel from '@/modules/users/UserAccessPanel';
import PassengerRidesTab from '@/modules/users/PassengerRidesTab';
import PassengerWalletTab from '@/modules/users/PassengerWalletTab';
import PassengerRatingsTab from '@/modules/users/PassengerRatingsTab';
import { usePermissions } from '@/hooks/usePermissions';
import { useNotify } from '@/services/notification';
import type { AuditLogEntry, UserDetail, VerificationDocument } from '@/api/types';
import { formatDate, formatLabel } from '@/utils/format';
import { copyToClipboard } from '@/utils/clipboard';
import { PLATFORM_ROLES } from '@/utils/permissions';

type TabKey =
  | 'overview'
  | 'rides'
  | 'wallet'
  | 'ratings'
  | 'audit'
  | 'access'
  | 'documents'
  | 'driver'
  | 'notes'
  | 'penalties';

function TabPanel({ children, active, id }: { children: React.ReactNode; active: boolean; id: TabKey }) {
  if (!active) return null;
  return (
    <Box id={`user-tab-${id}`} sx={{ pt: 2 }}>
      {children}
    </Box>
  );
}

export default function UserDetailPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const { can, isSuperAdmin } = usePermissions();
  const notify = useNotify();
  const queryClient = useQueryClient();

  const tabs = useMemo(() => {
    const items: { key: TabKey; label: string }[] = [{ key: 'overview', label: 'Overview' }];
    if (can('manage_users')) items.push({ key: 'rides', label: 'Ride history' });
    if (can('view_finance')) items.push({ key: 'wallet', label: 'Wallet' });
    if (can('view_reports')) items.push({ key: 'ratings', label: 'Ratings' });
    if (can('view_reports')) items.push({ key: 'audit', label: 'Audit log' });
    if (can('manage_roles')) items.push({ key: 'access', label: 'Access' });
    if (can('manage_documents')) items.push({ key: 'documents', label: 'Documents' });
    if (can('manage_drivers')) items.push({ key: 'driver', label: 'Driver review' });
    if (can('manage_notes')) items.push({ key: 'notes', label: 'Notes' });
    if (can('manage_penalties')) items.push({ key: 'penalties', label: 'Penalties' });
    return items;
  }, [can]);

  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  useEffect(() => {
    const tab = (location.state as { tab?: TabKey } | null)?.tab;
    if (tab) setActiveTab(tab);
  }, [location.state]);
  const [statusDialog, setStatusDialog] = useState(false);
  const [newStatus, setNewStatus] = useState('SUSPENDED');
  const [statusReason, setStatusReason] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [penaltyAmount, setPenaltyAmount] = useState('');
  const [penaltyReason, setPenaltyReason] = useState('');
  const [auditPage, setAuditPage] = useState(0);
  const [auditRows, setAuditRows] = useState(10);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetCredentials, setResetCredentials] = useState<{ email: string; password: string } | null>(
    null,
  );

  const { data: user, isLoading } = useQuery({
    queryKey: ['user', id],
    queryFn: () => getUser(id),
    enabled: Boolean(id),
  });

  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ['user-audit', id, auditPage, auditRows],
    queryFn: () => getAuditLog(id, { page: auditPage + 1, limit: auditRows }),
    enabled: Boolean(id) && activeTab === 'audit',
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['user', id] });
    queryClient.invalidateQueries({ queryKey: ['user-access', id] });
    queryClient.invalidateQueries({ queryKey: ['user-audit', id] });
  };

  const statusMutation = useMutation({
    mutationFn: () => updateUserStatus(id, newStatus as UserDetail['status'], statusReason),
    onSuccess: () => {
      notify.success('User status updated');
      setStatusDialog(false);
      invalidate();
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const noteMutation = useMutation({
    mutationFn: () => addNote(id, noteContent),
    onSuccess: () => {
      notify.success('Note added');
      setNoteContent('');
      invalidate();
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const penaltyMutation = useMutation({
    mutationFn: () => applyPenalty(id, Number(penaltyAmount), penaltyReason),
    onSuccess: () => {
      notify.success('Penalty applied');
      setPenaltyAmount('');
      setPenaltyReason('');
      invalidate();
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const driverReviewMutation = useMutation({
    mutationFn: (action: 'approve' | 'reject') => reviewDriver(id, action),
    onSuccess: () => {
      notify.success('Driver review updated');
      invalidate();
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const docReviewMutation = useMutation({
    mutationFn: ({ docId, action }: { docId: string; action: 'approve' | 'reject' }) =>
      reviewDocument(id, docId, action),
    onSuccess: () => {
      notify.success('Document reviewed');
      invalidate();
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () => resetUserPassword(id),
    onSuccess: (result) => {
      setResetConfirmOpen(false);
      setResetCredentials({
        email: result.email,
        password: result.temporaryPassword,
      });
      invalidate();
      notify.success('Password reset');
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const handleCopy = async (label: string, value: string) => {
    try {
      await copyToClipboard(value);
      notify.success(`${label} copied`);
    } catch {
      notify.error(`Could not copy ${label.toLowerCase()}. Select the text and copy manually.`);
    }
  };

  const handleCopyAllCredentials = async () => {
    if (!resetCredentials) return;
    const text = `Rideality login\nEmail: ${resetCredentials.email}\nPassword: ${resetCredentials.password}`;
    await handleCopy('Credentials', text);
  };

  const auditColumns: DataTableColumn<AuditLogEntry>[] = [
    { id: 'action', label: 'Action' },
    { id: 'createdAt', label: 'When', render: (r) => formatDate(r.createdAt) },
    { id: 'ipAddress', label: 'IP', render: (r) => r.ipAddress ?? '—' },
  ];

  if (isLoading || !user) {
    return <Typography>Loading user...</Typography>;
  }

  const platformRoles = user.platformRoles?.map((r) => r.role) ?? [];
  const canResetPassword =
    isSuperAdmin &&
    Boolean(user.email?.trim()) &&
    platformRoles.some((role) => PLATFORM_ROLES.includes(role));

  return (
    <>
      <PageHeader
        title={user.profile?.fullName ?? user.email ?? user.phone}
        subtitle={`User ID: ${user.id}`}
        breadcrumbs={[
          { label: 'Users', to: '/users' },
          { label: user.profile?.fullName ?? 'Detail' },
        ]}
        actions={
          can('manage_users') || canResetPassword ? (
            <Box sx={{ display: 'flex', gap: 1 }}>
              {canResetPassword && (
                <Button variant="outlined" color="warning" onClick={() => setResetConfirmOpen(true)}>
                  Reset password
                </Button>
              )}
              {can('manage_users') && (
                <Button variant="outlined" onClick={() => setStatusDialog(true)}>
                  Update status
                </Button>
              )}
            </Box>
          ) : undefined
        }
      />

      <Tabs
        value={tabs.findIndex((t) => t.key === activeTab)}
        onChange={(_, idx) => setActiveTab(tabs[idx]?.key ?? 'overview')}
        variant="scrollable"
      >
        {tabs.map((t) => (
          <Tab key={t.key} label={t.label} />
        ))}
      </Tabs>

      <TabPanel active={activeTab === 'overview'} id="overview">
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Profile
              </Typography>
              <Typography variant="body2">Email: {user.email ?? '—'}</Typography>
              <Typography variant="body2">Phone: {user.phone}</Typography>
              <Typography variant="body2">Status: {formatLabel(user.status)}</Typography>
              <Typography variant="body2">Roles: {platformRoles.map(formatLabel).join(', ') || '—'}</Typography>
              <Typography variant="body2">Joined: {formatDate(user.createdAt)}</Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Wallet
              </Typography>
              <Typography variant="body2">
                Balance: {user.wallet ? `${user.wallet.balance} ${user.wallet.currency}` : '—'}
              </Typography>
              {user.driverProfile && (
                <>
                  <Typography variant="subtitle2" sx={{ mt: 2 }} gutterBottom>
                    Driver
                  </Typography>
                  <Typography variant="body2">
                    Status: {formatLabel(user.driverProfile.onboardingStatus)}
                  </Typography>
                  <Typography variant="body2">
                    Fleet: {user.driverProfile.fleetCompany?.legalName ?? 'Independent'}
                  </Typography>
                </>
              )}
            </Paper>
          </Grid>
        </Grid>
      </TabPanel>

      <TabPanel active={activeTab === 'rides'} id="rides">
        {activeTab === 'rides' && <PassengerRidesTab userId={id} />}
      </TabPanel>

      <TabPanel active={activeTab === 'wallet'} id="wallet">
        {activeTab === 'wallet' && <PassengerWalletTab userId={id} />}
      </TabPanel>

      <TabPanel active={activeTab === 'ratings'} id="ratings">
        {activeTab === 'ratings' && <PassengerRatingsTab userId={id} />}
      </TabPanel>

      <TabPanel active={activeTab === 'audit'} id="audit">
        <DataTable
          columns={auditColumns}
          rows={auditData?.data ?? []}
          rowKey={(r) => r.id}
          page={auditPage}
          rowsPerPage={auditRows}
          total={auditData?.pagination.total ?? 0}
          onPageChange={setAuditPage}
          onRowsPerPageChange={setAuditRows}
          loading={auditLoading}
        />
      </TabPanel>

      <TabPanel active={activeTab === 'access'} id="access">
        <UserAccessPanel userId={id} />
      </TabPanel>

      <TabPanel active={activeTab === 'documents'} id="documents">
        {(user.documents ?? []).length === 0 ? (
          <Typography color="text.secondary">No documents</Typography>
        ) : (
          user.documents.map((doc: VerificationDocument) => (
            <Paper key={doc.id} variant="outlined" sx={{ p: 2, mb: 1 }}>
              <Typography variant="body2">
                {formatLabel(doc.type)} — {formatLabel(doc.status)}
              </Typography>
              {doc.status === 'pending' && (
                <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => docReviewMutation.mutate({ docId: doc.id, action: 'approve' })}
                  >
                    Approve
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    onClick={() => docReviewMutation.mutate({ docId: doc.id, action: 'reject' })}
                  >
                    Reject
                  </Button>
                </Box>
              )}
            </Paper>
          ))
        )}
      </TabPanel>

      <TabPanel active={activeTab === 'driver'} id="driver">
        {user.driverProfile ? (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="body2" sx={{ mb: 2 }}>
              Onboarding: {formatLabel(user.driverProfile.onboardingStatus)}
            </Typography>
            {user.driverProfile.onboardingStatus === 'pending_review' && (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button variant="contained" onClick={() => driverReviewMutation.mutate('approve')}>
                  Approve driver
                </Button>
                <Button color="error" onClick={() => driverReviewMutation.mutate('reject')}>
                  Reject driver
                </Button>
              </Box>
            )}
          </Paper>
        ) : (
          <Typography color="text.secondary">Not a driver</Typography>
        )}
      </TabPanel>

      <TabPanel active={activeTab === 'notes'} id="notes">
        <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="New note"
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value.slice(0, 2000))}
            helperText={`${noteContent.length}/2000`}
            inputProps={{ maxLength: 2000 }}
          />
          <Button
            variant="contained"
            sx={{ alignSelf: 'flex-end' }}
            disabled={!noteContent.trim() || noteMutation.isPending}
            onClick={() => noteMutation.mutate()}
          >
            Add
          </Button>
        </Box>
        {(user.adminNotes ?? []).map((n) => (
          <Paper key={n.id} variant="outlined" sx={{ p: 2, mb: 1 }}>
            <Typography
              variant="body2"
              sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
            >
              {n.content}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {n.authorName} · {formatDate(n.createdAt)}
            </Typography>
          </Paper>
        ))}
      </TabPanel>

      <TabPanel active={activeTab === 'penalties'} id="penalties">
        <Grid container spacing={2} sx={{ maxWidth: 'sm' }}>
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              label="Amount"
              type="number"
              value={penaltyAmount}
              onChange={(e) => setPenaltyAmount(e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              label="Reason"
              value={penaltyReason}
              onChange={(e) => setPenaltyReason(e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Button
              variant="contained"
              color="warning"
              disabled={!penaltyAmount || !penaltyReason || penaltyMutation.isPending}
              onClick={() => penaltyMutation.mutate()}
            >
              Apply penalty
            </Button>
          </Grid>
        </Grid>
      </TabPanel>

      <Dialog open={statusDialog} onClose={() => setStatusDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Update user status</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            select
            label="Status"
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            fullWidth
          >
            {['ACTIVE', 'SUSPENDED', 'BANNED'].map((s) => (
              <MenuItem key={s} value={s}>
                {formatLabel(s)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Reason"
            value={statusReason}
            onChange={(e) => setStatusReason(e.target.value)}
            fullWidth
            required
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!statusReason || statusMutation.isPending}
            onClick={() => statusMutation.mutate()}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={resetConfirmOpen}
        title="Reset password"
        message="Generate a new temporary password? The user will be logged out and must change their password on next login."
        confirmLabel="Reset password"
        confirmColor="warning"
        loading={resetPasswordMutation.isPending}
        onConfirm={() => resetPasswordMutation.mutate()}
        onCancel={() => setResetConfirmOpen(false)}
      />

      <Dialog
        open={Boolean(resetCredentials)}
        onClose={(_, reason) => {
          if (reason !== 'escapeKeyDown') return;
          setResetCredentials(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Password reset</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <Alert severity="success">
            Share these login credentials with the user now. This password is shown only once.
          </Alert>
          <TextField
            label="Email"
            value={resetCredentials?.email ?? ''}
            fullWidth
            onFocus={(e) => e.target.select()}
            slotProps={{
              input: {
                readOnly: true,
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Copy email">
                      <IconButton
                        type="button"
                        edge="end"
                        onClick={() =>
                          resetCredentials && handleCopy('Email', resetCredentials.email)
                        }
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ),
              },
            }}
          />
          <TextField
            label="Temporary password"
            value={resetCredentials?.password ?? ''}
            fullWidth
            onFocus={(e) => e.target.select()}
            slotProps={{
              input: {
                readOnly: true,
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Copy password">
                      <IconButton
                        type="button"
                        edge="end"
                        onClick={() =>
                          resetCredentials && handleCopy('Password', resetCredentials.password)
                        }
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ),
              },
            }}
          />
          <Box>
            <Button type="button" variant="outlined" onClick={handleCopyAllCredentials}>
              Copy email & password
            </Button>
          </Box>
          <Typography variant="body2" color="text.secondary">
            The user must change this password on first login before accessing the portal.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setResetCredentials(null)}>
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
