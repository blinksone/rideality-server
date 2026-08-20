import { Grid } from '@mui/material';
import type { ReactNode } from 'react';

interface MetricRowProps {
  children: ReactNode;
}

export default function MetricRow({ children }: MetricRowProps) {
  return (
    <Grid container spacing={2.5} sx={{ mb: 3 }}>
      {children}
    </Grid>
  );
}

export function MetricCell({ children }: { children: ReactNode }) {
  return (
    <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
      {children}
    </Grid>
  );
}
