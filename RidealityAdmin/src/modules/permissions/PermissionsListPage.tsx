import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  createPermission,
  deletePermission,
  getPermissionCatalog,
  listPermissions,
  updatePermission,
} from '@/api/permissions.api';
import { getApiErrorMessage } from '@/api/client';
import DataTable, { type DataTableColumn } from '@/components/DataTable';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useDebounce } from '@/hooks/useDebounce';
import { useNotify } from '@/services/notification';
import type { CreatePermissionPayload, PermissionItem, PermissionKey } from '@/api/types';
import { formatLabel } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissions';

export default function PermissionsListPage() {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PermissionItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PermissionItem | null>(null);
  const [form, setForm] = useState<CreatePermissionPayload>({ key: 'manage_users', meaning: '' });
  const notify = useNotify();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['permissions', page, rowsPerPage, debouncedSearch],
    queryFn: () =>
      listPermissions({
        page: page + 1,
        limit: rowsPerPage,
        search: debouncedSearch.trim() || undefined,
      }),
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ['permission-catalog'],
    queryFn: getPermissionCatalog,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) return updatePermission(editing.id, { meaning: form.meaning });
      return createPermission(form);
    },
    onSuccess: () => {
      notify.success(editing ? 'Permission updated' : 'Permission created');
      setDialogOpen(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['permissions'] });
      queryClient.invalidateQueries({ queryKey: ['permission-catalog'] });
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePermission(id),
    onSuccess: () => {
      notify.success('Permission deleted');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['permissions'] });
      queryClient.invalidateQueries({ queryKey: ['permission-catalog'] });
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const columns: DataTableColumn<PermissionItem>[] = [
    { id: 'permission', label: 'Key', render: (r) => formatLabel(r.permission) },
    { id: 'meaning', label: 'Meaning' },
    {
      id: 'actions',
      label: 'Actions',
      align: 'right',
      render: (r) => (
        <Box>
          <Tooltip title="Edit">
            <IconButton
              size="small"
              onClick={() => {
                setEditing(r);
                setForm({ key: r.permission, meaning: r.meaning });
                setDialogOpen(true);
              }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" color="error" onClick={() => setDeleteTarget(r)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Permissions"
        subtitle="Permission catalog and CRUD"
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setEditing(null);
              setForm({ key: 'manage_users', meaning: '' });
              setDialogOpen(true);
            }}
          >
            New permission
          </Button>
        }
      />

      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Catalog ({catalog.length} permissions)
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          {catalog.map((p) => (
            <Typography key={p.id} variant="caption" sx={{ bgcolor: 'action.hover', px: 1, py: 0.5, borderRadius: 1 }}>
              {formatLabel(p.permission)}
            </Typography>
          ))}
        </Box>
        <TextField
          size="small"
          label="Search permissions"
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
        <DialogTitle>{editing ? 'Edit permission' : 'Create permission'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {!editing && (
            <TextField
              select
              label="Key"
              value={form.key}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value as PermissionKey }))}
              fullWidth
            >
              {PERMISSIONS.map((k) => (
                <MenuItem key={k} value={k}>
                  {formatLabel(k)}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            label="Meaning"
            value={form.meaning}
            onChange={(e) => setForm((f) => ({ ...f, meaning: e.target.value }))}
            fullWidth
            multiline
            required
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={form.meaning.length < 3 || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete permission"
        message={`Delete permission "${deleteTarget?.permission}"?`}
        confirmColor="error"
        loading={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </>
  );
}
