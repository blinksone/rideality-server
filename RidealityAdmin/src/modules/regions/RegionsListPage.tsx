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
  FormControlLabel,
  IconButton,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import { createRegion, listRegions, updateRegion } from '@/api/regions.api';
import { getApiErrorMessage } from '@/api/client';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import PageHeader from '@/components/PageHeader';
import { COUNTRY_OPTIONS, type CountryOption } from '@/constants/countries';
import { useDebounce } from '@/hooks/useDebounce';
import { useNotify } from '@/services/notification';
import type { CreateRegionPayload, Region, UpdateRegionPayload } from '@/api/types';

const emptyForm: CreateRegionPayload = {
  code: '',
  name: '',
  currency: '',
  phonePrefix: '',
  platformCommissionPercent: 0,
};

const commissionHelper =
  'On completed rides the platform keeps the booking fee plus this % of (fare − booking fee). Example: fare 1,000, booking fee 50, 20% → platform 240, fleet/driver 760.';

export default function RegionsListPage() {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Region | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<CountryOption | null>(null);
  const [form, setForm] = useState<CreateRegionPayload>(emptyForm);
  const [editForm, setEditForm] = useState<UpdateRegionPayload>({});
  const notify = useNotify();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['regions', page, rowsPerPage, debouncedSearch],
    queryFn: () =>
      listRegions({ page: page + 1, limit: rowsPerPage, search: debouncedSearch || undefined }),
  });

  const { data: allRegionsData } = useQuery({
    queryKey: ['regions-all-codes'],
    queryFn: () => listRegions({ page: 1, limit: 500 }),
    enabled: dialogOpen && !editing,
  });

  const existingRegionCodes = useMemo(
    () => new Set((allRegionsData?.data ?? []).map((region) => region.code.toUpperCase())),
    [allRegionsData?.data],
  );

  const availableCountries = useMemo(
    () => COUNTRY_OPTIONS.filter((country) => !existingRegionCodes.has(country.code)),
    [existingRegionCodes],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        return updateRegion(editing.id, editForm);
      }
      return createRegion({
        ...form,
        code: form.code.toUpperCase(),
        currency: form.currency.toUpperCase(),
      });
    },
    onSuccess: () => {
      notify.success(editing ? 'Region updated' : 'Region created');
      setDialogOpen(false);
      setEditing(null);
      setSelectedCountry(null);
      setForm(emptyForm);
      setEditForm({});
      queryClient.invalidateQueries({ queryKey: ['regions'] });
      queryClient.invalidateQueries({ queryKey: ['active-regions'] });
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateRegion(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regions'] });
      queryClient.invalidateQueries({ queryKey: ['active-regions'] });
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const openCreate = () => {
    setEditing(null);
    setSelectedCountry(null);
    setForm(emptyForm);
    setEditForm({});
    setDialogOpen(true);
  };

  const openEdit = (region: Region) => {
    setEditing(region);
    setSelectedCountry(null);
    setEditForm({
      name: region.name,
      currency: region.currency,
      phonePrefix: region.phonePrefix,
      platformCommissionPercent: Number(region.platformCommissionPercent ?? 0),
    });
    setDialogOpen(true);
  };

  const handleCountrySelect = (country: CountryOption | null) => {
    setSelectedCountry(country);
    if (!country) {
      setForm(emptyForm);
      return;
    }
    setForm({
      code: country.code,
      name: country.name,
      currency: country.currency,
      phonePrefix: country.phonePrefix,
      platformCommissionPercent: form.platformCommissionPercent ?? 0,
    });
  };

  const canCreate = Boolean(form.code && form.name && form.currency && form.phonePrefix);

  const columns: DataTableColumn<Region>[] = [
    { id: 'name', label: 'Country', render: (r) => r.name },
    { id: 'code', label: 'Code', render: (r) => r.code },
    { id: 'currency', label: 'Currency', render: (r) => r.currency },
    { id: 'phonePrefix', label: 'Phone prefix', render: (r) => r.phonePrefix },
    {
      id: 'platformCommissionPercent',
      label: 'Platform commission',
      render: (r) => `${Number(r.platformCommissionPercent ?? 0)}%`,
    },
    {
      id: 'status',
      label: 'Status',
      render: (r) => (
        <Chip
          size="small"
          label={r.isActive ? 'Active' : 'Inactive'}
          color={r.isActive ? 'success' : 'default'}
        />
      ),
    },
    {
      id: 'actions',
      label: 'Actions',
      align: 'right',
      render: (r) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
          <Tooltip title="Edit region">
            <IconButton size="small" onClick={() => openEdit(r)}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={r.isActive ?? true}
                disabled={toggleActiveMutation.isPending}
                onChange={(_, checked) =>
                  toggleActiveMutation.mutate({ id: r.id, isActive: checked })
                }
              />
            }
            label=""
          />
        </Box>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Regions"
        subtitle="Manage countries, markets, and platform commission for completed rides."
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            Add region
          </Button>
        }
      />

      <Box sx={{ mb: 2 }}>
        <TextField
          size="small"
          label="Search regions"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
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
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit region' : 'Add region'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {editing ? (
            <>
              <TextField label="Country code" value={editing.code} disabled fullWidth />
              <TextField
                label="Country name"
                value={editForm.name ?? ''}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                required
                fullWidth
              />
              <TextField
                label="Currency (ISO)"
                value={editForm.currency ?? ''}
                onChange={(e) => setEditForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                required
                fullWidth
              />
              <TextField
                label="Phone prefix"
                value={editForm.phonePrefix ?? ''}
                onChange={(e) => setEditForm((f) => ({ ...f, phonePrefix: e.target.value }))}
                helperText="e.g. +1, +92"
                required
                fullWidth
              />
              <TextField
                label="Platform commission %"
                type="number"
                value={editForm.platformCommissionPercent ?? 0}
                onChange={(e) =>
                  setEditForm((f) => ({
                    ...f,
                    platformCommissionPercent: Number(e.target.value),
                  }))
                }
                inputProps={{ min: 0, max: 100, step: 0.01 }}
                helperText={commissionHelper}
                required
                fullWidth
              />
            </>
          ) : (
            <>
              <Autocomplete
                options={availableCountries}
                value={selectedCountry}
                onChange={(_, value) => handleCountrySelect(value)}
                getOptionLabel={(option) => `${option.flag} ${option.name}`}
                isOptionEqualToValue={(option, value) => option.code === value.code}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Country"
                    required
                    placeholder="Search country…"
                    helperText={
                      availableCountries.length === 0
                        ? 'All supported countries are already added.'
                        : 'Select a country to auto-fill region details.'
                    }
                  />
                )}
                renderOption={(props, option) => {
                  const { key, ...optionProps } = props;
                  return (
                    <Box component="li" key={key} {...optionProps}>
                      <Typography component="span" sx={{ mr: 1 }}>
                        {option.flag}
                      </Typography>
                      {option.name}
                      <Typography component="span" color="text.secondary" sx={{ ml: 1 }}>
                        ({option.code})
                      </Typography>
                    </Box>
                  );
                }}
                fullWidth
                disableClearable={false}
              />

              {selectedCountry && (
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 2,
                    p: 2,
                    borderRadius: 1,
                    bgcolor: 'action.hover',
                  }}
                >
                  <TextField label="Country code" value={form.code} disabled fullWidth size="small" />
                  <TextField
                    label="Currency (ISO)"
                    value={form.currency}
                    disabled
                    fullWidth
                    size="small"
                  />
                  <TextField
                    label="Phone prefix"
                    value={form.phonePrefix}
                    disabled
                    fullWidth
                    size="small"
                  />
                </Box>
              )}

              <TextField
                label="Platform commission %"
                type="number"
                value={form.platformCommissionPercent ?? 0}
                onChange={(e) =>
                  setForm((f) => ({ ...f, platformCommissionPercent: Number(e.target.value) }))
                }
                inputProps={{ min: 0, max: 100, step: 0.01 }}
                helperText={commissionHelper}
                fullWidth
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || (!editing && !canCreate)}
          >
            {editing ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
