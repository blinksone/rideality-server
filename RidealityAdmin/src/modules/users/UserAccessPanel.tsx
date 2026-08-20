import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { getPermissionCatalog } from '@/api/permissions.api';
import { listRoles } from '@/api/roles.api';
import {
  assignPlatformRole,
  assignUserRole,
  getUserAccess,
  removeUserRole,
  revokePlatformRole,
  setUserPermissions,
} from '@/api/users.api';
import { getApiErrorMessage } from '@/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { useNotify } from '@/services/notification';
import type { PermissionItem, PlatformRole } from '@/api/types';
import { formatLabel } from '@/utils/format';
import { PLATFORM_ROLES } from '@/utils/permissions';

interface UserAccessPanelProps {
  userId: string;
}

export default function UserAccessPanel({ userId }: UserAccessPanelProps) {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { isSuperAdmin } = usePermissions();
  const [newPlatformRole, setNewPlatformRole] = useState<PlatformRole | ''>('');
  const [newRoleId, setNewRoleId] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<PermissionItem[]>([]);

  const { data: access, isLoading } = useQuery({
    queryKey: ['user-access', userId],
    queryFn: () => getUserAccess(userId),
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ['permission-catalog'],
    queryFn: getPermissionCatalog,
  });

  const { data: rolesData } = useQuery({
    queryKey: ['roles', 'all'],
    queryFn: () => listRoles({ page: 1, limit: 100 }),
  });

  const availableRoles = rolesData?.data ?? [];

  const platformRoleOptions = useMemo(() => {
    return PLATFORM_ROLES.filter((role) => {
      if (role === 'SUPER_ADMIN' || role === 'ADMIN') return isSuperAdmin;
      return true;
    }).filter((role) => !access?.platformRoles.includes(role));
  }, [access?.platformRoles, isSuperAdmin]);

  const assignableCustomRoles = availableRoles.filter(
    (role) => !access?.roles.some((r) => r.id === role.id),
  );

  useEffect(() => {
    if (!access) return;
    const direct = access.directPermissions.map((p) => ({
      id: p.id,
      permission: p.permission,
      meaning: p.meaning,
    }));
    setSelectedPermissions(direct);
  }, [access]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['user-access', userId] });
    queryClient.invalidateQueries({ queryKey: ['user', userId] });
  };

  const platformMutation = useMutation({
    mutationFn: (role: PlatformRole) => assignPlatformRole(userId, role),
    onSuccess: () => {
      notify.success('Platform role assigned');
      setNewPlatformRole('');
      invalidate();
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const revokePlatformMutation = useMutation({
    mutationFn: (role: PlatformRole) => revokePlatformRole(userId, role),
    onSuccess: () => {
      notify.success('Platform role removed');
      invalidate();
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const assignRoleMutation = useMutation({
    mutationFn: (roleId: string) => assignUserRole(userId, roleId),
    onSuccess: () => {
      notify.success('Role assigned');
      setNewRoleId('');
      invalidate();
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const removeRoleMutation = useMutation({
    mutationFn: (roleId: string) => removeUserRole(userId, roleId),
    onSuccess: () => {
      notify.success('Role removed');
      invalidate();
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const permissionsMutation = useMutation({
    mutationFn: () => setUserPermissions(userId, selectedPermissions.map((p) => p.id)),
    onSuccess: () => {
      notify.success('Direct permissions updated');
      invalidate();
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  if (isLoading || !access) {
    return <Typography>Loading access...</Typography>;
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        Platform roles
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Primary account type (fleet owner, admin, support, etc.)
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        {access.platformRoles.map((role) => (
          <Chip
            key={role}
            label={formatLabel(role)}
            size="small"
            onDelete={
              access.platformRoles.length > 1 ||
              (role !== 'SUPER_ADMIN' && role !== 'ADMIN')
                ? () => revokePlatformMutation.mutate(role)
                : undefined
            }
            deleteIcon={<CloseIcon />}
          />
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="add-platform-role">Add platform role</InputLabel>
          <Select
            labelId="add-platform-role"
            label="Add platform role"
            value={newPlatformRole}
            onChange={(e) => setNewPlatformRole(e.target.value as PlatformRole)}
          >
            {platformRoleOptions.map((role) => (
              <MenuItem key={role} value={role}>
                {formatLabel(role)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          variant="outlined"
          disabled={!newPlatformRole || platformMutation.isPending}
          onClick={() => newPlatformRole && platformMutation.mutate(newPlatformRole)}
        >
          Assign
        </Button>
      </Box>

      <Typography variant="subtitle2" gutterBottom>
        Custom roles
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Permission bundles such as fleet-manager or support-agent
      </Typography>
      {access.roles.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          No custom roles assigned
        </Typography>
      ) : (
        access.roles.map((role) => (
          <Box
            key={role.id}
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 1,
              mb: 1,
              p: 1,
              borderRadius: 1,
              bgcolor: 'action.hover',
            }}
          >
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {role.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {role.permissions.map((p) => formatLabel(p.permission)).join(', ') || 'No permissions'}
              </Typography>
            </Box>
            <IconButton
              size="small"
              onClick={() => removeRoleMutation.mutate(role.id)}
              disabled={removeRoleMutation.isPending}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        ))
      )}
      <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="add-custom-role">Add custom role</InputLabel>
          <Select
            labelId="add-custom-role"
            label="Add custom role"
            value={newRoleId}
            onChange={(e) => setNewRoleId(e.target.value)}
          >
            {assignableCustomRoles.map((role) => (
              <MenuItem key={role.id} value={role.id}>
                {role.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          variant="outlined"
          disabled={!newRoleId || assignRoleMutation.isPending}
          onClick={() => assignRoleMutation.mutate(newRoleId)}
        >
          Assign
        </Button>
      </Box>

      <Typography variant="subtitle2" gutterBottom>
        Direct permissions
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Extra permissions on top of platform role and custom roles
      </Typography>
      <Autocomplete
        multiple
        options={catalog}
        value={selectedPermissions}
        onChange={(_, value) => setSelectedPermissions(value)}
        getOptionLabel={(option) => formatLabel(option.permission)}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        renderInput={(params) => (
          <TextField {...params} label="Direct permissions" placeholder="Select permissions" />
        )}
        sx={{ mb: 2 }}
      />
      <Button
        variant="contained"
        onClick={() => permissionsMutation.mutate()}
        disabled={permissionsMutation.isPending}
      >
        Save direct permissions
      </Button>

      <Typography variant="subtitle2" sx={{ mt: 3 }} gutterBottom>
        Effective permissions
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {access.effectivePermissions.map((p) => (
          <Chip key={p} label={formatLabel(p)} size="small" variant="outlined" color="primary" />
        ))}
      </Box>
    </Paper>
  );
}
