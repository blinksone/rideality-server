import { Box, Paper, Typography } from '@mui/material';
import type { ReactNode } from 'react';

interface ContentCardProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  sx?: object;
}

export default function ContentCard({ title, subtitle, actions, children, sx }: ContentCardProps) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, ...sx }}>
      {(title || subtitle || actions) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 2,
            mb: 2,
            flexWrap: 'wrap',
          }}
        >
          <Box>
            {title && (
              <Typography variant="subtitle1" sx={{ fontWeight: 700, fontFamily: '"Space Grotesk", sans-serif' }}>
                {title}
              </Typography>
            )}
            {subtitle && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          {actions}
        </Box>
      )}
      {children}
    </Paper>
  );
}
