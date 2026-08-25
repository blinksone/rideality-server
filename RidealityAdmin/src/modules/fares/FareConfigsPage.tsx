import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { createFareConfig, deleteFareConfig, listFareConfigs, listServiceProducts, updateFareConfig } from '@/api/fare.api';
import { listActiveRegions, listCities } from '@/api/regions.api';
import { getApiErrorMessage } from '@/api/client';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useAdminScope } from '@/hooks/useAdminScope';
import { useNotify } from '@/services/notification';
import { formatLabel } from '@/utils/format';
import type { FareConfig } from '@/api/types';

const emptyForm = {
  countryId: '',
  cityId: '',
  product: 'economy',
  countryDefault: false,
  baseFare: '150',
  perKm: '40',
  perMinute: '5',
  minimumFare: '200',
  bookingFee: '20',
  cancellationFee: '50',
  cargoPerKg: '8',
};

function num(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function FareConfigsPage() {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { role, countryId: scopeCountryId, cityId: scopeCityId, isSuperAdmin } = useAdminScope();
  const cityLocked = role === 'CITY_ADMIN' && Boolean(scopeCityId);
  const canCountryDefault =
    isSuperAdmin || role === 'GLOBAL_ADMIN' || role === 'CONTINENT_ADMIN' || role === 'COUNTRY_ADMIN';

  const [countryFilter, setCountryFilter] = useState(scopeCountryId ?? '');
  const [cityFilter, setCityFilter] = useState(scopeCityId ?? '');
  const [productFilter, setProductFilter] = useState<string>('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FareConfig | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<FareConfig | null>(null);

  useEffect(() => {
    if (scopeCountryId) setCountryFilter(scopeCountryId);
    if (scopeCityId) setCityFilter(scopeCityId);
  }, [scopeCountryId, scopeCityId]);

  const { data: countries = [] } = useQuery({
    queryKey: ['active-regions'],
    queryFn: listActiveRegions,
  });
  const { data: cities = [] } = useQuery({
    queryKey: ['geo-cities', countryFilter || 'all'],
    queryFn: () => listCities({ countryId: countryFilter || undefined }),
  });
  const { data: products = [] } = useQuery({
    queryKey: ['service-products'],
    queryFn: listServiceProducts,
  });
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['fare-configs', countryFilter, cityFilter, productFilter],
    queryFn: () =>
      listFareConfigs({
        countryId: countryFilter || undefined,
        cityId: cityLocked ? scopeCityId ?? undefined : cityFilter || undefined,
        serviceProductCode: productFilter || undefined,
      }),
  });

  const selectedCountry = countries.find((c) => c.id === (editing ? editing.countryId : form.countryId));

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      countryId: scopeCountryId ?? countries[0]?.id ?? '',
      cityId: scopeCityId ?? '',
      countryDefault: false,
    });
    setDialogOpen(true);
  };

  const openEdit = (row: FareConfig) => {
    setEditing(row);
    setForm({
      countryId: row.countryId,
      cityId: row.cityId ?? '',
      product: row.serviceProductCode ?? row.product,
      countryDefault: row.isCountryDefault,
      baseFare: String(row.baseFare),
      perKm: String(row.perKm),
      perMinute: String(row.perMinute),
      minimumFare: String(row.minimumFare),
      bookingFee: String(row.bookingFee),
      cancellationFee: String(row.cancellationFee),
      cargoPerKg: String(row.cargoPerKg),
    });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const rates = {
        baseFare: num(form.baseFare),
        perKm: num(form.perKm),
        perMinute: num(form.perMinute),
        minimumFare: num(form.minimumFare),
        bookingFee: num(form.bookingFee),
        cancellationFee: num(form.cancellationFee),
        cargoPerKg: form.product === 'cargo' ? num(form.cargoPerKg) : 0,
      };
      if (editing) return updateFareConfig(editing.id, rates);
      return createFareConfig({
        countryId: form.countryId,
        cityId: cityLocked ? scopeCityId ?? null : form.countryDefault ? null : form.cityId || null,
        serviceProductCode: form.product,
        ...rates,
      });
    },
    onSuccess: () => {
      notify.success(editing ? 'Fare config updated' : 'Fare config created');
      queryClient.invalidateQueries({ queryKey: ['fare-configs'] });
      setDialogOpen(false);
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFareConfig(id),
    onSuccess: () => {
      notify.success('Fare config deleted');
      queryClient.invalidateQueries({ queryKey: ['fare-configs'] });
      setDeleteTarget(null);
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const columns: DataTableColumn<FareConfig>[] = useMemo(
    () => [
      { id: 'country', label: 'Country', render: (r) => r.countryName ?? '—' },
      {
        id: 'city',
        label: 'City',
        render: (r) =>
          r.isCountryDefault ? (
            <Chip size="small" label="Country default" color="info" />
          ) : (
            r.cityName ?? '—'
          ),
      },
      { id: 'product', label: 'Product', render: (r) => r.productLabel ?? formatLabel(r.serviceProductCode ?? r.product) },
      { id: 'currency', label: 'Currency' },
      { id: 'baseFare', label: 'Base', align: 'right', render: (r) => r.baseFare.toFixed(2) },
      { id: 'perKm', label: 'Per km', align: 'right', render: (r) => r.perKm.toFixed(2) },
      { id: 'perMinute', label: 'Per min', align: 'right', render: (r) => r.perMinute.toFixed(2) },
      { id: 'minimumFare', label: 'Minimum', align: 'right', render: (r) => r.minimumFare.toFixed(2) },
      { id: 'bookingFee', label: 'Booking fee', align: 'right', render: (r) => r.bookingFee.toFixed(2) },
      {
        id: 'actions',
        label: 'Actions',
        align: 'right',
        render: (r) =>
          r.canEdit ? (
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button size="small" onClick={() => openEdit(r)}>
                Edit
              </Button>
              <Button size="small" color="error" onClick={() => setDeleteTarget(r)}>
                Delete
              </Button>
            </Box>
          ) : (
            <Typography variant="caption" color="text.secondary">
              View only
            </Typography>
          ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Fare config"
        badge="Pricing"
        subtitle="City tariffs per taxi class (Bike, Economy, AC) and cargo. Country default applies when a city has no tariff of its own."
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            Add fare
          </Button>
        }
      />
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 180 }} disabled={Boolean(scopeCountryId) && role !== 'GLOBAL_ADMIN' && role !== 'CONTINENT_ADMIN' && !isSuperAdmin}>
          <InputLabel>Country</InputLabel>
          <Select
            label="Country"
            value={countryFilter}
            onChange={(e) => {
              setCountryFilter(e.target.value);
              if (!cityLocked) setCityFilter('');
            }}
          >
            {!(scopeCountryId && role !== 'GLOBAL_ADMIN' && role !== 'CONTINENT_ADMIN' && !isSuperAdmin) && (
              <MenuItem value="">All</MenuItem>
            )}
            {countries.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name} ({c.currency})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180 }} disabled={cityLocked}>
          <InputLabel>City</InputLabel>
          <Select
            label="City"
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
          >
            {!cityLocked && <MenuItem value="">All</MenuItem>}
            {cities.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Product</InputLabel>
          <Select
            label="Product"
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            {products.map((p) => (
              <MenuItem key={p.code} value={p.code}>
                {p.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        page={0}
        rowsPerPage={Math.max(rows.length, 10)}
        total={rows.length}
        onPageChange={() => undefined}
        onRowsPerPageChange={() => undefined}
        loading={isLoading}
        emptyMessage="No fare configs yet"
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit fare config' : 'Add fare config'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <FormControl fullWidth disabled={Boolean(editing) || cityLocked || Boolean(scopeCountryId && role === 'COUNTRY_ADMIN')}>
            <InputLabel>Country</InputLabel>
            <Select
              label="Country"
              value={form.countryId}
              onChange={(e) => setForm((f) => ({ ...f, countryId: e.target.value, cityId: cityLocked ? f.cityId : '' }))}
            >
              {countries.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name} ({c.currency})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {canCountryDefault && !editing && (
            <FormControlLabel
              control={
                <Switch
                  checked={form.countryDefault}
                  onChange={(e) => setForm((f) => ({ ...f, countryDefault: e.target.checked, cityId: e.target.checked ? '' : f.cityId }))}
                />
              }
              label="Country default (used when a city has no tariff)"
            />
          )}
          <FormControl fullWidth disabled={Boolean(editing) || cityLocked || form.countryDefault}>
            <InputLabel>City</InputLabel>
            <Select
              label="City"
              value={form.cityId}
              onChange={(e) => setForm((f) => ({ ...f, cityId: e.target.value }))}
            >
              {cities.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth disabled={Boolean(editing)}>
            <InputLabel>Product</InputLabel>
            <Select
              label="Product"
              value={form.product}
              onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))}
            >
              {products.map((p) => (
                <MenuItem key={p.code} value={p.code}>
                  {p.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="caption" color="text.secondary">
            Currency: {selectedCountry?.currency ?? editing?.currency ?? '—'}
          </Typography>
          <TextField label="Base fare" type="number" value={form.baseFare} onChange={(e) => setForm((f) => ({ ...f, baseFare: e.target.value }))} />
          <TextField label="Per km" type="number" value={form.perKm} onChange={(e) => setForm((f) => ({ ...f, perKm: e.target.value }))} />
          <TextField label="Per minute" type="number" value={form.perMinute} onChange={(e) => setForm((f) => ({ ...f, perMinute: e.target.value }))} />
          <TextField label="Minimum fare" type="number" value={form.minimumFare} onChange={(e) => setForm((f) => ({ ...f, minimumFare: e.target.value }))} />
          <TextField label="Booking fee" type="number" value={form.bookingFee} onChange={(e) => setForm((f) => ({ ...f, bookingFee: e.target.value }))} />
          <TextField label="Cancellation fee" type="number" value={form.cancellationFee} onChange={(e) => setForm((f) => ({ ...f, cancellationFee: e.target.value }))} />
          {form.product === 'cargo' && (
            <TextField label="Cargo per kg" type="number" value={form.cargoPerKg} onChange={(e) => setForm((f) => ({ ...f, cargoPerKg: e.target.value }))} />
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={saveMutation.isPending || !form.countryId || (!form.countryDefault && !cityLocked && !form.cityId && !editing)}
            onClick={() => saveMutation.mutate()}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete fare config"
        message={
          deleteTarget
            ? `Delete the ${formatLabel(deleteTarget.product)} tariff for ${
                deleteTarget.isCountryDefault ? 'the country default' : deleteTarget.cityName
              }? Existing trips keep their quoted fare.`
            : ''
        }
        confirmLabel="Delete"
        confirmColor="error"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
