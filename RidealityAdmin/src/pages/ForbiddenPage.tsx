import { Button, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import PageHeader from '@/components/PageHeader';

export default function ForbiddenPage() {
  return (
    <>
      <PageHeader title="Access denied" subtitle="You do not have permission to view this page." />
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        Contact a super admin if you believe this is an error.
      </Typography>
      <Button component={RouterLink} to="/" variant="contained">
        Go to dashboard
      </Button>
    </>
  );
}
