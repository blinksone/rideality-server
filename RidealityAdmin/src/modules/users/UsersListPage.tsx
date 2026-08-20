import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SecurityIcon from '@mui/icons-material/Security';
import {
  listPlatformStaff,
  listUsers,
  resetUserPassword,
  type PlatformStaffType,
  type PlatformStaffUser,
} from '@/api/users.api';
import { getApiErrorMessage } from '@/api/client';
import CreateUserDialog from '@/modules/users/CreateUserDialog';
import CreatePlatformStaffDialog from '@/modules/users/CreatePlatformStaffDialog';
import EditPlatformStaffDialog from '@/modules/users/EditPlatformStaffDialog';
import ConfirmDialog from '@/components/ConfirmDialog';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import PageHeader from '@/components/PageHeader';
import { useDebounce } from '@/hooks/useDebounce';
import { useAdminScope } from '@/hooks/useAdminScope';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useNotify } from '@/services/notification';
import { copyToClipboard } from '@/utils/clipboard';
import type { AdminRole, UserListItem } from '@/api/types';
import { formatDate, formatLabel, formatAdminRole } from '@/utils/format';
import { PLATFORM_ROLES } from '@/utils/permissions';

const STATUS_OPTIONS = ['ACTIVE', 'SUSPENDED', 'BANNED', 'PENDING'];

const STAFF_TABS: { value: 'ALL' | PlatformStaffType; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'GLOBAL_ADMIN', label: 'Global' },
  { value: 'CONTINENT_ADMIN', label: 'Continent' },
  { value: 'COUNTRY_ADMIN', label: 'Country' },
  { value: 'REGIONAL_ADMIN', label: 'Region Head' },
  { value: 'CITY_ADMIN', label: 'City' },
  { value: 'SUB_ADMIN', label: 'Sub Admin' },
  { value: 'FLEET_OWNER', label: 'Fleet Owner' },
  { value: 'REGIONAL_FLEET', label: 'Regional Fleet' },
  { value: 'FLEET_FINANCE', label: 'Fleet Finance' },
  { value: 'FLEET_SUPPORT', label: 'Fleet Support' },
  { value: 'FINANCE_USER', label: 'Finance User' },
  { value: 'PLATFORM_SUPPORT', label: 'Platform Support' },
];

function staffTypeLabel(type: PlatformStaffType) {
  return formatAdminRole(type);
}

function PlatformStaffList() {
  const navigate = useNavigate();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const {
    canCreateStaff,
    listableStaffRoles,
    isFleetOwner,
    isRegionalFleet,
    isFleetSupport,
    isFleetFinance,
  } = useAdminScope();
  const isFleetTeamRole = isFleetOwner || isRegionalFleet || isFleetSupport || isFleetFinance;
  const visibleTabs = useMemo(
    () => STAFF_TABS.filter((t) => t.value === 'ALL' || listableStaffRoles.includes(t.value as AdminRole)),
    [listableStaffRoles],
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'ALL' | PlatformStaffType>('ALL');
  const [resetTarget, setResetTarget] = useState<PlatformStaffUser | null>(null);
  const [resetCredentials, setResetCredentials] = useState<{ email: string; password: string } | null>(
    null,
  );
  const debouncedSearch = useDebounce(search);

  useEffect(() => {
    if (!visibleTabs.some((t) => t.value === type)) setType('ALL');
  }, [visibleTabs, type]);

  const { data, isLoading } = useQuery({
    queryKey: ['platform-staff', page, rowsPerPage, debouncedSearch, type],
    queryFn: () =>
      listPlatformStaff({
        page: page + 1,
        limit: rowsPerPage,
        search: debouncedSearch || undefined,
        type: type === 'ALL' ? undefined : type,
      }),
  });

  const resetMutation = useMutation({
    mutationFn: (userId: string) => resetUserPassword(userId),
    onSuccess: (result) => {
      setResetTarget(null);
      setResetCredentials({ email: result.email, password: result.temporaryPassword });
      notify.success('Password reset. Share the new temporary password now.');
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

  const columns: DataTableColumn<PlatformStaffUser>[] = [
    { id: 'fullName', label: 'Name', width: '14%', render: (r) => r.fullName ?? '—' },
    { id: 'email', label: 'Email', width: '20%', render: (r) => r.email ?? '—' },
    { id: 'phone', label: 'Phone', width: '14%' },
    {
      id: 'staffType',
      label: 'Type',
      width: '12%',
      render: (r) => <Chip size="small" label={staffTypeLabel(r.staffType)} />,
    },
    {
      id: 'scopeLabel',
      label: 'Scope',
      width: '16%',
      render: (r) => r.scopeLabel || '—',
    },
    {
      id: 'fleets',
      label: 'Fleet',
      width: '14%',
      render: (r) => r.fleets.map((f) => f.legalName).join(', ') || '—',
    },
    { id: 'createdAt', label: 'Created', width: '12%', render: (r) => formatDate(r.createdAt) },
    {
      id: 'actions',
      label: 'Actions',
      align: 'right',
      width: 220,
      nowrap: false,
      render: (r) =>
        r.id !== currentUser?.id ? (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }} onClick={(e) => e.stopPropagation()}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setEditUserId(r.id)}
            >
              Edit
            </Button>
            {r.email ? (
              <Button
                size="small"
                variant="outlined"
                color="warning"
                onClick={() => setResetTarget(r)}
              >
                Reset
              </Button>
            ) : null}
          </Box>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title={isFleetTeamRole ? 'Fleet Team' : 'Platform Users'}
        subtitle={
          isFleetOwner
            ? 'Invite Regional Fleet, Fleet Finance, and Fleet Support for your company'
            : isRegionalFleet
              ? 'Invite Fleet Support for your city'
              : isFleetTeamRole
                ? 'Team members in your fleet'
                : 'Invite down the ladder: Global → Continent → Country → Regional → City → Fleet Owner'
        }
        actions={
          canCreateStaff ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
              Create user
            </Button>
          ) : undefined
        }
      />
      {visibleTabs.length > 1 ? (
        <Tabs
          value={visibleTabs.some((t) => t.value === type) ? type : 'ALL'}
          variant="scrollable"
          scrollButtons="auto"
          onChange={(_, v: 'ALL' | PlatformStaffType) => {
            setType(v);
            setPage(0);
          }}
          sx={{ mb: 2 }}
        >
          {visibleTabs.map((t) => (
            <Tab key={t.value} value={t.value} label={t.label} />
          ))}
        </Tabs>
      ) : null}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          label="Search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: 220 }}
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
        onRowClick={(r) => {
          if (r.staffType === 'FLEET_OWNER' && r.fleets[0]) {
            navigate(`/fleet/${r.fleets[0].id}`);
            return;
          }
          navigate(`/users/${r.id}`);
        }}
      />
      <CreatePlatformStaffDialog
        open={createOpen}
        defaultType={type === 'ALL' ? undefined : type}
        onClose={() => setCreateOpen(false)}
        onCreated={({ userId, companyId }) => {
          if (companyId) navigate(`/fleet/${companyId}`);
          else navigate(`/users/${userId}`);
        }}
      />
      <EditPlatformStaffDialog
        open={Boolean(editUserId)}
        userId={editUserId}
        onClose={() => setEditUserId(null)}
        onUpdated={() => {
          queryClient.invalidateQueries({ queryKey: ['platform-staff'] });
          if (editUserId) queryClient.invalidateQueries({ queryKey: ['user', editUserId] });
        }}
      />

      <ConfirmDialog
        open={Boolean(resetTarget)}
        title="Reset password?"
        message={`Reset the portal password for ${resetTarget?.fullName ?? resetTarget?.email ?? 'this user'}? Their current sessions will be signed out. A new temporary password is shown once.`}
        confirmLabel="Reset password"
        confirmColor="warning"
        loading={resetMutation.isPending}
        onConfirm={() => resetTarget && resetMutation.mutate(resetTarget.id)}
        onCancel={() => {
          if (!resetMutation.isPending) setResetTarget(null);
        }}
      />

      <Dialog
        open={Boolean(resetCredentials)}
        onClose={() => setResetCredentials(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Password reset</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <Alert severity="success">Share these credentials now. The password is shown only once.</Alert>
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
                        onClick={() => resetCredentials && handleCopy('Email', resetCredentials.email)}
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
            <Button
              type="button"
              variant="outlined"
              onClick={() =>
                resetCredentials &&
                handleCopy(
                  'Credentials',
                  `Rideality login\nEmail: ${resetCredentials.email}\nPassword: ${resetCredentials.password}`,
                )
              }
            >
              Copy email & password
            </Button>
          </Box>
          <Typography variant="body2" color="text.secondary">
            They must change this password on first login.
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

export default function UsersListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can, isSuperAdmin } = usePermissions();
  const staffAdminRoles: AdminRole[] = [
    'SUPER_ADMIN',
    'GLOBAL_ADMIN',
    'CONTINENT_ADMIN',
    'COUNTRY_ADMIN',
    'REGIONAL_ADMIN',
    'CITY_ADMIN',
    'SUB_ADMIN',
    'FINANCE_USER',
    'PLATFORM_SUPPORT',
    'FLEET_OWNER',
    'REGIONAL_FLEET',
    'FLEET_FINANCE',
    'FLEET_SUPPORT',
  ];
  const showStaffList =
    isSuperAdmin ||
    (user?.adminRole != null && staffAdminRoles.includes(user.adminRole)) ||
    can('ADMIN_VIEW') ||
    can('ADMIN_CREATE');
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const debouncedSearch = useDebounce(search);

  const { data, isLoading } = useQuery({
    queryKey: ['users', page, rowsPerPage, debouncedSearch, status, role],
    queryFn: () =>
      listUsers({
        page: page + 1,
        limit: rowsPerPage,
        search: debouncedSearch || undefined,
        status: status || undefined,
        role: role || undefined,
      }),
    enabled: !showStaffList,
  });

  if (showStaffList) return <PlatformStaffList />;

  const columns: DataTableColumn<UserListItem>[] = [
    { id: 'fullName', label: 'Name', width: '16%', render: (r) => r.fullName ?? '—' },
    { id: 'email', label: 'Email', width: '22%', render: (r) => r.email ?? '—' },
    { id: 'phone', label: 'Phone', width: '14%' },
    {
      id: 'status',
      label: 'Status',
      width: '10%',
      nowrap: false,
      render: (r) => (
        <Chip
          size="small"
          label={formatLabel(r.status)}
          color={r.status === 'ACTIVE' ? 'success' : r.status === 'BANNED' ? 'error' : 'default'}
        />
      ),
    },
    {
      id: 'roles',
      label: 'Roles',
      width: '22%',
      render: (r) => r.roles.map((x) => formatLabel(x)).join(', ') || '—',
    },
    { id: 'createdAt', label: 'Joined', width: '12%', render: (r) => formatDate(r.createdAt) },
    {
      id: 'actions',
      label: 'Actions',
      width: 48,
      align: 'right',
      nowrap: false,
      render: (r) =>
        can('manage_roles') ? (
          <Tooltip title="Manage access">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/users/${r.id}`, { state: { tab: 'access' } });
              }}
            >
              <SecurityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Create users, assign roles, and manage portal access"
        actions={
          can('manage_users') ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
              Create user
            </Button>
          ) : undefined
        }
      />
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          label="Search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: 220 }}
        />
        <TextField
          select
          size="small"
          label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="">All</MenuItem>
          {STATUS_OPTIONS.map((s) => (
            <MenuItem key={s} value={s}>
              {formatLabel(s)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Platform role"
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">All</MenuItem>
          {PLATFORM_ROLES.map((r) => (
            <MenuItem key={r} value={r}>
              {formatLabel(r)}
            </MenuItem>
          ))}
        </TextField>
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
        onRowClick={(r) => navigate(`/users/${r.id}`)}
      />

      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(userId) => navigate(`/users/${userId}`, { state: { tab: 'access' } })}
      />
    </>
  );
}
