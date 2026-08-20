import { Box, Paper, Typography } from '@mui/material';
import ConstructionIcon from '@mui/icons-material/Construction';

export default function FleetPlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 3 }}>
        {title}
      </Typography>
      <Paper
        sx={{
          p: 6,
          textAlign: 'center',
          border: 1,
          borderColor: 'divider',
          borderStyle: 'dashed',
        }}
      >
        <ConstructionIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
          Coming in Phase 2
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 480, mx: 'auto' }}>
          {description}
        </Typography>
      </Paper>
    </Box>
  );
}
