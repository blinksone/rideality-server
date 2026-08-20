import { Box, Typography } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

interface PageHeroProps {
  title: string;
  description: string;
  badge?: string;
  actions?: React.ReactNode;
}

export default function PageHero({ title, description, badge, actions }: PageHeroProps) {
  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 4,
        p: 3,
        mb: 3,
        color: '#fff',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
        boxShadow: '0 10px 40px rgba(15, 23, 42, 0.25)',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          right: -80,
          top: -80,
          width: 320,
          height: 320,
          borderRadius: '50%',
          bgcolor: 'rgba(59, 130, 246, 0.1)',
          filter: 'blur(40px)',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          left: '30%',
          bottom: -60,
          width: 200,
          height: 200,
          borderRadius: '50%',
          bgcolor: 'rgba(99, 102, 241, 0.1)',
          filter: 'blur(40px)',
        }}
      />
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          gap: 3,
          alignItems: { md: 'center' },
          justifyContent: 'space-between',
        }}
      >
        <Box>
          {badge && (
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                px: 1.25,
                py: 0.5,
                mb: 1,
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                bgcolor: 'rgba(99, 102, 241, 0.2)',
                color: '#A5B4FC',
                border: '1px solid rgba(99, 102, 241, 0.3)',
              }}
            >
              <AutoAwesomeIcon sx={{ fontSize: 14 }} />
              {badge}
            </Box>
          )}
          <Typography
            variant="h5"
            sx={{ fontWeight: 700, fontFamily: '"Space Grotesk", sans-serif', letterSpacing: '-0.02em' }}
          >
            {title}
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(203, 213, 225, 0.9)', mt: 0.5, maxWidth: 560 }}>
            {description}
          </Typography>
        </Box>
        {actions && <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>{actions}</Box>}
      </Box>
    </Box>
  );
}
