import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
} from '@mui/material';
import { createFinanceAdjustment } from '@/api/finance.api';
import { getApiErrorMessage } from '@/api/client';
import { useNotify } from '@/services/notification';

interface BulkAdjustmentDialogProps {
  open: boolean;
  walletIds: string[];
  currency?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BulkAdjustmentDialog({
  open,
  walletIds,
  currency,
  onClose,
  onSuccess,
}: BulkAdjustmentDialogProps) {
  const [direction, setDirection] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const notify = useNotify();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      for (const walletId of walletIds) {
        await createFinanceAdjustment({
          walletId,
          direction,
          amount: value,
          reason,
          topupMethod: 'admin_manual',
        });
      }
    },
    onSuccess: () => {
      notify.success(`Requested ${walletIds.length} adjustment(s)`);
      queryClient.invalidateQueries({ queryKey: ['finance-adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['finance-wallets'] });
      setAmount('');
      setReason('');
      onSuccess();
      onClose();
    },
    onError: (err) => notify.error(getApiErrorMessage(err)),
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Bulk manual adjustment</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <FormControl fullWidth size="small">
            <InputLabel id="bulk-adj-direction">Direction</InputLabel>
            <Select
              labelId="bulk-adj-direction"
              label="Direction"
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'credit' | 'debit')}
            >
              <MenuItem value="credit">Credit</MenuItem>
              <MenuItem value="debit">Debit</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            label={currency ? `Amount (${currency})` : 'Amount'}
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            helperText="Max 9,999,999,999.99"
            inputProps={{ min: 0.01, max: 9999999999.99, step: '0.01' }}
          />
          <TextField
            size="small"
            label="Reason"
            multiline
            minRows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            helperText={`${reason.length}/500`}
            inputProps={{ maxLength: 500 }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !amount || reason.length < 3}
        >
          Request {walletIds.length} adjustment(s)
        </Button>
      </DialogActions>
    </Dialog>
  );
}
