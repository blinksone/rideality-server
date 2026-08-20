import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, CircularProgress, TextField, Typography } from '@mui/material';
import { changePassword, fetchMe } from '@/api/auth.api';
import { getApiErrorMessage } from '@/api/client';
import AuthLayout from '@/layouts/AuthLayout';
import { useAppDispatch } from '@/store/hooks';
import { setUser } from '@/store/authSlice';

export default function ResetPasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => changePassword({ currentPassword, newPassword }),
    onSuccess: async () => {
      const me = await fetchMe();
      dispatch(setUser(me));
      queryClient.setQueryData(['me'], me);
      navigate('/', { replace: true });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) return;
    mutation.mutate();
  };

  const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  return (
    <AuthLayout title="Set your new password" subtitle="">
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        For security, you must change your temporary password before using the portal.
      </Typography>
      <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {mutation.isError && (
          <Alert severity="error">{getApiErrorMessage(mutation.error, 'Password update failed')}</Alert>
        )}
        <TextField
          label="Current password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          helperText="Use the temporary password provided by your administrator"
          required
          fullWidth
        />
        <TextField
          label="New password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          helperText="Minimum 8 characters"
          required
          fullWidth
        />
        <TextField
          label="Confirm new password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={passwordsMismatch}
          helperText={passwordsMismatch ? 'Passwords do not match' : ' '}
          required
          fullWidth
        />
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={
            mutation.isPending ||
            !currentPassword ||
            newPassword.length < 8 ||
            newPassword !== confirmPassword
          }
          startIcon={mutation.isPending ? <CircularProgress size={18} color="inherit" /> : undefined}
        >
          Update password & continue
        </Button>
      </Box>
    </AuthLayout>
  );
}
