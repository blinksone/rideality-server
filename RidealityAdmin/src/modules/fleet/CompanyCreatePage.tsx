import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';
import { adminCreateFleet, createFleetCompany } from '@/api/fleet.api';
import { listActiveRegions } from '@/api/regions.api';
import { listUsers } from '@/api/users.api';
import { getApiErrorMessage } from '@/api/client';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useDebounce } from '@/hooks/useDebounce';
import { useNotify } from '@/services/notification';
import type { UserListItem } from '@/api/types';

const LEGAL_NAME_MAX = 120;
const TAX_ID_MAX = 50;
const LEGAL_NAME_RE = /^[\p{L}\p{N}\s.&'\-]+$/u;
const TAX_ID_RE = /^[A-Za-z0-9\-./]*$/;

function formatOwnerLabel(user: UserListItem): string {
  const name = user.fullName ?? user.email ?? user.phone;
  return user.email ? `${name} (${user.email})` : name;
}

export default function CompanyCreatePage() {
  const navigate = useNavigate();
  const notify = useNotify();
  const { user } = useAuth();
  const { can } = usePermissions();
  const canAssignOwner = can('manage_users');
  const [legalName, setLegalName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [ownerUserId, setOwnerUserId] = useState('');
  const [selectedOwner, setSelectedOwner] = useState<UserListItem | null>(null);
  const [ownerSearch, setOwnerSearch] = useState('');
  const debouncedOwnerSearch = useDebounce(ownerSearch);

  const { data: regions = [], isLoading: regionsLoading } = useQuery({
    queryKey: ['active-regions'],
    queryFn: listActiveRegions,
  });

  // RID-13 / RID-24 — only ACTIVE users as owner candidates
  const { data: ownerCandidatesData, isFetching: ownerCandidatesLoading } = useQuery({
    queryKey: ['fleet-owner-candidates', debouncedOwnerSearch],
    queryFn: () =>
      listUsers({ page: 1, limit: 20, search: debouncedOwnerSearch, status: 'ACTIVE' }),
    enabled: canAssignOwner && debouncedOwnerSearch.trim().length >= 2,
  });

  const ownerCandidates = (ownerCandidatesData?.data ?? []).filter(
    (u) => u.status === 'ACTIVE' && !['BANNED', 'SUSPENDED', 'DELETED'].includes(String(u.status)),
  );

  // Self-service: default region from current user
  useEffect(() => {
    if (canAssignOwner) return;
    if (regionId || regions.length === 0) return;
    const preferred = user?.region?.id ?? user?.regionId;
    if (preferred && regions.some((r) => r.id === preferred)) {
      setRegionId(preferred);
      return;
    }
    setRegionId(regions[0].id);
  }, [regions, regionId, user?.region?.id, user?.regionId, canAssignOwner]);

  // RID-16/23 — lock region to selected owner's region
  useEffect(() => {
    if (!canAssignOwner || !selectedOwner?.regionId) return;
    if (regions.some((r) => r.id === selectedOwner.regionId)) {
      setRegionId(selectedOwner.regionId!);
    }
  }, [canAssignOwner, selectedOwner, regions]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        legalName: legalName.trim(),
        taxId: taxId.trim() || undefined,
        regionId,
      };
      if (canAssignOwner) {
        return adminCreateFleet({ ...payload, ownerUserId });
      }
      return createFleetCompany(payload);
    },
    onSuccess: (company) => {
      notify.success('Fleet company created');
      navigate(`/fleet/${company.id}`);
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const legalNameError =
    legalName.trim().length > 0 && legalName.trim().length < 2
      ? 'At least 2 characters'
      : legalName.length > LEGAL_NAME_MAX
        ? `Max ${LEGAL_NAME_MAX} characters`
        : legalName.trim() && !LEGAL_NAME_RE.test(legalName.trim())
          ? 'Invalid characters'
          : '';

  const taxIdError =
    taxId && !TAX_ID_RE.test(taxId)
      ? 'Only letters, numbers, - . /'
      : taxId.length > TAX_ID_MAX
        ? `Max ${TAX_ID_MAX} characters`
        : '';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (legalNameError || taxIdError) {
      notify.error(legalNameError || taxIdError);
      return;
    }
    if (!regionId) {
      notify.error('Please select a country/region.');
      return;
    }
    if (canAssignOwner && !ownerUserId) {
      notify.error('Please select a fleet owner.');
      return;
    }
    mutation.mutate();
  };

  const regionLocked = canAssignOwner && Boolean(selectedOwner?.regionId);

  return (
    <>
      <PageHeader
        title="Create fleet company"
        breadcrumbs={[
          { label: 'Fleet', to: '/fleet' },
          { label: 'Create' },
        ]}
      />
      <Alert severity="info" sx={{ mb: 2 }}>
        {canAssignOwner
          ? 'Select an active fleet owner. Country/region is taken from the owner and locked. Tax ID is optional.'
          : 'Select the country where this fleet operates. You will be registered as the fleet owner. Tax ID is optional.'}
      </Alert>
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 480 }}
      >
        {canAssignOwner && (
          <Autocomplete
            options={ownerCandidates}
            getOptionLabel={(option) => formatOwnerLabel(option)}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            inputValue={ownerSearch}
            onInputChange={(_, value) => setOwnerSearch(value)}
            onChange={(_, value) => {
              setSelectedOwner(value);
              setOwnerUserId(value?.id ?? '');
              if (value) setOwnerSearch(formatOwnerLabel(value));
              if (!value) setRegionId('');
            }}
            loading={ownerCandidatesLoading}
            noOptionsText={
              ownerSearch.trim().length < 2 ? 'Type at least 2 characters' : 'No active users found'
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="Fleet owner"
                placeholder="Search active users by name, email, or phone"
                required
                helperText="Only active users can be fleet owners"
              />
            )}
          />
        )}
        <TextField
          label="Legal name"
          value={legalName}
          onChange={(e) => setLegalName(e.target.value.slice(0, LEGAL_NAME_MAX))}
          required
          fullWidth
          error={Boolean(legalNameError)}
          helperText={legalNameError || `Max ${LEGAL_NAME_MAX} characters`}
          inputProps={{ maxLength: LEGAL_NAME_MAX }}
        />
        <TextField
          label="Tax ID"
          value={taxId}
          onChange={(e) => setTaxId(e.target.value.slice(0, TAX_ID_MAX))}
          fullWidth
          error={Boolean(taxIdError)}
          helperText={taxIdError || 'Optional — letters, numbers, - . /'}
          inputProps={{ maxLength: TAX_ID_MAX }}
        />
        <FormControl fullWidth required>
          <InputLabel id="fleet-region-label">Country / region</InputLabel>
          <Select
            labelId="fleet-region-label"
            label="Country / region"
            value={regionId}
            onChange={(e) => {
              if (!regionLocked) setRegionId(e.target.value);
            }}
            disabled={regionsLoading || regions.length === 0 || regionLocked}
          >
            {regions.map((region) => (
              <MenuItem key={region.id} value={region.id}>
                {region.name} ({region.code}) — {region.currency}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {regionLocked && (
          <Alert severity="info" sx={{ py: 0.5 }}>
            Region is set from the selected fleet owner and cannot be changed.
          </Alert>
        )}
        {regions.length === 0 && !regionsLoading && (
          <Alert severity="warning">
            No active regions found. A super admin must add regions before creating fleets.
          </Alert>
        )}
        <Button
          type="submit"
          variant="contained"
          disabled={
            !legalName.trim() ||
            Boolean(legalNameError) ||
            Boolean(taxIdError) ||
            !regionId ||
            (canAssignOwner && !ownerUserId) ||
            mutation.isPending ||
            regions.length === 0
          }
        >
          Create
        </Button>
      </Box>
    </>
  );
}
