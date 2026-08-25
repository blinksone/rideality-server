import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Avatar, Box, Button, TextField, Typography } from '@mui/material';
import { updateFleetCompany, uploadFleetCompanyLogo } from '@/api/fleet.api';
import { getApiErrorMessage } from '@/api/client';
import { useNotify } from '@/services/notification';
import { mediaUrl } from '@/utils/format';
import type { FleetCompany } from '@/api/types';

type Props = {
  company: FleetCompany;
};

export default function FleetCompanyProfileForm({ company }: Props) {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [legalName, setLegalName] = useState(company.legalName);
  const [email, setEmail] = useState(company.email ?? '');
  const [phone, setPhone] = useState(company.phone ?? '');
  const [address, setAddress] = useState(company.address ?? '');
  const [taxId, setTaxId] = useState(company.taxId ?? '');
  const [fleetTakePercent, setFleetTakePercent] = useState(
    String(Number(company.fleetTakePercent ?? 0)),
  );

  useEffect(() => {
    setLegalName(company.legalName);
    setEmail(company.email ?? '');
    setPhone(company.phone ?? '');
    setAddress(company.address ?? '');
    setTaxId(company.taxId ?? '');
    setFleetTakePercent(String(Number(company.fleetTakePercent ?? 0)));
  }, [company]);

  const take = Math.min(100, Math.max(0, Number(fleetTakePercent) || 0));
  const exampleNet = 760;
  const exampleFleet = Math.round(exampleNet * take) / 100;
  const exampleDriver = Math.round((exampleNet - exampleFleet) * 100) / 100;

  const dirty =
    legalName.trim() !== company.legalName ||
    email.trim() !== (company.email ?? '') ||
    phone.trim() !== (company.phone ?? '') ||
    address.trim() !== (company.address ?? '') ||
    taxId.trim() !== (company.taxId ?? '') ||
    take !== Number(company.fleetTakePercent ?? 0);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateFleetCompany(company.id, {
        legalName: legalName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        taxId: taxId.trim() || null,
        fleetTakePercent: take,
      }),
    onSuccess: () => {
      notify.success('Company profile updated');
      queryClient.invalidateQueries({ queryKey: ['fleet-company', company.id] });
      queryClient.invalidateQueries({ queryKey: ['fleet-companies'] });
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  const logoMutation = useMutation({
    mutationFn: (file: File) => uploadFleetCompanyLogo(company.id, file),
    onSuccess: () => {
      notify.success('Logo updated');
      queryClient.invalidateQueries({ queryKey: ['fleet-company', company.id] });
    },
    onError: (e) => notify.error(getApiErrorMessage(e)),
  });

  return (
    <Box sx={{ maxWidth: 560 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Avatar
          src={mediaUrl(company.logoUrl)}
          alt={company.legalName}
          sx={{ width: 72, height: 72, bgcolor: 'primary.main', fontSize: 28 }}
        >
          {company.legalName.slice(0, 1).toUpperCase()}
        </Avatar>
        <Box>
          <Button
            variant="outlined"
            size="small"
            disabled={logoMutation.isPending}
            onClick={() => fileRef.current?.click()}
          >
            {logoMutation.isPending ? 'Uploading…' : 'Upload logo'}
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            Square JPG, PNG, or WebP. Shown to drivers when they join this fleet.
          </Typography>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) logoMutation.mutate(file);
            }}
          />
        </Box>
      </Box>
      <TextField
        fullWidth
        label="Company name"
        value={legalName}
        onChange={(e) => setLegalName(e.target.value.slice(0, 120))}
        helperText="Public name drivers see on the company list and profile."
        sx={{ mb: 2 }}
      />
      <TextField
        fullWidth
        label="Company email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        helperText="Public contact email. This is not your login email."
        sx={{ mb: 2 }}
      />
      <TextField
        fullWidth
        label="Mobile number"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        helperText="Public contact number with country code, e.g. +923001234567."
        sx={{ mb: 2 }}
      />
      <TextField
        fullWidth
        label="Address"
        value={address}
        onChange={(e) => setAddress(e.target.value.slice(0, 250))}
        helperText="Office or city address shown on the company profile."
        multiline
        minRows={2}
        sx={{ mb: 2 }}
      />
      <TextField
        fullWidth
        label="Tax / registration ID"
        value={taxId}
        onChange={(e) => setTaxId(e.target.value.slice(0, 50))}
        helperText="Optional internal record. Not shown to drivers."
        sx={{ mb: 2 }}
      />
      <TextField
        fullWidth
        label="Fleet take %"
        type="number"
        value={fleetTakePercent}
        onChange={(e) => setFleetTakePercent(e.target.value)}
        inputProps={{ min: 0, max: 100, step: 0.01 }}
        helperText={`Your share of trip net after the platform cut. Driver receives the rest. Example: net ${exampleNet} at ${take}% → fleet ${exampleFleet}, driver ${exampleDriver}.`}
        sx={{ mb: 2 }}
      />
      <Button
        variant="contained"
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending || !dirty || legalName.trim().length < 2}
      >
        Save profile
      </Button>
    </Box>
  );
}
