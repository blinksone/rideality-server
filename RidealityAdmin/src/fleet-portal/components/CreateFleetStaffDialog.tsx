import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { createFleetStaffUser } from '@/api/fleet.api';
import { getApiErrorMessage } from '@/api/client';
import { copyToClipboard } from '@/utils/clipboard';
import { useNotify } from '@/services/notification';

type StaffRole = 'regional' | 'support' | 'finance';

interface Props {
  open: boolean;
  companyId: string;
  role: StaffRole;
  cities: Array<{ id: string; name: string }>;
  defaultCityId?: string;
  lockCity?: boolean;
  phonePrefix?: string;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateFleetStaffDialog({
  open,
  companyId,
  role,
  cities,
  defaultCityId,
  lockCity,
  phonePrefix,
  onClose,
  onCreated,
}: Props) {
  const notify = useNotify();
  const [step, setStep] = useState<'form' | 'credentials'>('form');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [cityId, setCityId] = useState(defaultCityId ?? '');
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    if (open) {
      setStep('form');
      setFullName('');
      setEmail('');
      setPhone('');
      setCityId(defaultCityId ?? cities[0]?.id ?? '');
      setCredentials(null);
    }
  }, [open, defaultCityId, cities]);

  const localDigits = phone.replace(/\D/g, '').replace(/^0+/, '');
  const submitPhone = phone.trim().startsWith('+')
    ? phone.trim()
    : `${(phonePrefix ?? '').replace(/\s/g, '')}${localDigits}`;

  const title =
    role === 'regional' ? 'Create Regional User' : role === 'finance' ? 'Create Fleet Finance' : 'Create Fleet Support';

  const mutation = useMutation({
    mutationFn: () =>
      createFleetStaffUser(companyId, {
        role,
        fleetRegionId: cityId || undefined,
        fullName: fullName.trim(),
        email: email.trim(),
        phone: submitPhone,
      }),
    onSuccess: (user) => {
      setCredentials({ email: user.email ?? email.trim(), password: user.temporaryPassword });
      setStep('credentials');
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const canSubmit =
    fullName.trim().length >= 2 &&
    email.trim().includes('@') &&
    localDigits.length >= 7 &&
    Boolean(cityId);

  const handleCopy = async (label: string, value: string) => {
    try {
      await copyToClipboard(value);
      notify.success(`${label} copied`);
    } catch {
      notify.error(`Could not copy ${label.toLowerCase()}.`);
    }
  };

  const handleDone = () => {
    onCreated();
    onClose();
  };

  return (
    <Dialog open={open} onClose={() => !mutation.isPending && step === 'form' && onClose()} maxWidth="sm" fullWidth>
      {step === 'form' ? (
        <>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Alert severity="info">
              {role === 'regional'
                ? 'This person manages drivers and documents for one city. Each city can have only one regional user. A temporary password is shown once.'
                : role === 'finance'
                  ? 'This person records cash and bank credits for drivers in the selected city. You approve those credits before they post to the driver wallet.'
                  : 'This person handles driver support in the selected city. They can view drivers and tickets but cannot approve documents.'}
            </Alert>
            {cities.length === 0 && (
              <Alert severity="warning">
                {role === 'regional'
                  ? 'All cities already have a regional user. Remove or reassign one before creating another.'
                  : 'Add a city to this fleet before creating this user.'}
              </Alert>
            )}
            <TextField
              label="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value.slice(0, 120))}
              required
              fullWidth
              margin="dense"
            />
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.slice(0, 254))}
              required
              fullWidth
            />
            <TextField
              label="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, '').slice(0, 15))}
              required
              fullWidth
              placeholder="3001234567"
              helperText="Enter the mobile number only. Country code is added automatically."
              slotProps={{
                input: {
                  startAdornment: phonePrefix ? (
                    <InputAdornment position="start">{phonePrefix}</InputAdornment>
                  ) : undefined,
                },
              }}
            />
            {(role === 'regional' || role === 'support' || role === 'finance') && (
            <TextField
              select
              fullWidth
              label="City"
              value={cityId}
              onChange={(e) => setCityId(e.target.value)}
              disabled={lockCity || cities.length === 0}
            >
              {cities.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="contained"
              disabled={!canSubmit || mutation.isPending || cities.length === 0}
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
                          onClick={() => credentials && handleCopy('Password', credentials.password)}
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
            <Typography variant="body2" color="text.secondary">
              They must change this password on first login.
            </Typography>
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
