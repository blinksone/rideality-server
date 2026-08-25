import { useQuery } from '@tanstack/react-query';
import { Box, Typography } from '@mui/material';
import BusinessIcon from '@mui/icons-material/Business';
import PublicIcon from '@mui/icons-material/Public';
import { useParams } from 'react-router-dom';
import { getFleetCompany } from '@/api/fleet.api';
import FleetContentCard from '@/fleet-portal/components/FleetContentCard';
import FleetMetricCard from '@/fleet-portal/components/FleetMetricCard';
import FleetMetricRow, { FleetMetricCell } from '@/fleet-portal/components/FleetMetricRow';
import FleetPageHero from '@/fleet-portal/components/FleetPageHero';
import FleetCompanyProfileForm from '@/modules/fleet/FleetCompanyProfileForm';
import { formatLabel } from '@/utils/format';

export default function FleetCompanyPage() {
  const { companyId = '' } = useParams();

  const { data: company, isLoading } = useQuery({
    queryKey: ['fleet-company', companyId],
    queryFn: () => getFleetCompany(companyId),
    enabled: Boolean(companyId),
  });

  return (
    <Box>
      <FleetPageHero
        badge="Company profile"
        title={company?.legalName ?? 'About company'}
        description="Company details for this fleet. Update the public profile drivers see when they join, including your take of trip net after platform commission."
      />
      <FleetMetricRow>
        <FleetMetricCell>
          <FleetMetricCard
            label="Status"
            value={isLoading ? '…' : formatLabel(company?.status ?? '—')}
            icon={<BusinessIcon fontSize="small" />}
            accent="blue"
          />
        </FleetMetricCell>
        <FleetMetricCell>
          <FleetMetricCard
            label="Region"
            value={company?.region?.name ?? '—'}
            icon={<PublicIcon fontSize="small" />}
            accent="indigo"
          />
        </FleetMetricCell>
      </FleetMetricRow>
      <FleetContentCard
        title="Public company profile"
        subtitle="Name, logo, email, mobile, and address appear on the driver signup company screen."
      >
        {isLoading ? (
          <Typography color="text.secondary">Loading…</Typography>
        ) : company ? (
          <FleetCompanyProfileForm company={company} />
        ) : null}
      </FleetContentCard>
    </Box>
  );
}

export function FleetSettingsPage() {
  return <FleetCompanyPage />;
}
