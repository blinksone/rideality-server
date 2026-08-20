import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Box, Button, Chip, List, ListItem, ListItemButton, ListItemText, Typography } from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import {
  listFleetNotifications,
  markAllFleetNotificationsRead,
  markFleetNotificationRead,
} from '@/api/fleet.api';
import FleetContentCard from '@/fleet-portal/components/FleetContentCard';
import FleetMetricCard from '@/fleet-portal/components/FleetMetricCard';
import FleetMetricRow, { FleetMetricCell } from '@/fleet-portal/components/FleetMetricRow';
import FleetPageHero from '@/fleet-portal/components/FleetPageHero';
import { formatDate, formatLabel } from '@/utils/format';

export default function FleetNotificationsPage() {
  const { companyId = '' } = useParams();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['fleet-notifications', companyId, page, unreadOnly],
    queryFn: async () => {
      const res = await listFleetNotifications(companyId, {
        page: page + 1,
        limit: 20,
        unreadOnly,
      });
      return res.data;
    },
    enabled: Boolean(companyId),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => markFleetNotificationRead(companyId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fleet-notifications', companyId] }),
  });

  const markAll = useMutation({
    mutationFn: () => markAllFleetNotificationsRead(companyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fleet-notifications', companyId] }),
  });

  return (
    <Box>
      <FleetPageHero
        badge="Alerts"
        title="Notification center"
        description="Fleet alerts for pending approvals, invitations, and system updates."
        actions={
          <>
            <Button
              variant={unreadOnly ? 'contained' : 'outlined'}
              size="small"
              onClick={() => setUnreadOnly((v) => !v)}
              sx={unreadOnly ? {} : { borderColor: 'rgba(255,255,255,0.2)', color: '#fff' }}
            >
              Unread only
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={() => markAll.mutate()}
              disabled={!data?.unreadCount}
              sx={{ borderColor: 'rgba(255,255,255,0.2)', color: '#fff' }}
            >
              Mark all read
            </Button>
          </>
        }
      />
      <FleetMetricRow>
        <FleetMetricCell>
          <FleetMetricCard label="Total" value={data?.total ?? 0} icon={<NotificationsIcon fontSize="small" />} accent="blue" />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard label="Unread" value={data?.unreadCount ?? 0} icon={<MarkEmailReadIcon fontSize="small" />} accent="amber" />
        </FleetMetricCell>
      </FleetMetricRow>
      <FleetContentCard title="Inbox" subtitle="Click a notification to mark it as read">
        <List disablePadding>
          {(data?.notifications ?? []).map((n) => (
            <ListItem key={n.id} divider disablePadding>
              <ListItemButton onClick={() => !n.readAt && markRead.mutate(n.id)}>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      {!n.readAt && <Chip size="small" label="New" color="primary" />}
                      <Typography sx={{ fontWeight: n.readAt ? 500 : 700 }}>{n.title}</Typography>
                      <Chip size="small" label={formatLabel(n.type)} variant="outlined" />
                    </Box>
                  }
                  secondary={
                    <>
                      {n.body}
                      <Typography component="span" variant="caption" sx={{ display: 'block' }} color="text.secondary">
                        {formatDate(n.createdAt)}
                      </Typography>
                    </>
                  }
                />
              </ListItemButton>
            </ListItem>
          ))}
          {!isLoading && (data?.notifications.length ?? 0) === 0 && (
            <ListItem>
              <ListItemText primary="No notifications" secondary="You're all caught up." />
            </ListItem>
          )}
        </List>
      </FleetContentCard>
      {(data?.total ?? 0) > 20 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 2 }}>
          <Button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Button disabled={(page + 1) * 20 >= (data?.total ?? 0)} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </Box>
      )}
    </Box>
  );
}
