import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { createUser } from '@/api/users.api';
import { listActiveRegions } from '@/api/regions.api';
import { getPermissionCatalog } from '@/api/permissions.api';
import { listRoles } from '@/api/roles.api';
import { getApiErrorMessage } from '@/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { useNotify } from '@/services/notification';
import type { CreateUserPayload, PermissionItem, PlatformRole, Role } from '@/api/types';
import { formatLabel } from '@/utils/format';
import { copyToClipboard } from '@/utils/clipboard';
import { PLATFORM_ROLES } from '@/utils/permissions';

interface CreateUserDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (userId: string) => void;
}

const emptyForm: CreateUserPayload = {
  phone: '',
  email: '',
  fullName: '',
  regionId: '',
  platformRole: 'FLEET_OWNER',
};

export default function CreateUserDialog({ open, onClose, onCreated }: CreateUserDialogProps) {
  const notify = useNotify();
  const { isSuperAdmin } = usePermissions();
  const [step, setStep] = useState<'form' | 'credentials'>('form');
  const [form, setForm] = useState<CreateUserPayload>(emptyForm);
  const [selectedRoles, setSelectedRoles] = useState<Role[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<PermissionItem[]>([]);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{
    userId: string;
    email: string;
    password: string;
  } | null>(null);

  const { data: regions = [] } = useQuery({
    queryKey: ['active-regions'],
    queryFn: listActiveRegions,
    enabled: open,
  });

  const { data: rolesData } = useQuery({
    queryKey: ['roles', 'all'],
    queryFn: () => listRoles({ page: 1, limit: 100 }),
    enabled: open,
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ['permission-catalog'],
    queryFn: getPermissionCatalog,
    enabled: open,
  });

  const platformRoleOptions = PLATFORM_ROLES.filter((role) => {
    if (role === 'SUPER_ADMIN' || role === 'ADMIN') return isSuperAdmin;
    return true;
  });

  const resetDialog = () => {
    setStep('form');
    setForm(emptyForm);
    setSelectedRoles([]);
    setSelectedPermissions([]);
    setCreatedCredentials(null);
    setConfirmDiscard(false);
  };

  const isDirty =
    form.fullName.trim() !== '' ||
    form.email.trim() !== '' ||
    form.phone.trim() !== '' ||
    form.regionId !== '' ||
    form.platformRole !== emptyForm.platformRole ||
    selectedRoles.length > 0 ||
    selectedPermissions.length > 0;

  useEffect(() => {
    if (!open) resetDialog();
  }, [open]);

  const selectedRegion = regions.find((r) => r.id === form.regionId);
  const phonePrefix = (selectedRegion?.phonePrefix ?? '').replace(/\s/g, '');
  const localDigits = form.phone.replace(/\D/g, '').replace(/^0+/, '');
  const submitPhone = form.phone.trim().startsWith('+')
    ? form.phone.trim()
    : `${phonePrefix}${localDigits}`;

  const mutation = useMutation({
    mutationFn: () =>
      createUser({
        ...form,
        phone: submitPhone,
        roleIds: selectedRoles.length ? selectedRoles.map((r) => r.id) : undefined,
        permissionIds: selectedPermissions.length
          ? selectedPermissions.map((p) => p.id)
          : undefined,
      }),
    onSuccess: (user) => {
      const temporaryPassword = user.temporaryPassword?.trim();
      const email = user.email?.trim();

      if (temporaryPassword && email) {
        setCreatedCredentials({
          userId: user.id,
          email,
          password: temporaryPassword,
        });
        setStep('credentials');
        return;
      }

      notify.error(
        'User was created but the temporary password was not returned. Restart the API server and create the user again, or reset their password manually.',
      );
      onCreated(user.id);
      onClose();
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const handleClose = () => {
    if (!mutation.isPending) {
      resetDialog();
      onClose();
    }
  };

  const requestClose = () => {
    if (mutation.isPending) return;
    if (step === 'form' && isDirty) {
      setConfirmDiscard(true);
      return;
    }
    handleClose();
  };

  const handleCopy = async (label: string, value: string) => {
    try {
      await copyToClipboard(value);
      notify.success(`${label} copied`);
    } catch {
      notify.error(`Could not copy ${label.toLowerCase()}. Select the text and copy manually.`);
    }
  };

  const handleCopyAll = async () => {
    if (!createdCredentials) return;
    const text = `Rideality login\nEmail: ${createdCredentials.email}\nPassword: ${createdCredentials.password}`;
    await handleCopy('Credentials', text);
  };

  const handleDone = () => {
    if (createdCredentials) onCreated(createdCredentials.userId);
    resetDialog();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={(_, reason) => {
        if (step === 'credentials' && reason !== 'escapeKeyDown') return;
        requestClose();
      }}
      maxWidth="sm"
      fullWidth
    >
      {step === 'form' ? (
        <>
          <DialogTitle>Create user</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Alert severity="info">
              A secure random password will be generated automatically. Share it with the user
              securely — they must change it on first login.
            </Alert>
            <TextField
              label="Full name"
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value.slice(0, 120) }))}
              required
              fullWidth
              inputProps={{ maxLength: 120 }}
            />
            <TextField
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value.slice(0, 254) }))}
              required
              fullWidth
              inputProps={{ maxLength: 254 }}
              helperText="Max 254 characters"
            />
            <FormControl fullWidth required>
              <InputLabel id="create-user-region">Country / region</InputLabel>
              <Select
                labelId="create-user-region"
                label="Country / region"
                value={form.regionId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, regionId: e.target.value, phone: '' }))
                }
              >
                {regions.map((region) => (
                  <MenuItem key={region.id} value={region.id}>
                    {region.name} ({region.code})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Phone"
              value={form.phone}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  phone: e.target.value.replace(/[^\d]/g, '').slice(0, 15),
                }))
              }
              helperText={
                !form.regionId
                  ? 'Select a country first'
                  : 'Enter the mobile number only. Country code is added automatically.'
              }
              required
              fullWidth
              disabled={!form.regionId}
              placeholder="3001234567"
              slotProps={{
                input: {
                  startAdornment: phonePrefix ? (
                    <InputAdornment position="start">{phonePrefix}</InputAdornment>
                  ) : undefined,
                },
              }}
            />
            <FormControl fullWidth required>
              <InputLabel id="create-user-platform-role">Platform role</InputLabel>
              <Select
                labelId="create-user-platform-role"
                label="Platform role"
                value={form.platformRole}
                onChange={(e) =>
                  setForm((f) => ({ ...f, platformRole: e.target.value as PlatformRole }))
                }
              >
                {platformRoleOptions.map((role) => (
                  <MenuItem key={role} value={role}>
                    {formatLabel(role)}
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>
                Platform roles are fixed system roles. Custom roles you create on the Roles page are
                not listed here — assign them under Custom roles below.
              </FormHelperText>
            </FormControl>

            <Typography variant="subtitle2" sx={{ mt: 1 }}>
              Optional access (advanced)
            </Typography>
            <Autocomplete
              multiple
              options={rolesData?.data ?? []}
              value={selectedRoles}
              onChange={(_, value) => setSelectedRoles(value)}
              getOptionLabel={(option) => option.name}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Custom roles"
                  placeholder="fleet-manager, support-agent…"
                  helperText="Custom roles created on the Roles page appear here."
                />
              )}
            />
            <Autocomplete
              multiple
              options={catalog}
              value={selectedPermissions}
              onChange={(_, value) => setSelectedPermissions(value)}
              getOptionLabel={(option) => formatLabel(option.permission)}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => (
                <TextField {...params} label="Direct permissions" placeholder="manage_fleets…" />
              )}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={requestClose}>Cancel</Button>
            <Button
              variant="contained"
              disabled={
                mutation.isPending ||
                !form.fullName.trim() ||
                !form.email.trim() ||
                localDigits.length < 7 ||
                !form.regionId ||
                !phonePrefix
              }
              onClick={() => mutation.mutate()}
            >
              Create user
            </Button>
          </DialogActions>
        </>
      ) : (
        <>
          <DialogTitle>User created</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Alert severity="success">
              Share these login credentials with the user now. This password is shown only once.
            </Alert>
            <TextField
              label="Email"
              value={createdCredentials?.email ?? ''}
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
                          onClick={() =>
                            createdCredentials && handleCopy('Email', createdCredentials.email)
                          }
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
              value={createdCredentials?.password ?? ''}
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
                          onClick={() =>
                            createdCredentials && handleCopy('Password', createdCredentials.password)
                          }
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
              <Button type="button" variant="outlined" onClick={handleCopyAll}>
                Copy email & password
              </Button>
            </Box>
            <Typography variant="body2" color="text.secondary">
              The user must change this password on first login before accessing the portal.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button variant="contained" onClick={handleDone}>
              Done
            </Button>
          </DialogActions>
        </>
      )}

      <Dialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Discard unsaved changes?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            You have entered details for this user that haven&apos;t been saved. If you close now,
            the information will be discarded and no user will be created.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setConfirmDiscard(false);
              handleClose();
            }}
          >
            Discard
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
