import { Box, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';
import FleetContentCard from '@/fleet-portal/components/FleetContentCard';
import FleetPageHero from '@/fleet-portal/components/FleetPageHero';
import FleetDriverCreditsTable from '@/fleet-portal/components/FleetDriverCreditsTable';
import { useFleetAccessTier } from '@/hooks/useFleetPortalMode';

export default function FleetDriverCreditsPage() {
  const { companyId = '' } = useParams();
  const tier = useFleetAccessTier(companyId);
  const canReview = tier === 'owner';

  return (
    <Box>
      <FleetPageHero
        badge="Fleet finance"
        title="Driver credits"
        description={
          canReview
            ? 'Approve or reject cash and bank credits submitted by Fleet Finance. Approved credits post to the driver’s wallet.'
            : 'Credits you submit stay pending until the fleet owner approves. Approved credits post to the driver’s wallet.'
        }
      />
      <FleetContentCard
        title="Credit requests"
        subtitle="Cash, bank transfer, and other off-app payments recorded against a driver."
      >
        {companyId ? (
          <FleetDriverCreditsTable companyId={companyId} canReview={canReview} />
        ) : (
          <Typography color="text.secondary">No company selected.</Typography>
        )}
      </FleetContentCard>
    </Box>
  );
}
