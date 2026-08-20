import { Button, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import PageHeader from '@/components/PageHeader';

export default function NotFoundPage() {
  return (
  <>
      <PageHeader title="Page not found" subtitle="The page you requested does not exist." />
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        Check the URL or return to the dashboard.
      </Typography>
      <Button component={RouterLink} to="/" variant="contained">
        Go to dashboard
      </Button>
    </>
  );
}
