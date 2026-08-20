/** Design tokens aligned with rideality-admin-portal reference (Tailwind slate/blue palette). */
export const brandColors = {
  primary: { main: '#2563EB', light: '#3B82F6', dark: '#1D4ED8', contrastText: '#fff' },
  indigo: { main: '#4F46E5', light: '#6366F1', dark: '#4338CA' },
  success: { main: '#22C55E', light: '#4ADE80', dark: '#16A34A', contrastText: '#fff' },
  warning: { main: '#F59E0B', light: '#FBBF24', dark: '#D97706', contrastText: '#111827' },
  error: { main: '#EF4444', light: '#F87171', dark: '#DC2626', contrastText: '#fff' },
} as const;

export const surface = {
  light: {
    app: '#F8FAFC',
    paper: '#FFFFFF',
    sidebar: '#FFFFFF',
    border: '#F1F5F9',
    borderSubtle: '#E2E8F0',
    textPrimary: '#1E293B',
    textSecondary: '#64748B',
    textMuted: '#94A3B8',
    navActiveBg: 'rgba(239, 246, 255, 0.7)',
    navActiveText: '#2563EB',
  },
  dark: {
    app: '#0F172A',
    paper: '#1E293B',
    sidebar: '#111827',
    border: '#334155',
    borderSubtle: '#1E293B',
    textPrimary: '#F1F5F9',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    navActiveBg: 'rgba(37, 99, 235, 0.12)',
    navActiveText: '#60A5FA',
  },
} as const;

export const shadows = {
  sidebar: '4px 0 24px rgba(0, 0, 0, 0.015)',
  header: '0 2px 12px rgba(0, 0, 0, 0.005)',
  card: '0 8px 30px rgba(0, 0, 0, 0.015)',
  cardHover: '0 8px 30px rgba(0, 0, 0, 0.04)',
} as const;

export const metricAccent = {
  blue: { color: '#2563EB', bg: 'rgba(239, 246, 255, 0.7)', border: 'rgba(219, 234, 254, 0.5)' },
  indigo: { color: '#4F46E5', bg: 'rgba(238, 242, 255, 0.7)', border: 'rgba(224, 231, 255, 0.5)' },
  emerald: { color: '#059669', bg: 'rgba(236, 253, 245, 0.7)', border: 'rgba(209, 250, 229, 0.5)' },
  amber: { color: '#D97706', bg: 'rgba(255, 251, 235, 0.7)', border: 'rgba(254, 243, 199, 0.5)' },
  rose: { color: '#E11D48', bg: 'rgba(255, 241, 242, 0.7)', border: 'rgba(255, 228, 230, 0.5)' },
  teal: { color: '#0D9488', bg: 'rgba(240, 253, 250, 0.7)', border: 'rgba(204, 251, 241, 0.5)' },
} as const;
