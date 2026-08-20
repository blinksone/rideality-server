import { useEffect, useMemo, useState } from 'react';
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
import { listActiveRegions, listContinents, listProvinces } from '@/api/regions.api';
import { getApiErrorMessage } from '@/api/client';
import { useNotify } from '@/services/notification';
import { copyToClipboard } from '@/utils/clipboard';
import { useAdminScope } from '@/hooks/useAdminScope';
import CitySelectField from '@/modules/users/CitySelectField';

const STAFF_TYPES: { value: PlatformStaffType; label: string; hint: string }[] = [
  { value: 'GLOBAL_ADMIN', label: 'Global Admin', hint: 'Worldwide operations' },
  { value: 'CONTINENT_ADMIN', label: 'Continent Admin', hint: 'One continent' },
  { value: 'COUNTRY_ADMIN', label: 'Country Admin', hint: 'One country' },
  { value: 'REGIONAL_ADMIN', label: 'Regional Admin', hint: 'One province / region' },
  { value: 'CITY_ADMIN', label: 'City Admin', hint: 'One city (fleet region)' },
  { value: 'SUB_ADMIN', label: 'Sub Admin', hint: 'Subset of super-admin permissions' },
  { value: 'FLEET_OWNER', label: 'Fleet Owner', hint: 'Creates a country-level fleet company' },
  { value: 'REGIONAL_FLEET', label: 'Regional Fleet', hint: 'City-level fleet admin for your company' },
  { value: 'FLEET_FINANCE', label: 'Fleet Finance', hint: 'Finance access for your fleet' },
  { value: 'FLEET_SUPPORT', label: 'Fleet Support', hint: 'Support staff for your fleet city' },
  { value: 'FINANCE_USER', label: 'Finance User', hint: 'Finance domain routes only' },
  { value: 'PLATFORM_SUPPORT', label: 'Platform Support', hint: 'Platform-wide support and reports' },
];

const FLEET_TEAM_TYPES: PlatformStaffType[] = ['REGIONAL_FLEET', 'FLEET_FINANCE', 'FLEET_SUPPORT'];

function isFleetTeamType(type: PlatformStaffType) {
  return FLEET_TEAM_TYPES.includes(type);
}

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
  const {
    canInvite,
    isSuperAdmin,
    continentId: scopeContinentId,
    countryId: scopeCountryId,
    regionalId: scopeRegionalId,
    cityId: scopeCityId,
  } = useAdminScope();
  const visibleTypes = useMemo(
    () => STAFF_TYPES.filter((t) => canInvite(t.value)),
    [canInvite],
  );
  const lockCountry = Boolean(scopeCountryId) && !isSuperAdmin;
  const lockProvince = Boolean(scopeRegionalId) && !isSuperAdmin;
  const lockCity = Boolean(scopeCityId) && !isSuperAdmin;
  const [step, setStep] = useState<'form' | 'credentials'>('form');
  const [type, setType] = useState<PlatformStaffType>(defaultType);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [continentId, setContinentId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [regionalId, setRegionalId] = useState('');
  const [cityId, setCityId] = useState('');
  const [legalName, setLegalName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [credentials, setCredentials] = useState<{
    userId: string;
    email: string;
    password: string;
    companyId?: string;
  } | null>(null);

  const { data: continents = [] } = useQuery({
    queryKey: ['continents'],
    queryFn: listContinents,
    enabled: open,
  });
  const { data: regions = [] } = useQuery({
    queryKey: ['active-regions'],
    queryFn: listActiveRegions,
    enabled: open,
  });
  const { data: provinces = [] } = useQuery({
    queryKey: ['provinces', regionId],
    queryFn: () => listProvinces(regionId),
    enabled:
      open &&
      Boolean(regionId) &&
      (type === 'REGIONAL_ADMIN' || type === 'CITY_ADMIN' || isFleetTeamType(type)),
  });

  const countries = useMemo(
    () =>
      continentId ? regions.filter((r) => r.continentId === continentId) : regions,
    [regions, continentId],
  );

  useEffect(() => {
    if (open) {
      const initial =
        visibleTypes.some((t) => t.value === defaultType) ? defaultType : visibleTypes[0]?.value ?? defaultType;
      setStep('form');
      setType(initial);
      setFullName('');
      setEmail('');
      setPhone('');
      setContinentId(scopeContinentId ?? '');
      setRegionId(scopeCountryId ?? '');
      setRegionalId(scopeRegionalId ?? '');
      setCityId(scopeCityId ?? '');
      setLegalName('');
      setTaxId('');
      setCredentials(null);
    }
  }, [open, defaultType, visibleTypes, scopeContinentId, scopeCountryId, scopeRegionalId, scopeCityId]);

  const selectedRegion = countries.find((r) => r.id === regionId) ?? regions.find((r) => r.id === regionId);
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
        continentId: type === 'CONTINENT_ADMIN' || continentId ? continentId || undefined : undefined,
        regionalId:
          type === 'REGIONAL_ADMIN' || type === 'CITY_ADMIN' || isFleetTeamType(type)
            ? regionalId || undefined
            : undefined,
        cityId:
          type === 'CITY_ADMIN' || isFleetTeamType(type) ? cityId || undefined : undefined,
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

  const needsContinent = type === 'CONTINENT_ADMIN';
  const needsProvince = type === 'REGIONAL_ADMIN' || type === 'CITY_ADMIN' || isFleetTeamType(type);
  const needsCity = type === 'CITY_ADMIN' || type === 'REGIONAL_FLEET' || isFleetTeamType(type);
  const canSubmit =
    fullName.trim().length >= 2 &&
    email.trim().includes('@') &&
    localDigits.length >= 7 &&
    Boolean(regionId) &&
    Boolean(phonePrefix) &&
    (!needsContinent || Boolean(continentId)) &&
    (!needsProvince || Boolean(regionalId)) &&
    (!needsCity || Boolean(cityId)) &&
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
          <DialogTitle>Create portal user</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Alert severity="info">
              These accounts cannot self-sign up. A temporary password is generated and shown once.
              {isFleetTeamType(type)
                ? ' Fleet owners invite Regional Fleet, Fleet Finance, and Fleet Support for their company.'
                : ' Scope follows Global → Continent → Country → Regional → City → Fleet Owner.'}
            </Alert>
            {visibleTypes.length === 0 ? (
              <Alert severity="warning">Your role cannot invite any portal user types.</Alert>
            ) : null}
            <FormControl fullWidth>
              <InputLabel id="staff-type">Type</InputLabel>
              <Select
                labelId="staff-type"
                label="Type"
                value={visibleTypes.some((t) => t.value === type) ? type : ''}
                onChange={(e) => {
                  setType(e.target.value as PlatformStaffType);
                  if (!lockProvince) setRegionalId(scopeRegionalId ?? '');
                  if (!lockCity) setCityId(scopeCityId ?? '');
                }}
              >
                {visibleTypes.map((t) => (
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
            {type === 'CONTINENT_ADMIN' && (
              <FormControl fullWidth required>
                <InputLabel id="staff-continent">Continent</InputLabel>
                <Select
                  labelId="staff-continent"
                  label="Continent"
                  value={continentId}
                  onChange={(e) => {
                    setContinentId(e.target.value);
                    setRegionId('');
                    setPhone('');
                  }}
                >
                  {continents.map((continent) => (
                    <MenuItem key={continent.id} value={continent.id}>
                      {continent.name} ({continent.code})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <FormControl fullWidth required>
              <InputLabel id="staff-region">Country / home region</InputLabel>
              <Select
                labelId="staff-region"
                label="Country / home region"
                value={regionId}
                disabled={lockCountry}
                onChange={(e) => {
                  setRegionId(e.target.value);
                  if (!lockProvince) setRegionalId('');
                  if (!lockCity) setCityId('');
                  setPhone('');
                }}
              >
                {countries.map((region) => (
                  <MenuItem key={region.id} value={region.id}>
                    {region.name} ({region.code})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {(type === 'REGIONAL_ADMIN' || type === 'CITY_ADMIN' || isFleetTeamType(type)) && (
              <FormControl fullWidth required>
                <InputLabel id="staff-province">Province / region</InputLabel>
                <Select
                  labelId="staff-province"
                  label="Province / region"
                  value={regionalId}
                  disabled={!regionId || lockProvince}
                  onChange={(e) => {
                    setRegionalId(e.target.value);
                    if (!lockCity) setCityId('');
                  }}
                >
                  {provinces.map((province) => (
                    <MenuItem key={province.id} value={province.id}>
                      {province.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            {(type === 'CITY_ADMIN' || isFleetTeamType(type)) && (
              <CitySelectField
                countryId={regionId}
                provinceId={regionalId}
                value={cityId}
                onChange={setCityId}
                disabled={!regionId || lockCity}
              />
            )}
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
              disabled={!canSubmit || mutation.isPending || visibleTypes.length === 0}
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
