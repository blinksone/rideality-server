import { Box, Chip, Typography, useTheme } from '@mui/material';

export interface MapDriver {
  userId: string;
  fullName: string | null;
  lat: number | null;
  lng: number | null;
  vehiclePlate?: string | null;
}

export interface MapTrip {
  id: string;
  status: string;
  driverName: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  pickupAddress: string;
  dropoffAddress: string;
}

interface FleetLiveMapProps {
  drivers: MapDriver[];
  activeTrips?: MapTrip[];
  height?: number;
}

/** Lightweight map visualization (no external tiles) for fleet ops. */
export default function FleetLiveMap({ drivers, activeTrips = [], height = 200 }: FleetLiveMapProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const mapBg = isDark ? '#0f172a' : '#0f172a';
  const withCoords = drivers.filter((d) => d.lat != null && d.lng != null);
  const centerLat = withCoords[0]?.lat ?? 24.86;
  const centerLng = withCoords[0]?.lng ?? 67.0;

  const project = (lat: number, lng: number) => {
    const x = 50 + (lng - centerLng) * 4000;
    const y = 50 + (centerLat - lat) * 4000;
    return { x: Math.max(8, Math.min(92, x)), y: Math.max(8, Math.min(92, y)) };
  };

  return (
    <Box
      sx={{
        position: 'relative',
        height,
        borderRadius: 4,
        bgcolor: mapBg,
        border: '1px solid',
        borderColor: 'divider',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(37,99,235,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,0.08) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        {activeTrips.map((trip) => {
          if (trip.pickupLat == null || trip.pickupLng == null || trip.dropoffLat == null || trip.dropoffLng == null) {
            return null;
          }
          const p1 = project(trip.pickupLat, trip.pickupLng);
          const p2 = project(trip.dropoffLat, trip.dropoffLng);
          return (
            <line
              key={trip.id}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke="#F59E0B"
              strokeWidth="0.6"
              strokeDasharray="2 1"
              opacity={0.8}
            />
          );
        })}
        {withCoords.map((d) => {
          const p = project(d.lat!, d.lng!);
          return <circle key={d.userId} cx={p.x} cy={p.y} r="2.2" fill="#22C55E" />;
        })}
      </svg>
      <Box sx={{ position: 'absolute', left: 12, bottom: 10, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Chip size="small" label={`${drivers.length} online`} sx={{ bgcolor: 'rgba(17,24,39,0.85)', color: '#fff' }} />
        <Chip
          size="small"
          label={`${activeTrips.length} active trips`}
          color="warning"
          variant="outlined"
          sx={{ bgcolor: 'rgba(17,24,39,0.85)' }}
        />
        {withCoords.length === 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
            Waiting for driver GPS updates
          </Typography>
        )}
      </Box>
    </Box>
  );
}
