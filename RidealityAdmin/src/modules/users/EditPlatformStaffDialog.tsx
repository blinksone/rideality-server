import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import { getUser, updatePlatformStaff, type PlatformStaffType } from '@/api/users.api';
import { listActiveRegions, listContinents, listProvinces } from '@/api/regions.api';
import { getApiErrorMessage } from '@/api/client';
import { useNotify } from '@/services/notification';
import { useAdminScope } from '@/hooks/useAdminScope';
import { formatAdminRole } from '@/utils/format';
import CitySelectField from '@/modules/users/CitySelectField';

interface Props {
  open: boolean;
  userId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}

function localPhoneDigits(phone: string, prefix: string): string {
  const digits = phone.replace(/\D/g, '');
  const prefixDigits = prefix.replace(/\D/g, '');
  if (prefixDigits && digits.startsWith(prefixDigits)) return digits.slice(prefixDigits.length);
  return digits.replace(/^0+/, '');
}

export default function EditPlatformStaffDialog({ open, userId, onClose, onUpdated }: Props) {
  const notify = useNotify();
  const scope = useAdminScope();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [continentId, setContinentId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [regionalId, setRegionalId] = useState('');
  const [cityId, setCityId] = useState('');
  const hydratedUserId = useRef<string | null>(null);

  const { data: user, isLoading } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => getUser(userId!),
    enabled: open && Boolean(userId),
  });

  const type = (user?.adminAssignment?.role ?? user?.adminRole ?? 'SUB_ADMIN') as PlatformStaffType;
  const lockCountry = Boolean(scope.countryId) && scope.scopeType !== 'GLOBAL' && scope.scopeType !== 'CONTINENT';
  const lockProvince = Boolean(scope.regionalId);

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
    enabled: open && Boolean(regionId) && (type === 'REGIONAL_ADMIN' || type === 'CITY_ADMIN' || type === 'REGIONAL_FLEET' || type === 'FLEET_SUPPORT' || type === 'FLEET_FINANCE'),
  });

  const countries = useMemo(
    () => (continentId ? regions.filter((r) => r.continentId === continentId) : regions),
    [regions, continentId],
  );

  useEffect(() => {
    if (!open) {
      hydratedUserId.current = null;
      return;
    }
    if (!user || !regions.length) return;
    if (hydratedUserId.current === user.id) return;
    const assignment = user.adminAssignment;
    const countryId = assignment?.country?.id ?? user.region?.id ?? '';
    const selected = regions.find((r) => r.id === countryId);
    const prefix = (selected?.phonePrefix ?? '').replace(/\s/g, '');
    setFullName(user.profile?.fullName ?? '');
    setEmail(user.email ?? '');
    setContinentId(assignment?.continent?.id ?? '');
    setRegionId(countryId);
    setRegionalId(assignment?.province?.id ?? '');
    setCityId(assignment?.city?.id ?? '');
    setPhone(localPhoneDigits(user.phone, prefix));
    hydratedUserId.current = user.id;
  }, [open, user, regions]);

  const selectedRegion = countries.find((r) => r.id === regionId) ?? regions.find((r) => r.id === regionId);
  const phonePrefix = (selectedRegion?.phonePrefix ?? '').replace(/\s/g, '');
  const localDigits = phone.replace(/\D/g, '').replace(/^0+/, '');
  const submitPhone = phone.trim().startsWith('+') ? phone.trim() : `${phonePrefix}${localDigits}`;

  const mutation = useMutation({
    mutationFn: () =>
      updatePlatformStaff(userId!, {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: submitPhone,
        regionId,
        continentId: type === 'CONTINENT_ADMIN' || continentId ? continentId || undefined : undefined,
        regionalId: type === 'REGIONAL_ADMIN' || type === 'CITY_ADMIN' || type === 'REGIONAL_FLEET' || type === 'FLEET_SUPPORT' || type === 'FLEET_FINANCE' ? regionalId || undefined : undefined,
        cityId: type === 'CITY_ADMIN' || type === 'REGIONAL_FLEET' || type === 'FLEET_SUPPORT' || type === 'FLEET_FINANCE' ? cityId || undefined : undefined,
      }),
    onSuccess: () => {
      notify.success('User updated');
      onUpdated();
      onClose();
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const isFleetTeam =
    type === 'REGIONAL_FLEET' || type === 'FLEET_SUPPORT' || type === 'FLEET_FINANCE';
  const needsContinent = type === 'CONTINENT_ADMIN';
  const needsProvince = type === 'REGIONAL_ADMIN' || type === 'CITY_ADMIN' || isFleetTeam;
  const needsCity = type === 'CITY_ADMIN' || isFleetTeam;
  const canSubmit =
    Boolean(userId) &&
    fullName.trim().length >= 2 &&
    email.trim().includes('@') &&
    localDigits.length >= 7 &&
    Boolean(regionId) &&
    Boolean(phonePrefix) &&
    (!needsContinent || Boolean(continentId)) &&
    (!needsProvince || Boolean(regionalId)) &&
    (!needsCity || Boolean(cityId));

  return (
    <Dialog open={open} onClose={() => !mutation.isPending && onClose()} maxWidth="sm" fullWidth>
      <DialogTitle>Update user</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        {isLoading || !user ? (
          <Typography color="text.secondary">Loading user...</Typography>
        ) : (
          <>
            <Alert severity="info">
              Correct profile details or assigned coverage. Role stays {formatAdminRole(type)}.
            </Alert>
            <TextField label="Role" value={formatAdminRole(type)} fullWidth disabled />
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
            {needsContinent && (
              <FormControl fullWidth required>
                <InputLabel id="edit-staff-continent">Continent</InputLabel>
                <Select
                  labelId="edit-staff-continent"
                  label="Continent"
                  value={continentId}
                  disabled={Boolean(scope.continentId) && scope.scopeType !== 'GLOBAL'}
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
              <InputLabel id="edit-staff-region">Country</InputLabel>
              <Select
                labelId="edit-staff-region"
                label="Country"
                value={regionId}
                disabled={lockCountry}
                onChange={(e) => {
                  setRegionId(e.target.value);
                  setRegionalId('');
                  setCityId('');
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
            {(type === 'REGIONAL_ADMIN' || type === 'CITY_ADMIN' || type === 'REGIONAL_FLEET' || type === 'FLEET_SUPPORT' || type === 'FLEET_FINANCE') && (
              <FormControl fullWidth required>
                <InputLabel id="edit-staff-province">State / province</InputLabel>
                <Select
                  labelId="edit-staff-province"
                  label="State / province"
                  value={regionalId}
                  disabled={!regionId || lockProvince || isFleetTeam}
                  onChange={(e) => {
                    setRegionalId(e.target.value);
                    setCityId('');
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
            {(type === 'CITY_ADMIN' || type === 'REGIONAL_FLEET' || type === 'FLEET_SUPPORT' || type === 'FLEET_FINANCE') && (
              <CitySelectField
                countryId={regionId}
                provinceId={regionalId}
                value={cityId}
                onChange={setCityId}
                disabled={!regionId || isFleetTeam}
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
              slotProps={{
                input: {
                  startAdornment: phonePrefix ? (
                    <InputAdornment position="start">{phonePrefix}</InputAdornment>
                  ) : undefined,
                },
              }}
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
          disabled={!canSubmit || mutation.isPending || isLoading}
          onClick={() => mutation.mutate()}
        >
          Save changes
        </Button>
      </DialogActions>
    </Dialog>
  );
}
