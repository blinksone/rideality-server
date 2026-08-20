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

export function formatLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatPhone(phone: string | null | undefined): string {
  return phone ?? '—';
}
