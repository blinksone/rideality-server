import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
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
import { createPlatformStaff, type PlatformStaffType } from '@/api/users.api';
import { listActiveRegions } from '@/api/regions.api';
import { getApiErrorMessage } from '@/api/client';
import { useNotify } from '@/services/notification';
import { copyToClipboard } from '@/utils/clipboard';

const STAFF_TYPES: { value: PlatformStaffType; label: string; hint: string }[] = [
  { value: 'SUB_ADMIN', label: 'Sub Admin', hint: 'Subset of super-admin permissions' },
  { value: 'FLEET_OWNER', label: 'Fleet Owner', hint: 'Creates a country-level fleet company' },
  { value: 'FINANCE_USER', label: 'Finance User', hint: 'Finance domain routes only' },
  { value: 'PLATFORM_SUPPORT', label: 'Platform Support', hint: 'Platform-wide support and reports' },
];

interface Props {
  open: boolean;
  defaultType?: PlatformStaffType;
  onClose: () => void;
  onCreated: (result: { userId: string; companyId?: string }) => void;
}

export default function CreatePlatformStaffDialog({
  open,
  defaultType = 'SUB_ADMIN',
  onClose,
  onCreated,
}: Props) {
  const notify = useNotify();
  const [step, setStep] = useState<'form' | 'credentials'>('form');
  const [type, setType] = useState<PlatformStaffType>(defaultType);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [regionId, setRegionId] = useState('');
  const [legalName, setLegalName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [credentials, setCredentials] = useState<{
    userId: string;
    email: string;
    password: string;
    companyId?: string;
  } | null>(null);

  const { data: regions = [] } = useQuery({
    queryKey: ['active-regions'],
    queryFn: listActiveRegions,
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setStep('form');
      setType(defaultType);
      setFullName('');
      setEmail('');
      setPhone('');
      setRegionId('');
      setLegalName('');
      setTaxId('');
      setCredentials(null);
    }
  }, [open, defaultType]);

  const selectedRegion = regions.find((r) => r.id === regionId);
  const phonePrefix = (selectedRegion?.phonePrefix ?? '').replace(/\s/g, '');
  const localDigits = phone.replace(/\D/g, '').replace(/^0+/, '');
  const submitPhone = phone.trim().startsWith('+')
    ? phone.trim()
    : `${phonePrefix}${localDigits}`;

  const mutation = useMutation({
    mutationFn: () =>
      createPlatformStaff({
        type,
        fullName: fullName.trim(),
        email: email.trim(),
        phone: submitPhone,
        regionId,
        legalName: type === 'FLEET_OWNER' ? legalName.trim() : undefined,
        taxId: type === 'FLEET_OWNER' ? taxId.trim() || undefined : undefined,
      }),
    onSuccess: (user) => {
      const temporaryPassword = user.temporaryPassword?.trim();
      const createdEmail = user.email?.trim();
      if (temporaryPassword && createdEmail) {
        setCredentials({
          userId: user.id,
          email: createdEmail,
          password: temporaryPassword,
          companyId: user.fleetCompany?.id,
        });
        setStep('credentials');
        return;
      }
      notify.error(
        'User was created but the temporary password was not returned. Reset their password manually.',
      );
      onCreated({ userId: user.id, companyId: user.fleetCompany?.id });
      onClose();
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const canSubmit =
    fullName.trim().length >= 2 &&
    email.trim().includes('@') &&
    localDigits.length >= 7 &&
    Boolean(regionId) &&
    Boolean(phonePrefix) &&
    (type !== 'FLEET_OWNER' || legalName.trim().length >= 2);

  const handleCopy = async (label: string, value: string) => {
    try {
      await copyToClipboard(value);
      notify.success(`${label} copied`);
    } catch {
      notify.error(`Could not copy ${label.toLowerCase()}.`);
    }
  };

  const handleDone = () => {
    if (credentials) onCreated({ userId: credentials.userId, companyId: credentials.companyId });
    onClose();
  };

  return (
    <Dialog open={open} onClose={() => !mutation.isPending && step === 'form' && onClose()} maxWidth="sm" fullWidth>
      {step === 'form' ? (
        <>
          <DialogTitle>Create platform user</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Alert severity="info">
              These accounts cannot self-sign up. A temporary password is generated and shown once.
            </Alert>
            <FormControl fullWidth>
              <InputLabel id="staff-type">Type</InputLabel>
              <Select
                labelId="staff-type"
                label="Type"
                value={type}
                onChange={(e) => setType(e.target.value as PlatformStaffType)}
              >
                {STAFF_TYPES.map((t) => (
                  <MenuItem key={t.value} value={t.value}>
                    {t.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary">
              {STAFF_TYPES.find((t) => t.value === type)?.hint}
            </Typography>
            <TextField
              label="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value.slice(0, 120))}
              required
              fullWidth
            />
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.slice(0, 254))}
              required
              fullWidth
            />
            <FormControl fullWidth required>
              <InputLabel id="staff-region">Country / region</InputLabel>
              <Select
                labelId="staff-region"
                label="Country / region"
                value={regionId}
                onChange={(e) => {
                  setRegionId(e.target.value);
                  setPhone('');
                }}
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
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, '').slice(0, 15))}
              required
              fullWidth
              disabled={!regionId}
              placeholder="3001234567"
              helperText={
                !regionId
                  ? 'Select a country first'
                  : 'Enter the mobile number only. Country code is added automatically.'
              }
              slotProps={{
                input: {
                  startAdornment: phonePrefix ? (
                    <InputAdornment position="start">{phonePrefix}</InputAdornment>
                  ) : undefined,
                },
              }}
            />
            {type === 'FLEET_OWNER' && (
              <>
                <TextField
                  label="Fleet company name"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value.slice(0, 120))}
                  required
                  fullWidth
                  helperText="Country-level fleet company created with OWNER membership"
                />
                <TextField
                  label="Tax ID"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value.slice(0, 50))}
                  fullWidth
                />
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="contained"
              disabled={!canSubmit || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              Create
            </Button>
          </DialogActions>
        </>
      ) : (
        <>
          <DialogTitle>User created</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Alert severity="success">Share these credentials now. The password is shown only once.</Alert>
            <TextField
              label="Email"
              value={credentials?.email ?? ''}
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
                          onClick={() => credentials && handleCopy('Email', credentials.email)}
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
              value={credentials?.password ?? ''}
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
                            credentials && handleCopy('Password', credentials.password)
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
              <Button
                type="button"
                variant="outlined"
                onClick={() =>
                  credentials &&
                  handleCopy(
                    'Credentials',
                    `Rideality login\nEmail: ${credentials.email}\nPassword: ${credentials.password}`,
                  )
                }
              >
                Copy email & password
              </Button>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button variant="contained" onClick={handleDone}>
              Done
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
