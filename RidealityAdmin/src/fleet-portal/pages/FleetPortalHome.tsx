import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Card, CardActionArea, CardContent, Grid, Typography } from '@mui/material';
import BusinessIcon from '@mui/icons-material/Business';
import { fleetLandingSegment, fleetPath } from '@/fleet-portal/fleetNavConfig';
import FleetPageHero from '@/fleet-portal/components/FleetPageHero';
import { useAuth } from '@/hooks/useAuth';
import { formatLabel } from '@/utils/format';

export default function FleetPortalHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const memberships = user?.fleetMemberships ?? [];
  const companies = memberships.filter(
    (row, index, list) => list.findIndex((item) => item.companyId === row.companyId) === index,
  );

  useEffect(() => {
    if (companies.length === 1) {
      navigate(fleetPath(companies[0].companyId, fleetLandingSegment(companies[0].role)), { replace: true });
    }
  }, [companies, navigate]);

  if (companies.length === 0) {
    return (
      <Box>
        <FleetPageHero
          badge="Fleet portal"
          title="Welcome"
          description="No fleet companies are linked to your account yet. Ask your fleet owner to invite you."
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
          <Grid key={c.companyId} size={{ xs: 12, sm: 6, md: 4 }}>
            <Card
              sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: 3,
                transition: 'box-shadow 0.2s, transform 0.2s',
                '&:hover': { boxShadow: 4, transform: 'translateY(-2px)' },
              }}
            >
              <CardActionArea
                onClick={() => navigate(fleetPath(c.companyId, fleetLandingSegment(c.role)))}
                sx={{ p: 0.5 }}
              >
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
                      {c.companyName}
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {c.fleetRegionName ?? 'All cities'} · {formatLabel(c.companyStatus)}
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
