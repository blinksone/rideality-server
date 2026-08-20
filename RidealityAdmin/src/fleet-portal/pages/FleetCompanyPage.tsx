import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Button, TextField, Typography } from '@mui/material';
import BusinessIcon from '@mui/icons-material/Business';
import PublicIcon from '@mui/icons-material/Public';
import { useParams } from 'react-router-dom';
import { getFleetCompany, updateFleetCompany } from '@/api/fleet.api';
import { getApiErrorMessage } from '@/api/client';
import FleetContentCard from '@/fleet-portal/components/FleetContentCard';
import FleetMetricCard from '@/fleet-portal/components/FleetMetricCard';
import FleetMetricRow, { FleetMetricCell } from '@/fleet-portal/components/FleetMetricRow';
import FleetPageHero from '@/fleet-portal/components/FleetPageHero';
import { useNotify } from '@/services/notification';
import { formatLabel } from '@/utils/format';

export default function FleetCompanyPage() {
  const { companyId = '' } = useParams();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [legalName, setLegalName] = useState('');
  const [taxId, setTaxId] = useState('');

  const { data: company, isLoading } = useQuery({
    queryKey: ['fleet-company', companyId],
    queryFn: () => getFleetCompany(companyId),
    enabled: Boolean(companyId),
  });

  useEffect(() => {
    if (company) {
      setLegalName(company.legalName);
      setTaxId(company.taxId ?? '');
    }
  }, [company]);

  const saveMutation = useMutation({
    mutationFn: () => updateFleetCompany(companyId, { taxId }),
    onSuccess: () => {
      notify.success('Company updated');
      queryClient.invalidateQueries({ queryKey: ['fleet-company', companyId] });
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  return (
    <Box>
      <FleetPageHero
        badge="Company profile"
        title={company?.legalName ?? 'Fleet company'}
        description="Manage your fleet company legal information, tax registration, and regional settings."
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
      <FleetContentCard title="Business details" subtitle="Tax identification for your fleet. Legal name can only be changed by platform admin.">
        {isLoading ? (
          <Typography color="text.secondary">Loading…</Typography>
        ) : company ? (
          <Box sx={{ maxWidth: 560 }}>
            <TextField
              fullWidth
              label="Legal name"
              value={legalName}
              disabled
              helperText="Contact platform support to change the company legal name."
              sx={{ mb: 2 }}
            />
            <TextField fullWidth label="Tax ID" value={taxId} onChange={(e) => setTaxId(e.target.value)} sx={{ mb: 2 }} />
            <Button
              variant="contained"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || taxId === (company.taxId ?? '')}
            >
              Save changes
            </Button>
          </Box>
        ) : null}
      </FleetContentCard>
    </Box>
  );
}

export function FleetSettingsPage() {
  return <FleetCompanyPage />;
}
