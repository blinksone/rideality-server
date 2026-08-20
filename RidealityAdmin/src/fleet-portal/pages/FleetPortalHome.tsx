import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Box, Card, CardActionArea, CardContent, CircularProgress, Grid, Typography } from '@mui/material';
import BusinessIcon from '@mui/icons-material/Business';
import { listAdminFleets } from '@/api/fleet.api';
import { fleetLandingSegment, fleetPath } from '@/fleet-portal/fleetNavConfig';
import FleetPageHero from '@/fleet-portal/components/FleetPageHero';
import { useActiveFleetMembership } from '@/hooks/useFleetPortalMode';
import { formatLabel } from '@/utils/format';

export default function FleetPortalHome() {
  const navigate = useNavigate();
  const membership = useActiveFleetMembership();
  const landing = fleetLandingSegment(membership?.role ?? null);

  const { data, isLoading } = useQuery({
    queryKey: ['fleet-portal-companies'],
    queryFn: () => listAdminFleets({ page: 1, limit: 50 }),
  });

  const companies = data?.data ?? [];

  useEffect(() => {
    if (companies.length === 1) {
      navigate(fleetPath(companies[0].id, landing), { replace: true });
    }
  }, [companies, navigate, landing]);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (companies.length === 0) {
    return (
      <Box>
        <FleetPageHero
          badge="Fleet portal"
          title="Welcome"
          description="No fleet companies are linked to your account yet. Register a fleet company to get started."
        />
      </Box>
    );
  }

  return (
    <Box>
      <FleetPageHero
        badge="Fleet portal"
        title="Select fleet"
        description="Choose a company to open its fleet management dashboard."
      />
      <Grid container spacing={2}>
        {companies.map((c) => (
          <Grid key={c.id} size={{ xs: 12, sm: 6, md: 4 }}>
            <Card
              sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: 3,
                transition: 'box-shadow 0.2s, transform 0.2s',
                '&:hover': { boxShadow: 4, transform: 'translateY(-2px)' },
              }}
            >
              <CardActionArea onClick={() => navigate(fleetPath(c.id, landing))} sx={{ p: 0.5 }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: 'primary.main',
                        color: 'primary.contrastText',
                      }}
                    >
                      <BusinessIcon fontSize="small" />
                    </Box>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      {c.legalName}
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {c.region?.name ?? '—'} · {formatLabel(c.status)}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
