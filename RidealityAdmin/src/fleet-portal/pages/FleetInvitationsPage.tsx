import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';
import MailOutlineOutlinedIcon from '@mui/icons-material/MailOutlineOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ScheduleIcon from '@mui/icons-material/Schedule';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { useParams } from 'react-router-dom';
import {
  createFleetInvite,
  listFleetInvites,
  searchFleetInviteCandidates,
} from '@/api/fleet.api';
import { getApiErrorMessage } from '@/api/client';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import FleetContentCard from '@/fleet-portal/components/FleetContentCard';
import FleetMetricCard from '@/fleet-portal/components/FleetMetricCard';
import FleetMetricRow, { FleetMetricCell } from '@/fleet-portal/components/FleetMetricRow';
import FleetPageHero from '@/fleet-portal/components/FleetPageHero';
import { useDebounce } from '@/hooks/useDebounce';
import { useNotify } from '@/services/notification';
import type { FleetInviteListItem } from '@/api/fleet.api';
import type { FleetInviteCandidate } from '@/api/types';
import { formatDate, formatLabel } from '@/utils/format';

export default function FleetInvitationsPage() {
  const { companyId = '' } = useParams();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<FleetInviteCandidate | null>(null);
  const debouncedSearch = useDebounce(search);
  const notify = useNotify();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['fleet-invites', companyId],
    queryFn: () => listFleetInvites(companyId),
    enabled: Boolean(companyId),
  });

  const stats = useMemo(() => {
    const invites = data ?? [];
    return {
      total: invites.length,
      pending: invites.filter((i) => i.status === 'pending').length,
      accepted: invites.filter((i) => i.status === 'accepted').length,
    };
  }, [data]);

  const { data: candidates, isLoading: searchLoading } = useQuery({
    queryKey: ['fleet-invite-candidates', companyId, debouncedSearch],
    queryFn: () => searchFleetInviteCandidates(companyId, debouncedSearch),
    enabled: open && debouncedSearch.length >= 2,
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      createFleetInvite(companyId, {
        userId: selected?.id,
        email: selected?.email ?? undefined,
        phone: selected?.phone ?? undefined,
      }),
    onSuccess: () => {
      notify.success('Invitation sent');
      setOpen(false);
      setSelected(null);
      setSearch('');
      queryClient.invalidateQueries({ queryKey: ['fleet-invites', companyId] });
      queryClient.invalidateQueries({ queryKey: ['fleet-dashboard', companyId] });
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const columns: DataTableColumn<FleetInviteListItem>[] = [
    { id: 'target', label: 'Invitee', render: (r) => r.invitedUserName ?? r.email ?? r.phone ?? '—' },
    {
      id: 'status',
      label: 'Status',
      render: (r) => (
        <Chip
          size="small"
          label={formatLabel(r.status)}
          color={r.status === 'pending' ? 'warning' : r.status === 'accepted' ? 'success' : 'default'}
        />
      ),
    },
    { id: 'created', label: 'Sent', render: (r) => formatDate(r.createdAt) },
    { id: 'expires', label: 'Expires', render: (r) => formatDate(r.expiresAt) },
  ];

  return (
    <Box>
      <FleetPageHero
        badge="Onboarding"
        title="Driver invitations"
        description="Invite new drivers to join your fleet and track pending acceptance status."
        actions={
          <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => setOpen(true)}>
            New invitation
          </Button>
        }
      />
      <FleetMetricRow>
        <FleetMetricCell>
          <FleetMetricCard label="Total invites" value={stats.total} icon={<MailOutlineOutlinedIcon fontSize="small" />} accent="blue" />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard label="Pending" value={stats.pending} icon={<ScheduleIcon fontSize="small" />} accent="amber" />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard label="Accepted" value={stats.accepted} icon={<CheckCircleIcon fontSize="small" />} accent="emerald" />
        </FleetMetricCell>
      </FleetMetricRow>
      <FleetContentCard title="Invitation history" subtitle="All sent invites and their current status">
        <DataTable
          columns={columns}
          rows={data ?? []}
          rowKey={(r) => r.id}
          page={0}
          rowsPerPage={data?.length ?? 20}
          total={data?.length ?? 0}
          onPageChange={() => {}}
          onRowsPerPageChange={() => {}}
          loading={isLoading}
          paperSx={{ border: 0, boxShadow: 'none' }}
        />
      </FleetContentCard>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Invite driver</DialogTitle>
        <DialogContent>
          <Autocomplete
            sx={{ mt: 1 }}
            options={candidates ?? []}
            loading={searchLoading}
            filterOptions={(x) => x}
            getOptionLabel={(o) =>
              [o.fullName, o.email, o.phone].filter(Boolean).join(' · ') || o.id
            }
            isOptionEqualToValue={(a, b) => a.id === b.id}
            onInputChange={(_, v) => setSearch(v)}
            onChange={(_, v) => setSelected(v)}
            noOptionsText={
              debouncedSearch.length < 2
                ? 'Type at least 2 characters to search'
                : 'No users found in this fleet region'
            }
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                <Box>
                  <Box sx={{ fontWeight: 600 }}>{option.fullName ?? option.email ?? option.phone}</Box>
                  <Box sx={{ fontSize: 12, color: 'text.secondary' }}>
                    {[option.email, option.phone, option.status, option.roles?.join(', ')]
                      .filter(Boolean)
                      .join(' · ')}
                  </Box>
                </Box>
              </li>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Search user"
                placeholder="Name, email, or phone (min 2 chars)"
                helperText="Shows users in the same region who are not already in this fleet"
              />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!selected || inviteMutation.isPending} onClick={() => inviteMutation.mutate()}>
            Send invite
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
