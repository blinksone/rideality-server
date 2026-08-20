import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { createCity, listCities } from '@/api/regions.api';
import { getApiErrorMessage } from '@/api/client';
import { useNotify } from '@/services/notification';
import { usePermissions } from '@/hooks/usePermissions';

interface Props {
  countryId: string;
  provinceId: string;
  value: string;
  onChange: (cityId: string) => void;
  disabled?: boolean;
}

export default function CitySelectField({ countryId, provinceId, value, onChange, disabled }: Props) {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { can, isSuperAdmin } = usePermissions();
  const canCreate = isSuperAdmin || can('CITY_CREATE') || can('ADMIN_CREATE');
  const [addOpen, setAddOpen] = useState(false);
  const [cityName, setCityName] = useState('');

  const queryKey = useMemo(
    () => ['geo-cities', countryId, provinceId] as const,
    [countryId, provinceId],
  );

  const { data: cities = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => listCities({ countryId: countryId || undefined, provinceId: provinceId || undefined }),
    enabled: Boolean(countryId),
  });

  const mutation = useMutation({
    mutationFn: () => createCity({ name: cityName.trim(), provinceId }),
    onSuccess: (city) => {
      queryClient.setQueryData(queryKey, (current: typeof cities | undefined) => {
        const list = current ?? [];
        if (list.some((row) => row.id === city.id)) return list;
        return [...list, city].sort((a, b) => a.name.localeCompare(b.name));
      });
      queryClient.invalidateQueries({ queryKey: ['geo-cities'] });
      onChange(city.id);
      setAddOpen(false);
      setCityName('');
      notify.success(`${city.name} added`);
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  return (
    <>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <FormControl fullWidth required disabled={disabled || !provinceId}>
          <InputLabel id="staff-city">City</InputLabel>
          <Select
            labelId="staff-city"
            label="City"
            value={cities.some((c) => c.id === value) ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          >
            {cities.map((city) => (
              <MenuItem key={city.id} value={city.id}>
                {city.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {canCreate && (
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            sx={{ whiteSpace: 'nowrap', mt: 0.5, minWidth: 120 }}
            disabled={disabled || !provinceId}
            onClick={() => setAddOpen(true)}
          >
            Add city
          </Button>
        )}
      </Box>
      {!provinceId ? (
        <Typography variant="caption" color="text.secondary">
          Select a province first, then choose or add a city.
        </Typography>
      ) : cities.length === 0 && !isLoading ? (
        <Typography variant="caption" color="text.secondary">
          No cities in this province yet. Add Karachi, Hyderabad, or another city.
        </Typography>
      ) : null}

      <Dialog open={addOpen} onClose={() => !mutation.isPending && setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add city</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            autoFocus
            label="City name"
            value={cityName}
            onChange={(e) => setCityName(e.target.value.slice(0, 120))}
            required
            fullWidth
            placeholder="Karachi"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={cityName.trim().length < 2 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
