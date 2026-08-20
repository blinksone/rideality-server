import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  IconButton,
  TextField,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { createRole, deleteRole, listRoles, updateRole } from '@/api/roles.api';
import { getPermissionCatalog } from '@/api/permissions.api';
import { getApiErrorMessage } from '@/api/client';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useDebounce } from '@/hooks/useDebounce';
import { useNotify } from '@/services/notification';
import type { CreateRolePayload, Role, UpdateRolePayload } from '@/api/types';
import { formatLabel } from '@/utils/format';

export default function RolesListPage() {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [form, setForm] = useState<CreateRolePayload>({
    name: '',
    description: '',
    permissionIds: [],
  });
  const notify = useNotify();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['roles', page, rowsPerPage, debouncedSearch],
    queryFn: () => listRoles({ page: page + 1, limit: rowsPerPage, search: debouncedSearch || undefined }),
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ['permission-catalog'],
    queryFn: getPermissionCatalog,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        const payload: UpdateRolePayload = {
          name: form.name,
          description: form.description,
          permissionIds: form.permissionIds,
        };
        return updateRole(editing.id, payload);
      }
      return createRole(form);
    },
    onSuccess: () => {
      notify.success(editing ? 'Role updated' : 'Role created');
      setDialogOpen(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRole(id),
    onSuccess: () => {
      notify.success('Role deleted');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', description: '', permissionIds: [] });
    setDialogOpen(true);
  };

  const openEdit = (role: Role) => {
    setEditing(role);
    setForm({
      name: role.name,
      description: role.description ?? '',
      permissionIds: role.permissions.map((p) => p.id),
    });
    setDialogOpen(true);
  };

  const togglePermission = (id: string) => {
    setForm((prev) => ({
      ...prev,
      permissionIds: prev.permissionIds.includes(id)
        ? prev.permissionIds.filter((x) => x !== id)
        : [...prev.permissionIds, id],
    }));
  };

  const columns: DataTableColumn<Role>[] = [
    { id: 'name', label: 'Name' },
    { id: 'slug', label: 'Slug' },
    {
      id: 'permissions',
      label: 'Permissions',
      render: (r) => r.permissions.map((p) => formatLabel(p.permission)).join(', '),
    },
    { id: 'userCount', label: 'Users' },
    {
      id: 'isSystem',
      label: 'System',
      render: (r) => (r.isSystem ? <Chip size="small" label="System" /> : '—'),
    },
    {
      id: 'actions',
      label: 'Actions',
      align: 'right',
      render: (r) => (
        <Box>
          <Tooltip title="Edit">
            <IconButton size="small" onClick={() => openEdit(r)}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {!r.isSystem && (
            <Tooltip title="Delete">
              <IconButton size="small" color="error" onClick={() => setDeleteTarget(r)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Roles"
        subtitle="Manage roles and permission assignments"
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            New role
          </Button>
        }
      />
      <Box sx={{ mb: 2 }}>
        <TextField
          size="small"
          label="Search roles"
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
        <DialogTitle>{editing ? 'Edit role' : 'Create role'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            fullWidth
          />
          <TextField
            label="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            fullWidth
            multiline
          />
          <FormGroup>
            {catalog.map((p) => (
              <FormControlLabel
                key={p.id}
                control={
                  <Checkbox
                    checked={form.permissionIds.includes(p.id)}
                    onChange={() => togglePermission(p.id)}
                  />
                }
                label={`${formatLabel(p.permission)} — ${p.meaning}`}
              />
            ))}
          </FormGroup>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!form.name || form.permissionIds.length === 0 || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete role"
        message={`Delete role "${deleteTarget?.name}"? This cannot be undone.`}
        confirmColor="error"
        loading={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </>
  );
}
