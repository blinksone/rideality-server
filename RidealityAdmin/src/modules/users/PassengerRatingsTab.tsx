import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  Chip,
  Grid,
  Paper,
  Rating,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { getPassengerRatings, moderateRating, type RideRating } from '@/api/passengers.api';
import { getApiErrorMessage } from '@/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { useNotify } from '@/services/notification';
import { formatDate, formatLabel } from '@/utils/format';

export default function PassengerRatingsTab({ userId }: { userId: string }) {
  const [direction, setDirection] = useState<'received' | 'given'>('received');
  const notify = useNotify();
  const { can } = usePermissions();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['passenger-ratings', userId, direction],
    queryFn: () => getPassengerRatings(userId, { page: 1, limit: 50, direction }),
    enabled: Boolean(userId),
  });

  const moderateMutation = useMutation({
    mutationFn: ({ ratingId, status }: { ratingId: string; status: 'visible' | 'hidden' }) =>
      moderateRating(ratingId, status),
    onSuccess: () => {
      notify.success('Rating updated');
      queryClient.invalidateQueries({ queryKey: ['passenger-ratings', userId] });
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const canModerate = can('manage_users');

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Typography variant="caption" color="text.secondary">
              Average rating received
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.5, alignItems: 'center' }}>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {data?.summary.averageReceived?.toFixed(2) ?? '0.00'}
              </Typography>
              <Rating size="small" value={data?.summary.averageReceived ?? 0} precision={0.1} readOnly />
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {data?.summary.countReceived ?? 0} ratings
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      <ToggleButtonGroup
        size="small"
        exclusive
        value={direction}
        onChange={(_, v) => v && setDirection(v)}
        sx={{ mb: 2 }}
      >
        <ToggleButton value="received">Received</ToggleButton>
        <ToggleButton value="given">Given</ToggleButton>
      </ToggleButtonGroup>

      {isLoading ? (
        <Typography color="text.secondary">Loading ratings…</Typography>
      ) : (data?.ratings ?? []).length === 0 ? (
        <Typography color="text.secondary">No ratings {direction}.</Typography>
      ) : (
        <Stack spacing={1.5}>
          {data!.ratings.map((r: RideRating) => (
            <Paper key={r.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box sx={{ flex: 1 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Rating size="small" value={r.score} readOnly />
                    <Chip size="small" variant="outlined" label={`by ${formatLabel(r.raterRole)}`} />
                    {r.moderationStatus !== 'visible' && (
                      <Chip
                        size="small"
                        color={r.moderationStatus === 'hidden' ? 'default' : 'warning'}
                        label={formatLabel(r.moderationStatus)}
                      />
                    )}
                  </Stack>
                  {r.comment && (
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      “{r.comment}”
                    </Typography>
                  )}
                  {r.tags.length > 0 && (
                    <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
                      {r.tags.map((t) => (
                        <Chip key={t} size="small" label={formatLabel(t)} />
                      ))}
                    </Stack>
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    {direction === 'received'
                      ? `From ${r.rater?.fullName ?? 'Anonymous'}`
                      : `To ${r.ratee?.fullName ?? 'User'}`}
                    {r.ride ? ` · ${r.ride.pickupAddress} → ${r.ride.dropoffAddress}` : ''} · {formatDate(r.createdAt)}
                  </Typography>
                </Box>
                {canModerate && direction === 'received' && (
                  <Button
                    size="small"
                    color={r.moderationStatus === 'hidden' ? 'primary' : 'warning'}
                    onClick={() =>
                      moderateMutation.mutate({
                        ratingId: r.id,
                        status: r.moderationStatus === 'hidden' ? 'visible' : 'hidden',
                      })
                    }
                    disabled={moderateMutation.isPending}
                  >
                    {r.moderationStatus === 'hidden' ? 'Unhide' : 'Hide'}
                  </Button>
                )}
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </Box>
  );
}
