import { Box, Card, CardActionArea, Typography } from '@mui/material';
import type { ElementType, ReactNode } from 'react';

type AccentKey = 'blue' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'teal';

const accentColors: Record<AccentKey, { color: string; bg: string; border: string }> = {
  blue: { color: '#2563EB', bg: 'rgba(239, 246, 255, 0.7)', border: 'rgba(219, 234, 254, 0.5)' },
  indigo: { color: '#4F46E5', bg: 'rgba(238, 242, 255, 0.7)', border: 'rgba(224, 231, 255, 0.5)' },
  emerald: { color: '#059669', bg: 'rgba(236, 253, 245, 0.7)', border: 'rgba(209, 250, 229, 0.5)' },
  amber: { color: '#D97706', bg: 'rgba(255, 251, 235, 0.7)', border: 'rgba(254, 243, 199, 0.5)' },
  rose: { color: '#E11D48', bg: 'rgba(255, 241, 242, 0.7)', border: 'rgba(255, 228, 230, 0.5)' },
  teal: { color: '#0D9488', bg: 'rgba(240, 253, 250, 0.7)', border: 'rgba(204, 251, 241, 0.5)' },
};

function colorToAccent(color: string): AccentKey {
  if (color.includes('warning') || color.includes('amber')) return 'amber';
  if (color.includes('error') || color.includes('danger') || color.includes('rose')) return 'rose';
  if (color.includes('success') || color.includes('positive') || color.includes('emerald')) return 'emerald';
  if (color.includes('info') || color.includes('indigo')) return 'indigo';
  if (color.includes('teal')) return 'teal';
  return 'blue';
}

interface StatCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon?: ReactNode;
  color?: string;
  accent?: AccentKey;
  to?: string;
  component?: ElementType;
}

export default function StatCard({
  title,
  value,
  subtitle,
  icon,
  color = 'primary.main',
  accent,
  to,
  component,
}: StatCardProps) {
  const colors = accentColors[accent ?? colorToAccent(color)];

  const content = (
    <Box
      sx={{
        p: 2.5,
        height: '100%',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        minWidth: 0,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, fontSize: 13, mb: 1.5 }}>
          {title}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              fontFamily: '"Space Grotesk", "Inter", sans-serif',
              lineHeight: 1.1,
              wordBreak: 'break-word',
            }}
          >
            {value}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: 10 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
      </Box>
      {icon && (
        <Box
          sx={{
            p: 1.25,
            borderRadius: 3,
            color: colors.color,
            bgcolor: colors.bg,
            border: `1px solid ${colors.border}`,
            display: 'flex',
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
      )}
    </Box>
  );

  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        borderRadius: 3,
        transition: 'box-shadow 0.2s, transform 0.2s',
        '&:hover': { boxShadow: '0 8px 30px rgba(0,0,0,0.04)' },
      }}
    >
      {to && component ? (
        <CardActionArea component={component} to={to} sx={{ height: '100%' }}>
          {content}
        </CardActionArea>
      ) : (
        content
      )}
    </Card>
  );
}
