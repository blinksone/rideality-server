import { useState } from 'react';
import {
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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { requestFleetDriverCredit } from '@/api/fleet.api';
import { getApiErrorMessage } from '@/api/client';
import { useNotify } from '@/services/notification';
import type { FleetDriver } from '@/api/types';

const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'gateway', label: 'Mobile wallet / gateway' },
  { value: 'admin_manual', label: 'Other' },
] as const;

type Props = {
  companyId: string;
  driver: FleetDriver | null;
  onClose: () => void;
};

export default function CreditDriverDialog({ companyId, driver, onClose }: Props) {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [topupMethod, setTopupMethod] = useState<(typeof METHODS)[number]['value']>('cash');
  const [reason, setReason] = useState('');
  const [externalRef, setExternalRef] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      requestFleetDriverCredit(companyId, {
        driverUserId: driver!.userId,
        amount: Number(amount),
        reason: reason.trim(),
        topupMethod,
        externalRef: externalRef.trim() || undefined,
      }),
    onSuccess: () => {
      notify.success('Credit sent to the fleet owner for approval');
      queryClient.invalidateQueries({ queryKey: ['fleet-driver-credits', companyId] });
      onClose();
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const valid = Number(amount) > 0 && reason.trim().length >= 3;

  return (
    <Dialog
      open={Boolean(driver)}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      onTransitionExited={() => {
        setAmount('');
        setReason('');
        setExternalRef('');
        setTopupMethod('cash');
      }}
    >
      <DialogTitle>Credit {driver?.fullName ?? driver?.phone ?? 'driver'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <TextField
          label="Amount"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputProps={{ min: 0.01, step: 0.01 }}
          required
          fullWidth
        />
        <FormControl fullWidth>
          <InputLabel id="paid-via">Where paid</InputLabel>
          <Select
            labelId="paid-via"
            label="Where paid"
            value={topupMethod}
            onChange={(e) => setTopupMethod(e.target.value as typeof topupMethod)}
          >
            {METHODS.map((m) => (
              <MenuItem key={m.value} value={m.value}>
                {m.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 500))}
          helperText="Why this credit is due — office cash, bank slip, bonus, etc."
          required
          fullWidth
          multiline
          minRows={2}
        />
        <TextField
          label="Receipt / reference (optional)"
          value={externalRef}
          onChange={(e) => setExternalRef(e.target.value.slice(0, 120))}
          fullWidth
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!valid || mutation.isPending || !driver}
          onClick={() => mutation.mutate()}
        >
          Submit for owner approval
        </Button>
      </DialogActions>
    </Dialog>
  );
}
