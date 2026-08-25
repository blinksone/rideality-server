import { useMemo, useState, useEffect } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  Chip,
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
import { listFleetDrivers } from '@/api/fleet.api';
import { getApiErrorMessage } from '@/api/client';
import ConfirmDialog from '@/components/ConfirmDialog';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import PageHeader from '@/components/PageHeader';
import UserAccessPanel from '@/modules/users/UserAccessPanel';
import EditPlatformStaffDialog from '@/modules/users/EditPlatformStaffDialog';
import PassengerRidesTab from '@/modules/users/PassengerRidesTab';
import PassengerWalletTab from '@/modules/users/PassengerWalletTab';
import PassengerRatingsTab from '@/modules/users/PassengerRatingsTab';
import { usePermissions } from '@/hooks/usePermissions';
import { useAdminScope } from '@/hooks/useAdminScope';
import { useNotify } from '@/services/notification';
import type { AdminRole, AuditLogEntry, FleetDriver, UserDetail, VerificationDocument } from '@/api/types';
import { formatDate, formatLabel, formatAdminRole } from '@/utils/format';
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
  | 'drivers'
  | 'notes'
  | 'penalties';

const FLEET_TEAM_ROLES: AdminRole[] = ['FLEET_OWNER', 'REGIONAL_FLEET', 'FLEET_SUPPORT', 'FLEET_FINANCE'];

function isFleetTeamRole(role?: AdminRole | null) {
  return Boolean(role && FLEET_TEAM_ROLES.includes(role));
}

function coverageArea(assignment: NonNullable<UserDetail['adminAssignment']>): string {
  switch (assignment.role) {
    case 'GLOBAL_ADMIN':
      return 'worldwide operations';
    case 'CONTINENT_ADMIN':
      return assignment.continent?.name ?? 'their continent';
    case 'COUNTRY_ADMIN':
      return assignment.country?.name ?? 'their country';
    case 'REGIONAL_ADMIN':
      return assignment.province?.name ?? 'their region';
    case 'FLEET_OWNER':
      return assignment.city?.name
        ? `${assignment.city.name}${assignment.country?.name ? `, ${assignment.country.name}` : ''}`
        : assignment.country?.name ?? 'their fleet';
    case 'CITY_ADMIN':
    case 'REGIONAL_FLEET':
    case 'FLEET_SUPPORT':
    case 'FLEET_FINANCE':
      return assignment.city?.name ?? 'their city';
    default:
      return (
        assignment.city?.name ??
        assignment.province?.name ??
        assignment.country?.name ??
        assignment.continent?.name ??
        'their assigned area'
      );
  }
}

function coverageBlurb(assignment: NonNullable<UserDetail['adminAssignment']>, roleLabel: string): string {
  const area = coverageArea(assignment);
  switch (assignment.role) {
    case 'REGIONAL_FLEET':
      return `City fleet admin for ${area}. Manages drivers and documents, and can review tickets handled by Fleet Support in this city.`;
    case 'FLEET_SUPPORT':
      return `Fleet support for ${area}. Handles tickets and driver assistance in this city.`;
    case 'FLEET_FINANCE':
      return `Fleet finance for ${area}. Credits driver wallets (cash/bank) for the owner to approve.`;
    case 'FLEET_OWNER':
      return `Owns and operates the fleet covering ${area}.`;
    case 'CITY_ADMIN':
      return `City Admin for ${area}. Invites fleet owners in this city.`;
    case 'REGIONAL_ADMIN':
      return `Region Head for ${area}. Invites city admins in this province.`;
    default:
      return `This ${roleLabel} manages ${area}.`;
  }
}

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
  const navigate = useNavigate();
  const { can, isSuperAdmin } = usePermissions();
  const { isFleetOwner, isRegionalFleet, isFleetSupport, isFleetFinance } = useAdminScope();
  const viewerIsFleetTeam = isFleetOwner || isRegionalFleet || isFleetSupport || isFleetFinance;
  const notify = useNotify();
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ['user', id],
    queryFn: () => getUser(id),
    enabled: Boolean(id),
  });

  const targetRole = user?.adminAssignment?.role ?? null;
  const isStaff = Boolean(targetRole);
  const targetIsFleetTeam = isFleetTeamRole(targetRole);
  const membership = user?.fleetMemberships?.[0] ?? null;
  const canViewCityDrivers =
    Boolean(membership?.companyId) &&
    (targetRole === 'REGIONAL_FLEET' || targetRole === 'FLEET_OWNER') &&
    (can('DRIVER_VIEW') || can('manage_drivers') || can('FLEET_VIEW'));

  const tabs = useMemo(() => {
    const items: { key: TabKey; label: string }[] = [{ key: 'overview', label: 'Overview' }];
    if (isStaff) {
      if (targetRole !== 'FLEET_SUPPORT' && targetRole !== 'FLEET_FINANCE' && targetRole !== 'FINANCE_USER') {
        items.push({ key: 'access', label: 'Team' });
      }
      if (canViewCityDrivers) items.push({ key: 'drivers', label: 'Drivers' });
      if (targetRole === 'FLEET_FINANCE' || targetRole === 'FINANCE_USER') {
        items.push({ key: 'wallet', label: 'Wallet' });
      }
      if (!targetIsFleetTeam && can('view_reports')) items.push({ key: 'audit', label: 'Audit log' });
      if (user?.driverProfile) {
        if (can('manage_documents')) items.push({ key: 'documents', label: 'Documents' });
        if (can('manage_drivers')) items.push({ key: 'driver', label: 'Driver review' });
      }
    } else {
      if (can('view_finance')) items.push({ key: 'wallet', label: 'Wallet' });
      if (can('view_reports')) items.push({ key: 'audit', label: 'Audit log' });
      if (can('manage_users')) items.push({ key: 'rides', label: 'Ride history' });
      if (can('view_reports')) items.push({ key: 'ratings', label: 'Ratings' });
      if (can('manage_roles')) items.push({ key: 'access', label: 'Access' });
      if (can('manage_documents')) items.push({ key: 'documents', label: 'Documents' });
      if (can('manage_drivers')) items.push({ key: 'driver', label: 'Driver review' });
    }
    if (!targetIsFleetTeam && can('manage_notes')) items.push({ key: 'notes', label: 'Notes' });
    if (!isStaff && can('manage_penalties')) items.push({ key: 'penalties', label: 'Penalties' });
    return items;
  }, [can, canViewCityDrivers, isStaff, targetIsFleetTeam, targetRole, user?.driverProfile]);

  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  useEffect(() => {
    const tab = (location.state as { tab?: TabKey } | null)?.tab;
    if (tab) setActiveTab(tab);
  }, [location.state]);

  useEffect(() => {
    if (!tabs.some((t) => t.key === activeTab)) setActiveTab('overview');
  }, [tabs, activeTab]);
  const [statusDialog, setStatusDialog] = useState(false);
  const [newStatus, setNewStatus] = useState('SUSPENDED');
  const [statusReason, setStatusReason] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [penaltyAmount, setPenaltyAmount] = useState('');
  const [penaltyReason, setPenaltyReason] = useState('');
  const [auditPage, setAuditPage] = useState(0);
  const [auditRows, setAuditRows] = useState(10);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [resetCredentials, setResetCredentials] = useState<{ email: string; password: string } | null>(
    null,
  );

  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ['user-audit', id, auditPage, auditRows],
    queryFn: () => getAuditLog(id, { page: auditPage + 1, limit: auditRows }),
    enabled: Boolean(id) && activeTab === 'audit',
  });

  const { data: cityDrivers = [], isLoading: cityDriversLoading } = useQuery({
    queryKey: ['regional-fleet-drivers', membership?.companyId, membership?.fleetRegionId],
    queryFn: () =>
      listFleetDrivers(membership!.companyId, {
        regionId: membership?.fleetRegionId ?? undefined,
      }),
    enabled: Boolean(membership?.companyId) && activeTab === 'drivers',
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
  const assignment = user.adminAssignment;
  const roleLabel = formatAdminRole(assignment?.role);
  const headerScope = assignment
    ? [
        targetIsFleetTeam ? assignment.city?.name : assignment.continent?.name,
        targetIsFleetTeam ? membership?.companyName : assignment.country ? `${assignment.country.name} (${assignment.country.code})` : null,
        targetIsFleetTeam ? null : assignment.province?.name,
        targetIsFleetTeam ? null : assignment.city?.name,
      ].filter(Boolean)
    : [];
  const canResetPassword =
    isSuperAdmin &&
    Boolean(user.email?.trim()) &&
    (Boolean(assignment?.role) || platformRoles.some((role) => PLATFORM_ROLES.includes(role)));
  const canEditStaff = (can('manage_users') || can('ADMIN_UPDATE')) && isStaff;
  const canChangeStatus = can('manage_users') && !targetIsFleetTeam;

  return (
    <>
      <PageHeader
        title={user.profile?.fullName ?? user.email ?? user.phone}
        badge={assignment ? roleLabel : 'Users'}
        subtitle={
          assignment
            ? `${headerScope.length ? headerScope.join(' · ') : coverageArea(assignment)} · User ID: ${user.id}`
            : `User ID: ${user.id}`
        }
        breadcrumbs={[
          {
            label: viewerIsFleetTeam || targetIsFleetTeam ? 'Fleet Team' : 'Users',
            to: '/users',
          },
          { label: user.profile?.fullName ?? 'Detail' },
        ]}
        actions={
          canEditStaff || canResetPassword || canChangeStatus ? (
            <Box sx={{ display: 'flex', gap: 1 }}>
              {canEditStaff && (
                <Button variant="contained" onClick={() => setEditOpen(true)}>
                  Update user
                </Button>
              )}
              {canResetPassword && (
                <Button variant="outlined" color="warning" onClick={() => setResetConfirmOpen(true)}>
                  Reset password
                </Button>
              )}
              {canChangeStatus && (
                <Button variant="outlined" onClick={() => setStatusDialog(true)}>
                  Update status
                </Button>
              )}
            </Box>
          ) : undefined
        }
      />

      <Tabs
        value={Math.max(0, tabs.findIndex((t) => t.key === activeTab))}
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
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Chip size="small" label={formatLabel(user.status)} />
                {assignment && <Chip size="small" color="primary" variant="outlined" label={roleLabel} />}
              </Box>
              <Typography variant="body2">Email: {user.email ?? '—'}</Typography>
              <Typography variant="body2">Phone: {user.phone}</Typography>
              {assignment && targetIsFleetTeam ? (
                <>
                  {assignment.city && (
                    <Typography variant="body2">Operating city: {assignment.city.name}</Typography>
                  )}
                  {assignment.province && (
                    <Typography variant="body2">Province: {assignment.province.name}</Typography>
                  )}
                  {membership && (
                    <Typography variant="body2">
                      Fleet:{' '}
                      <Box
                        component={RouterLink}
                        to={`/fleet/${membership.companyId}`}
                        sx={{ color: 'primary.main', textDecoration: 'none' }}
                      >
                        {membership.companyName}
                      </Box>
                    </Typography>
                  )}
                  {assignment.invitedBy && (
                    <Typography variant="body2">
                      Reports to: {assignment.invitedBy.fullName ?? assignment.invitedBy.email} (
                      {formatAdminRole(assignment.invitedBy.role)})
                    </Typography>
                  )}
                  {assignment.canInvite.length > 0 && (
                    <Typography variant="body2">
                      Can invite: {assignment.canInvite.map(formatAdminRole).join(', ')}
                    </Typography>
                  )}
                </>
              ) : assignment ? (
                <>
                  {assignment.continent && (
                    <Typography variant="body2">Continent: {assignment.continent.name}</Typography>
                  )}
                  {assignment.country && (
                    <Typography variant="body2">
                      Country: {assignment.country.name} ({assignment.country.code})
                    </Typography>
                  )}
                  {assignment.province && (
                    <Typography variant="body2">Region / province: {assignment.province.name}</Typography>
                  )}
                  {assignment.city && (
                    <Typography variant="body2">City: {assignment.city.name}</Typography>
                  )}
                  {assignment.invitedBy && (
                    <Typography variant="body2">
                      Invited by: {assignment.invitedBy.fullName ?? assignment.invitedBy.email} (
                      {formatAdminRole(assignment.invitedBy.role)})
                    </Typography>
                  )}
                  {assignment.canInvite.length > 0 && (
                    <Typography variant="body2">
                      Can invite: {assignment.canInvite.map(formatAdminRole).join(', ')}
                    </Typography>
                  )}
                </>
              ) : (
                <Typography variant="body2">
                  Role: {platformRoles.map(formatAdminRole).join(', ') || '—'}
                </Typography>
              )}
              <Typography variant="body2">Joined: {formatDate(user.createdAt)}</Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                {assignment ? 'Coverage' : 'Wallet'}
              </Typography>
              {assignment ? (
                <>
                  <Typography variant="body2">{coverageBlurb(assignment, roleLabel)}</Typography>
                  {targetRole === 'REGIONAL_FLEET' || targetRole === 'FLEET_OWNER' ? (
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      Fleet support: {assignment.team.filter((m) => m.role === 'FLEET_SUPPORT').length}
                    </Typography>
                  ) : (
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      Direct reports: {assignment.team.length}
                    </Typography>
                  )}
                  {membership?.fleetRegionName && (
                    <Typography variant="body2">City desk: {membership.fleetRegionName}</Typography>
                  )}
                  {!targetIsFleetTeam && (
                    <Typography variant="body2">
                      Wallet: {user.wallet ? `${user.wallet.balance} ${user.wallet.currency}` : '—'}
                    </Typography>
                  )}
                </>
              ) : (
                <Typography variant="body2">
                  Balance: {user.wallet ? `${user.wallet.balance} ${user.wallet.currency}` : '—'}
                </Typography>
              )}
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
        {assignment ? (
          assignment.team.length === 0 ? (
            <Typography color="text.secondary">
              {targetRole === 'REGIONAL_FLEET'
                ? 'No fleet support in this city yet. Regional Fleet can invite Fleet Support.'
                : `No team members yet. ${roleLabel} can invite ${assignment.canInvite.map(formatAdminRole).join(', ') || 'no one'}.`}
            </Typography>
          ) : (
            <DataTable
              columns={[
                { id: 'fullName', label: 'Name', render: (r) => r.fullName ?? '—' },
                { id: 'role', label: 'Role', render: (r) => formatAdminRole(r.role) },
                { id: 'scopeLabel', label: 'City', render: (r) => r.scopeLabel.split(' / ').pop() || r.scopeLabel || '—' },
                { id: 'email', label: 'Email', render: (r) => r.email ?? '—' },
                { id: 'phone', label: 'Phone' },
              ]}
              rows={assignment.team}
              rowKey={(r) => r.userId}
              page={0}
              rowsPerPage={assignment.team.length}
              total={assignment.team.length}
              onPageChange={() => undefined}
              onRowsPerPageChange={() => undefined}
              onRowClick={(r) => navigate(`/users/${r.userId}`)}
            />
          )
        ) : (
          <UserAccessPanel userId={id} />
        )}
      </TabPanel>

      <TabPanel active={activeTab === 'drivers'} id="drivers">
        <DataTable
          columns={[
            {
              id: 'fullName',
              label: 'Driver',
              render: (r: FleetDriver) => r.fullName ?? r.user?.profile?.fullName ?? r.user?.phone ?? r.userId,
            },
            { id: 'city', label: 'City', render: (r: FleetDriver) => r.fleetRegionName ?? '—' },
            {
              id: 'onboardingStatus',
              label: 'Status',
              render: (r: FleetDriver) => formatLabel(r.onboardingStatus),
            },
            {
              id: 'driverType',
              label: 'Type',
              render: (r: FleetDriver) => formatLabel(r.driverType ?? '—'),
            },
          ]}
          rows={cityDrivers}
          rowKey={(r) => r.userId}
          page={0}
          rowsPerPage={Math.max(cityDrivers.length, 1)}
          total={cityDrivers.length}
          onPageChange={() => undefined}
          onRowsPerPageChange={() => undefined}
          loading={cityDriversLoading}
          emptyMessage={
            membership
              ? `No drivers in ${assignment?.city?.name ?? membership.fleetRegionName ?? 'this city'} yet.`
              : 'This user is not attached to a fleet city.'
          }
        />
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
      <EditPlatformStaffDialog
        open={editOpen}
        userId={id}
        onClose={() => setEditOpen(false)}
        onUpdated={() => {
          queryClient.invalidateQueries({ queryKey: ['user', id] });
          queryClient.invalidateQueries({ queryKey: ['platform-staff'] });
        }}
      />
    </>
  );
}
