import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import {
  adminUpdateFleet,
  getFleetCompany,
  listFleetDrivers,
  listManagedFleetRegions,
  removeFleetDriver,
  updateFleetCompany,
} from '@/api/fleet.api';
import { listUsers } from '@/api/users.api';
import { listActiveRegions } from '@/api/regions.api';
import { getApiErrorMessage } from '@/api/client';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { usePermissions } from '@/hooks/usePermissions';
import { useAdminScope } from '@/hooks/useAdminScope';
import { useNotify } from '@/services/notification';
import type { FleetCompanyStatus, FleetDriver, UserListItem } from '@/api/types';
import { formatDate, formatLabel } from '@/utils/format';
import { useDebounce } from '@/hooks/useDebounce';
import FleetWalletPanel from '@/modules/finance/FleetWalletPanel';

type FleetTab = 'overview' | 'drivers' | 'wallet';

function statusColor(status: string): 'default' | 'success' | 'warning' | 'error' {
  if (status === 'active') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'suspended') return 'error';
  return 'default';
}

export default function CompanyDetailPage() {
  const { id = '' } = useParams();
  const [tab, setTab] = useState<FleetTab>('overview');
  const [driverRegionId, setDriverRegionId] = useState<string | null>(null);
  const [legalName, setLegalName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [status, setStatus] = useState<FleetCompanyStatus>('pending');
  const [statusReason, setStatusReason] = useState('');
  const [regionId, setRegionId] = useState('');
  const [removeDriverId, setRemoveDriverId] = useState<string | null>(null);
  const [ownerUserId, setOwnerUserId] = useState('');
  const [ownerSearch, setOwnerSearch] = useState('');
  const debouncedOwnerSearch = useDebounce(ownerSearch);
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { can, isSuperAdmin } = usePermissions();
  const { role, scopeType, cityId } = useAdminScope();
  const canManageFleet = can('manage_fleets');
  const canAssignOwner =
    isSuperAdmin ||
    role === 'GLOBAL_ADMIN' ||
    role === 'CONTINENT_ADMIN' ||
    role === 'COUNTRY_ADMIN' ||
    role === 'SUB_ADMIN';
  const canViewWallet = canManageFleet || can('view_finance') || can('WALLET_VIEW');
  const canViewDrivers = canManageFleet || can('manage_drivers') || can('DRIVER_VIEW');
  const isCityScoped = scopeType === 'CITY';

  const tabs = useMemo(() => {
    const items: { key: FleetTab; label: string }[] = [{ key: 'overview', label: 'Overview' }];
    if (canViewDrivers) items.push({ key: 'drivers', label: 'Drivers' });
    if (canViewWallet) items.push({ key: 'wallet', label: 'Wallet' });
    return items;
  }, [canViewDrivers, canViewWallet]);

  const { data: company, isLoading } = useQuery({
    queryKey: ['fleet-company', id],
    queryFn: () => getFleetCompany(id),
    enabled: Boolean(id),
  });

  const { data: regions = [] } = useQuery({
    queryKey: ['active-regions'],
    queryFn: listActiveRegions,
    enabled: canAssignOwner,
  });

  const { data: drivers = [], isLoading: driversLoading } = useQuery({
    queryKey: ['fleet-drivers', id, driverRegionId],
    queryFn: () => listFleetDrivers(id, { regionId: driverRegionId ?? undefined }),
    enabled: Boolean(id) && tab === 'drivers',
  });

  const { data: cities = [] } = useQuery({
    queryKey: ['fleet-managed-regions', id],
    queryFn: () => listManagedFleetRegions(id),
    enabled: Boolean(id),
  });

  const { data: ownerCandidatesData, isFetching: ownerCandidatesLoading } = useQuery({
    queryKey: ['fleet-owner-candidates', debouncedOwnerSearch],
    queryFn: () =>
      listUsers({ page: 1, limit: 20, search: debouncedOwnerSearch, status: 'ACTIVE' }),
    enabled: canAssignOwner && debouncedOwnerSearch.trim().length >= 2,
  });

  const ownerCandidates = (ownerCandidatesData?.data ?? []).filter((u) => u.status === 'ACTIVE');

  const updateMutation = useMutation({
    mutationFn: () => {
      if (canAssignOwner) {
        const trimmedReason = statusReason.trim();
        return adminUpdateFleet(id, {
          legalName,
          taxId: taxId || null,
          status,
          regionId: regionId || undefined,
          ...(ownerUserId ? { ownerUserId } : {}),
          ...(status === 'suspended' || status === 'pending'
            ? { statusReason: trimmedReason || null }
            : { statusReason: null }),
        });
      }
      return updateFleetCompany(id, {
        legalName,
        taxId: taxId || undefined,
      });
    },
    onSuccess: () => {
      notify.success('Fleet company updated');
      queryClient.invalidateQueries({ queryKey: ['fleet-company', id] });
      queryClient.invalidateQueries({ queryKey: ['fleet-companies'] });
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeFleetDriver(id, userId),
    onSuccess: () => {
      notify.success('Driver removed');
      setRemoveDriverId(null);
      queryClient.invalidateQueries({ queryKey: ['fleet-drivers', id] });
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) setTab('overview');
  }, [tab, tabs]);

  useEffect(() => {
    if (!isCityScoped || !cityId || cities.length === 0) return;
    const homeCity = cities.find((c) => c.geoCityId === cityId) ?? cities[0];
    if (homeCity) setDriverRegionId(homeCity.id);
  }, [isCityScoped, cityId, cities]);

  useEffect(() => {
    if (company) {
      setLegalName(company.legalName);
      setTaxId(company.taxId ?? '');
      setStatus(company.status as FleetCompanyStatus);
      setStatusReason(company.statusReason ?? '');
      setRegionId(company.regionId);
      setOwnerUserId(company.ownerUserId);
      const ownerLabel =
        company.owner?.profile?.fullName ?? company.owner?.email ?? company.ownerUserId;
      setOwnerSearch(ownerLabel);
    }
  }, [company]);

  function formatOwnerLabel(user: UserListItem): string {
    const name = user.fullName ?? user.email ?? user.phone;
    return user.email ? `${name} (${user.email})` : name;
  }

  if (isLoading || !company) {
    return <Typography>Loading company...</Typography>;
  }

  const operatingCityNames = cities.map((c) => c.name).filter(Boolean);
  const headerCity =
    (isCityScoped && cities.find((c) => c.geoCityId === cityId)?.name) ||
    operatingCityNames[0] ||
    null;

  const driverColumns: DataTableColumn<FleetDriver>[] = [
    {
      id: 'name',
      label: 'Driver',
      render: (r) => r.fullName ?? r.user?.profile?.fullName ?? r.user?.phone ?? r.userId,
    },
    { id: 'city', label: 'City', render: (r) => r.fleetRegionName ?? '—' },
    { id: 'onboardingStatus', label: 'Status', render: (r) => formatLabel(r.onboardingStatus) },
    { id: 'driverType', label: 'Type', render: (r) => formatLabel(r.driverType ?? '—') },
    {
      id: 'actions',
      label: 'Actions',
      align: 'right',
      render: (r) => (
        <Button size="small" color="error" onClick={() => setRemoveDriverId(r.userId)}>
          Remove
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={company.legalName}
        badge="Fleet"
        subtitle={
          headerCity
            ? `${headerCity} · Company ID: ${company.id}`
            : `Company ID: ${company.id}`
        }
        breadcrumbs={[
          { label: 'Fleet', to: '/fleet' },
          { label: company.legalName },
        ]}
      />

      {company.status === 'pending' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          This fleet is <strong>pending approval</strong>. Set status to <strong>Active</strong> below to approve it for operations.
          {company.statusReason ? (
            <>
              {' '}
              Reason: <strong>{company.statusReason}</strong>
            </>
          ) : null}
        </Alert>
      )}
      {company.status === 'suspended' && (
        <Alert severity="error" sx={{ mb: 2 }}>
          This fleet is <strong>suspended</strong>
          {company.statusReason ? (
            <>
              : {company.statusReason}
            </>
          ) : (
            '.'
          )}{' '}
          Fleet staff cannot sign in until status is Active again.
        </Alert>
      )}

      <Tabs
        value={tabs.findIndex((t) => t.key === tab)}
        onChange={(_, idx) => setTab(tabs[idx]?.key ?? 'overview')}
        sx={{ mb: 2 }}
      >
        {tabs.map((t) => (
          <Tab key={t.key} label={t.label} />
        ))}
      </Tabs>

      {tab === 'overview' && (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: canAssignOwner ? 6 : 12 }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Details
              </Typography>
              <Chip
                label={formatLabel(company.status)}
                size="small"
                color={statusColor(company.status)}
                sx={{ mb: 1 }}
              />
              <Typography variant="body2">
                Region: {company.region?.name ?? company.regionId}
                {company.region?.code ? ` (${company.region.code})` : ''}
              </Typography>
              <Typography variant="body2">
                Owner: {company.owner?.profile?.fullName ?? company.owner?.email ?? company.ownerUserId}
              </Typography>
              <Typography variant="body2">
                Operating {operatingCityNames.length === 1 ? 'city' : 'cities'}:{' '}
                {operatingCityNames.length ? operatingCityNames.join(', ') : '—'}
              </Typography>
              <Typography variant="body2">Created: {formatDate(company.createdAt)}</Typography>
            </Paper>
          </Grid>
          {canAssignOwner && (
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Admin — edit company
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  label="Legal name"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value.slice(0, 120))}
                  fullWidth
                  inputProps={{ maxLength: 120 }}
                  helperText="Max 120 characters"
                />
                <TextField
                  label="Tax ID"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value.slice(0, 50))}
                  fullWidth
                  inputProps={{ maxLength: 50 }}
                  helperText="Optional — letters, numbers, - . /"
                />
                {canAssignOwner && (
                  <>
                    <Autocomplete
                        options={ownerCandidates}
                        getOptionLabel={(option) => formatOwnerLabel(option)}
                        isOptionEqualToValue={(a, b) => a.id === b.id}
                        inputValue={ownerSearch}
                        onInputChange={(_, value) => {
                          setOwnerSearch(value);
                          if (ownerUserId && !value.trim()) setOwnerUserId('');
                        }}
                        onChange={(_, value) => {
                          if (value) {
                            setOwnerUserId(value.id);
                            setOwnerSearch(formatOwnerLabel(value));
                            if (value.regionId) setRegionId(value.regionId);
                          }
                        }}
                        loading={ownerCandidatesLoading}
                        noOptionsText={
                          ownerSearch.trim().length < 2
                            ? 'Type at least 2 characters'
                            : 'No active users found'
                        }
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Fleet owner"
                            placeholder="Search active users"
                            helperText="Only active users; region follows the owner"
                          />
                        )}
                      />
                    <FormControl fullWidth>
                      <InputLabel id="fleet-status-label">Status</InputLabel>
                      <Select
                        labelId="fleet-status-label"
                        label="Status"
                        value={status}
                        onChange={(e) => {
                          const next = e.target.value as FleetCompanyStatus;
                          setStatus(next);
                          if (next === 'active') setStatusReason('');
                        }}
                      >
                        <MenuItem value="pending">Pending</MenuItem>
                        <MenuItem value="active">Active</MenuItem>
                        <MenuItem value="suspended">Suspended</MenuItem>
                      </Select>
                    </FormControl>
                    {(status === 'suspended' || status === 'pending') && (
                      <TextField
                        label={status === 'suspended' ? 'Suspension reason' : 'Status reason (optional)'}
                        value={statusReason}
                        onChange={(e) => setStatusReason(e.target.value.slice(0, 500))}
                        fullWidth
                        required={status === 'suspended'}
                        multiline
                        minRows={2}
                        inputProps={{ maxLength: 500 }}
                        helperText={
                          status === 'suspended'
                            ? 'Required — shown to fleet staff when they try to sign in'
                            : 'Optional — shown to fleet staff if they try to sign in while pending'
                        }
                      />
                    )}
                    <FormControl fullWidth>
                      <InputLabel id="fleet-region-label">Country / region</InputLabel>
                      <Select
                        labelId="fleet-region-label"
                        label="Country / region"
                        value={regionId}
                        disabled
                      >
                        {regions.map((region) => (
                          <MenuItem key={region.id} value={region.id}>
                            {region.name} ({region.code})
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </>
                )}
                {canManageFleet && (
                  <Button
                    variant="contained"
                    onClick={() => updateMutation.mutate()}
                    disabled={
                      updateMutation.isPending ||
                      !legalName.trim() ||
                      (canAssignOwner && status === 'suspended' && statusReason.trim().length < 3)
                    }
                  >
                    Save changes
                  </Button>
                )}
              </Box>
            </Paper>
          </Grid>
          )}
        </Grid>
      )}

      {tab === 'drivers' && (
        <>
          {driverRegionId && (
            <Alert
              severity="info"
              sx={{ mb: 2 }}
              onClose={isCityScoped ? undefined : () => setDriverRegionId(null)}
            >
              Showing drivers for{' '}
              {cities.find((c) => c.id === driverRegionId)?.name ?? 'selected city'}
            </Alert>
          )}
          <DataTable
            columns={driverColumns}
            rows={drivers}
            rowKey={(r) => r.userId}
            page={0}
            rowsPerPage={Math.max(drivers.length, 10)}
            total={drivers.length}
            onPageChange={() => undefined}
            onRowsPerPageChange={() => undefined}
            loading={driversLoading}
            emptyMessage="No drivers in this fleet"
          />
        </>
      )}

      {tab === 'wallet' && canViewWallet && <FleetWalletPanel fleetId={id} />}

      <ConfirmDialog
        open={Boolean(removeDriverId)}
        title="Remove driver"
        message="Remove this driver from the fleet?"
        confirmColor="error"
        loading={removeMutation.isPending}
        onCancel={() => setRemoveDriverId(null)}
        onConfirm={() => removeDriverId && removeMutation.mutate(removeDriverId)}
      />
    </>
  );
}
