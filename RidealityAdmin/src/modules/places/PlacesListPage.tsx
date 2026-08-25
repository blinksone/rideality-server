import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Switch,
  TextField,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { createAdminPlace, listAdminPlaces, updateAdminPlace } from '@/api/places.api';
import { getApiErrorMessage } from '@/api/client';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import PageHeader from '@/components/PageHeader';
import { useDebounce } from '@/hooks/useDebounce';
import { useNotify } from '@/services/notification';
import type { AdminPlace } from '@/api/types';

const emptyForm = {
  name: '',
  formattedAddress: '',
  latitude: '',
  longitude: '',
  city: 'Karachi',
  area: '',
  type: 'POI',
  priority: '80',
};

export default function PlacesListPage() {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const debouncedSearch = useDebounce(search);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdminPlace | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-places', page, rowsPerPage, debouncedSearch, city],
    queryFn: () =>
      listAdminPlaces({
        page: page + 1,
        limit: rowsPerPage,
        search: debouncedSearch || undefined,
        city: city || undefined,
      }),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        formattedAddress: form.formattedAddress.trim() || undefined,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        city: form.city.trim() || undefined,
        area: form.area.trim() || undefined,
        type: form.type.trim() || undefined,
        priority: Number(form.priority) || 80,
      };
      if (editing) {
        return updateAdminPlace(editing.id, payload);
      }
      return createAdminPlace(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-places'] });
      setDialogOpen(false);
      setEditing(null);
      notify.success(editing ? 'Place updated' : 'Popular place added');
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const toggleMutation = useMutation({
    mutationFn: (row: AdminPlace) => updateAdminPlace(row.id, { isActive: !row.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-places'] }),
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (row: AdminPlace) => {
    setEditing(row);
    setForm({
      name: row.name,
      formattedAddress: row.address ?? '',
      latitude: String(row.latitude),
      longitude: String(row.longitude),
      city: row.city ?? '',
      area: row.area ?? '',
      type: row.type ?? 'POI',
      priority: String(row.priority),
    });
    setDialogOpen(true);
  };

  const columns: DataTableColumn<AdminPlace>[] = useMemo(
    () => [
      { id: 'name', label: 'Name' },
      { id: 'city', label: 'City', render: (r) => r.city ?? '—' },
      { id: 'area', label: 'Area', render: (r) => r.area ?? '—' },
      { id: 'type', label: 'Type', render: (r) => r.type ?? '—' },
      { id: 'source', label: 'Source', render: (r) => <Chip size="small" label={r.source} /> },
      { id: 'priority', label: 'Priority', align: 'right' },
      { id: 'usageCount', label: 'Uses', align: 'right' },
      {
        id: 'active',
        label: 'Active',
        render: (r) => (
          <Switch
            checked={r.isActive}
            size="small"
            onChange={() => toggleMutation.mutate(r)}
            onClick={(e) => e.stopPropagation()}
          />
        ),
      },
      {
        id: 'actions',
        label: '',
        align: 'right',
        render: (r) => (
          <Button size="small" onClick={() => openEdit(r)}>
            Edit
          </Button>
        ),
      },
    ],
    [toggleMutation],
  );

  return (
    <Box>
      <PageHeader
        title="Popular places"
        subtitle="Pin landmarks that appear in the rider pickup Nearby list. Google search still fills the catalog when a rider selects a new place."
        badge="Operations"
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            Add place
          </Button>
        }
      />
      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <TextField
          size="small"
          label="Search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <TextField
          size="small"
          label="City"
          value={city}
          onChange={(e) => {
            setCity(e.target.value);
            setPage(0);
          }}
        />
      </Box>
      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(row) => row.id}
        page={page}
        rowsPerPage={rowsPerPage}
        total={data?.pagination.total ?? 0}
        onPageChange={setPage}
        onRowsPerPageChange={(n) => {
          setRowsPerPage(n);
          setPage(0);
        }}
        loading={isLoading}
        emptyMessage="No popular places yet"
        onRowClick={openEdit}
      />
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? 'Edit place' : 'Add popular place'}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: 1 }}>
          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <TextField
            label="Address"
            value={form.formattedAddress}
            onChange={(e) => setForm((f) => ({ ...f, formattedAddress: e.target.value }))}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField
              label="Latitude"
              value={form.latitude}
              onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
              required
            />
            <TextField
              label="Longitude"
              value={form.longitude}
              onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
              required
            />
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField
              label="City"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            />
            <TextField
              label="Area"
              value={form.area}
              onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
            />
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField
              label="Type"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            />
            <TextField
              label="Priority (0–100)"
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!form.name.trim() || !form.latitude || !form.longitude || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
