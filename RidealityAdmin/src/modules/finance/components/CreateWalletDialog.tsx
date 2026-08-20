import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Autocomplete,
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
} from '@mui/material';
import { createFinanceWallet } from '@/api/finance.api';
import { listUsers } from '@/api/users.api';
import { listAdminFleets } from '@/api/fleet.api';
import { getApiErrorMessage } from '@/api/client';
import { useDebounce } from '@/hooks/useDebounce';
import { useNotify } from '@/services/notification';

interface CreateWalletDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function CreateWalletDialog({ open, onClose }: CreateWalletDialogProps) {
  const [ownerType, setOwnerType] = useState<'user' | 'fleet'>('user');
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedFleetId, setSelectedFleetId] = useState('');
  const [currency, setCurrency] = useState('PKR');
  const debouncedSearch = useDebounce(search);
  const notify = useNotify();
  const queryClient = useQueryClient();

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['create-wallet-users', debouncedSearch],
    queryFn: () => listUsers({ page: 1, limit: 20, search: debouncedSearch || undefined }),
    enabled: open && ownerType === 'user' && debouncedSearch.length >= 2,
  });

  const { data: fleetsData, isLoading: fleetsLoading } = useQuery({
    queryKey: ['create-wallet-fleets', debouncedSearch],
    queryFn: () => listAdminFleets({ page: 1, limit: 20, search: debouncedSearch || undefined }),
    enabled: open && ownerType === 'fleet' && debouncedSearch.length >= 2,
  });

  const mutation = useMutation({
    mutationFn: () =>
      createFinanceWallet({
        ownerType,
        userId: ownerType === 'user' ? selectedUserId : undefined,
        fleetCompanyId: ownerType === 'fleet' ? selectedFleetId : undefined,
        currency: currency || undefined,
      }),
    onSuccess: () => {
      notify.success('Wallet created');
      queryClient.invalidateQueries({ queryKey: ['finance-wallets'] });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
      handleClose();
    },
    onError: (err) => notify.error(getApiErrorMessage(err)),
  });

  const userOptions =
    usersData?.data.map((u) => ({
      id: u.id,
      label: u.fullName ? `${u.fullName} (${u.email ?? u.phone})` : (u.email ?? u.phone),
    })) ?? [];

  const fleetOptions =
    fleetsData?.data.map((f) => ({
      id: f.id,
      label: f.legalName,
    })) ?? [];

  const handleClose = () => {
    setOwnerType('user');
    setSearch('');
    setSelectedUserId('');
    setSelectedFleetId('');
    setCurrency('PKR');
    onClose();
  };

  const canSubmit =
    ownerType === 'user' ? Boolean(selectedUserId) : Boolean(selectedFleetId);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create wallet</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <FormControl fullWidth size="small">
            <InputLabel id="create-wallet-type">Owner type</InputLabel>
            <Select
              labelId="create-wallet-type"
              label="Owner type"
              value={ownerType}
              onChange={(e) => {
                setOwnerType(e.target.value as 'user' | 'fleet');
                setSelectedUserId('');
                setSelectedFleetId('');
                setSearch('');
              }}
            >
              <MenuItem value="user">User</MenuItem>
              <MenuItem value="fleet">Fleet</MenuItem>
            </Select>
          </FormControl>

          {ownerType === 'user' ? (
            <Autocomplete
              options={userOptions}
              loading={usersLoading}
              getOptionLabel={(o) => o.label}
              onInputChange={(_, value) => setSearch(value)}
              onChange={(_, value) => setSelectedUserId(value?.id ?? '')}
              renderInput={(params) => (
                <TextField {...params} size="small" label="Search user" placeholder="Name, email, or phone" />
              )}
              noOptionsText={search.length < 2 ? 'Type at least 2 characters' : 'No users found'}
            />
          ) : (
            <Autocomplete
              options={fleetOptions}
              loading={fleetsLoading}
              getOptionLabel={(o) => o.label}
              onInputChange={(_, value) => setSearch(value)}
              onChange={(_, value) => setSelectedFleetId(value?.id ?? '')}
              renderInput={(params) => (
                <TextField {...params} size="small" label="Search fleet" placeholder="Legal name" />
              )}
              noOptionsText={search.length < 2 ? 'Type at least 2 characters' : 'No fleets found'}
            />
          )}

          <TextField
            size="small"
            label="Currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            slotProps={{ htmlInput: { maxLength: 3 } }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button variant="contained" onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}>
          Create wallet
        </Button>
      </DialogActions>
    </Dialog>
  );
}
