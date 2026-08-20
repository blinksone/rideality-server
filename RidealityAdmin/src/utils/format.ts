import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return dayjs(value).format('MMM D, YYYY h:mm A');
}

export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return dayjs(value).fromNow();
}

export function formatLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return value
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatAdminRole(role: string | null | undefined): string {
  if (!role) return '—';
  const labels: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin',
    GLOBAL_ADMIN: 'Global Admin',
    CONTINENT_ADMIN: 'Continent Admin',
    COUNTRY_ADMIN: 'Country Admin',
    REGIONAL_ADMIN: 'Regional Admin (Region Head)',
    CITY_ADMIN: 'City Admin',
    SUB_ADMIN: 'Sub Admin',
    FINANCE_USER: 'Finance User',
    PLATFORM_SUPPORT: 'Platform Support',
    FLEET_OWNER: 'Fleet Owner',
    REGIONAL_FLEET: 'Regional Fleet',
    FLEET_SUPPORT: 'Fleet Support',
    FLEET_FINANCE: 'Fleet Finance',
  };
  return labels[role] ?? formatLabel(role);
}

export function formatPhone(phone: string | null | undefined): string {
  return phone ?? '—';
}
