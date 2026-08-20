import { useState } from 'react';
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
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import {
  getFleetCompany,
  listFleetTeam,
  listManagedFleetRegions,
  removeTeamMember,
  resetFleetStaffPassword,
  updateTeamMember,
} from '@/api/fleet.api';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import ConfirmDialog from '@/components/ConfirmDialog';
import FleetContentCard from '@/fleet-portal/components/FleetContentCard';
import CreateFleetStaffDialog from '@/fleet-portal/components/CreateFleetStaffDialog';
import FleetMetricCard from '@/fleet-portal/components/FleetMetricCard';
import FleetMetricRow, { FleetMetricCell } from '@/fleet-portal/components/FleetMetricRow';
import FleetPageHero from '@/fleet-portal/components/FleetPageHero';
import GroupsIcon from '@mui/icons-material/Groups';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import type { FleetTeamMember } from '@/api/fleet.api';
import { formatDate, formatLabel } from '@/utils/format';
import { getApiErrorMessage } from '@/api/client';
import { copyToClipboard } from '@/utils/clipboard';
import { useActiveFleetMembership, useFleetAccessTier } from '@/hooks/useFleetPortalMode';
import { useNotify } from '@/services/notification';

function roleLabel(role: string) {
  if (role === 'regional' || role === 'manager') return 'Regional user';
  if (role === 'support' || role === 'dispatcher') return 'Support team';
  if (role === 'owner') return 'Owner';
  return formatLabel(role);
}

export default function FleetTeamPage() {
  const { companyId = '' } = useParams();
  const queryClient = useQueryClient();
  const notify = useNotify();
  const tier = useFleetAccessTier(companyId);
  const membership = useActiveFleetMembership(companyId);
  const canInviteRegional = tier === 'owner';
  const canInviteSupport = tier === 'regional';

  const [createOpen, setCreateOpen] = useState(false);
  const [inviteKind, setInviteKind] = useState<'regional' | 'support'>('support');
  const [regionId, setRegionId] = useState(membership?.fleetRegionId ?? '');
  const [anchor, setAnchor] = useState<{ el: HTMLElement; member: FleetTeamMember } | null>(null);
  const [editTarget, setEditTarget] = useState<FleetTeamMember | null>(null);
  const [editRole, setEditRole] = useState<'regional' | 'support'>('regional');
  const [editCityId, setEditCityId] = useState('');
  const [removeTarget, setRemoveTarget] = useState<FleetTeamMember | null>(null);
  const [resetTarget, setResetTarget] = useState<FleetTeamMember | null>(null);
  const [resetCredentials, setResetCredentials] = useState<{ email: string; password: string } | null>(null);

  const { data: company } = useQuery({
    queryKey: ['fleet-company', companyId],
    queryFn: () => getFleetCompany(companyId),
    enabled: Boolean(companyId),
  });

  const { data: members, isLoading } = useQuery({
    queryKey: ['fleet-team', companyId],
    queryFn: () => listFleetTeam(companyId),
    enabled: Boolean(companyId),
  });

  const { data: regions = [] } = useQuery({
    queryKey: ['fleet-managed-regions', companyId],
    queryFn: () => listManagedFleetRegions(companyId),
    enabled: Boolean(companyId) && (createOpen || Boolean(editTarget) || canInviteRegional),
  });

  const roleMutation = useMutation({
    mutationFn: ({
      id,
      newRole,
      fleetRegionId,
    }: {
      id: string;
      newRole: 'regional' | 'support';
      fleetRegionId?: string;
    }) => updateTeamMember(companyId, id, { role: newRole, fleetRegionId }),
    onSuccess: () => {
      notify.success('Team member updated');
      queryClient.invalidateQueries({ queryKey: ['fleet-team', companyId] });
      setAnchor(null);
      setEditTarget(null);
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeTeamMember(companyId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fleet-team', companyId] });
      setRemoveTarget(null);
      setAnchor(null);
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const resetMutation = useMutation({
    mutationFn: (id: string) => resetFleetStaffPassword(companyId, id),
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
      notify.error(`Could not copy ${label.toLowerCase()}.`);
    }
  };

  const columns: DataTableColumn<FleetTeamMember>[] = [
    { id: 'name', label: 'Member', render: (m) => m.fullName ?? m.email ?? m.phone },
    { id: 'role', label: 'Role', render: (m) => <Chip size="small" label={roleLabel(m.role)} /> },
    { id: 'city', label: 'City', render: (m) => m.fleetRegionName ?? (m.role === 'owner' ? 'All cities' : '—') },
    { id: 'email', label: 'Email', render: (m) => m.email ?? '—' },
    { id: 'joined', label: 'Joined', render: (m) => formatDate(m.joinedAt) },
    {
      id: 'actions',
      label: '',
      align: 'right',
      width: 160,
      render: (m) => {
        const isSupport = m.role === 'support' || m.role === 'dispatcher';
        const ticketsCityId = m.fleetRegionId ?? membership?.fleetRegionId;
        const canOpenTickets = isSupport && Boolean(ticketsCityId) && (tier === 'regional' || tier === 'owner');
        return (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 0.5 }}>
            {canOpenTickets && (
              <Button
                size="small"
                component={RouterLink}
                to={`/portal/${companyId}/regions/${ticketsCityId}?tab=tickets`}
              >
                Tickets
              </Button>
            )}
            {m.role !== 'owner' && canInviteRegional ? (
              <IconButton size="small" onClick={(e) => setAnchor({ el: e.currentTarget, member: m })}>
                <MoreVertIcon fontSize="small" />
              </IconButton>
            ) : null}
          </Box>
        );
      },
    },
  ];

  const occupiedCityIds = new Set(
    (members ?? [])
      .filter((m) => (m.role === 'regional' || m.role === 'manager') && m.fleetRegionId)
      .map((m) => m.fleetRegionId as string),
  );

  const availableCitiesForCreate =
    inviteKind === 'regional' ? regions.filter((r) => !occupiedCityIds.has(r.id)) : regions;

  const availableCitiesForEdit = regions.filter(
    (r) => !occupiedCityIds.has(r.id) || r.id === editTarget?.fleetRegionId,
  );

  const openCreate = (kind: 'regional' | 'support') => {
    setInviteKind(kind);
    const available =
      kind === 'regional'
        ? regions.filter((r) => !occupiedCityIds.has(r.id))
        : regions;
    setRegionId(membership?.fleetRegionId ?? available[0]?.id ?? '');
    setCreateOpen(true);
  };

  return (
    <Box>
      <FleetPageHero
        badge="Access control"
        title="Team members"
        description="Regional users manage a city. Support staff are invited by regional fleet and stay in that city."
        actions={
          canInviteRegional || canInviteSupport ? (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {canInviteRegional && (
                <Button
                  variant="contained"
                  startIcon={<PersonAddIcon />}
                  onClick={() => openCreate('regional')}
                  disabled={regions.length > 0 && regions.every((r) => occupiedCityIds.has(r.id))}
                >
                  Create Regional User
                </Button>
              )}
              {canInviteSupport && (
                <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => openCreate('support')}>
                  Create Support Team
                </Button>
              )}
            </Box>
          ) : undefined
        }
      />
      <FleetMetricRow>
        <FleetMetricCell>
          <FleetMetricCard label="Team size" value={members?.length ?? 0} icon={<GroupsIcon fontSize="small" />} accent="blue" />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard
            label="Fleet owner"
            value={company?.owner?.profile?.fullName?.split(' ')[0] ?? '—'}
            icon={<AdminPanelSettingsIcon fontSize="small" />}
            accent="indigo"
          />
        </FleetMetricCell>
      </FleetMetricRow>
      <FleetContentCard title="Team roster" subtitle="Owners, regional users, and support team">
        <DataTable
          columns={columns}
          rows={members ?? []}
          rowKey={(m) => m.id}
          page={0}
          rowsPerPage={members?.length ?? 20}
          total={members?.length ?? 0}
          onPageChange={() => {}}
          onRowsPerPageChange={() => {}}
          loading={isLoading}
          paperSx={{ border: 0, boxShadow: 'none' }}
        />
      </FleetContentCard>

      <Menu open={Boolean(anchor)} anchorEl={anchor?.el} onClose={() => setAnchor(null)}>
        <MenuItem
          onClick={() => {
            if (!anchor) return;
            setResetTarget(anchor.member);
            setAnchor(null);
          }}
        >
          Reset password
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (!anchor) return;
            setEditTarget(anchor.member);
            setEditRole(anchor.member.role === 'support' ? 'support' : 'regional');
            setEditCityId(anchor.member.fleetRegionId ?? regions[0]?.id ?? '');
            setAnchor(null);
          }}
        >
          Edit role / city
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (anchor) {
              setRemoveTarget(anchor.member);
              setAnchor(null);
            }
          }}
          sx={{ color: 'error.main' }}
        >
          Remove member
        </MenuItem>
      </Menu>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Remove team member?"
        message={`Remove ${removeTarget?.fullName ?? removeTarget?.email ?? removeTarget?.phone ?? 'this member'} from the fleet team? They will lose access to this fleet portal.`}
        confirmLabel="Remove"
        confirmColor="error"
        loading={removeMutation.isPending}
        onConfirm={() => removeTarget && removeMutation.mutate(removeTarget.id)}
        onCancel={() => {
          if (!removeMutation.isPending) setRemoveTarget(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(resetTarget)}
        title="Reset password?"
        message={`Reset the portal password for ${resetTarget?.fullName ?? resetTarget?.email ?? 'this member'}? Their current sessions will be signed out. A new temporary password is shown once.`}
        confirmLabel="Reset password"
        loading={resetMutation.isPending}
        onConfirm={() => resetTarget && resetMutation.mutate(resetTarget.id)}
        onCancel={() => {
          if (!resetMutation.isPending) setResetTarget(null);
        }}
      />

      <Dialog open={Boolean(resetCredentials)} onClose={() => setResetCredentials(null)} maxWidth="sm" fullWidth>
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
                        onClick={() => resetCredentials && handleCopy('Password', resetCredentials.password)}
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

      <CreateFleetStaffDialog
        open={createOpen}
        companyId={companyId}
        role={inviteKind}
        cities={
          membership?.fleetRegionId
            ? availableCitiesForCreate.filter((r) => r.id === membership.fleetRegionId)
            : availableCitiesForCreate
        }
        defaultCityId={membership?.fleetRegionId ?? regionId}
        lockCity={Boolean(membership?.fleetRegionId)}
        phonePrefix={company?.region?.phonePrefix}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['fleet-team', companyId] });
          queryClient.invalidateQueries({ queryKey: ['fleet-managed-regions', companyId] });
        }}
      />

      <Dialog open={Boolean(editTarget)} onClose={() => setEditTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit team member</DialogTitle>
        <DialogContent>
          <TextField
            select
            fullWidth
            label="Role"
            value={editRole}
            onChange={(e) => setEditRole(e.target.value as 'regional' | 'support')}
            margin="normal"
          >
            <MenuItem value="regional">Regional user</MenuItem>
            <MenuItem value="support">Support team</MenuItem>
          </TextField>
          {editRole === 'regional' && (
          <TextField
            select
            fullWidth
            label="City"
            value={editCityId}
            onChange={(e) => setEditCityId(e.target.value)}
            margin="normal"
            helperText="Each city can have only one regional user."
          >
            {availableCitiesForEdit.map((r) => (
              <MenuItem key={r.id} value={r.id}>
                {r.name}
              </MenuItem>
            ))}
          </TextField>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditTarget(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={(editRole === 'regional' && !editCityId) || roleMutation.isPending}
            onClick={() =>
              editTarget &&
              roleMutation.mutate({
                id: editTarget.id,
                newRole: editRole,
                fleetRegionId: editRole === 'support' ? null : editCityId,
              })
            }
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
