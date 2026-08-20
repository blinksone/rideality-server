export const FINANCE_COLORS = {
  positive: '#22C55E',
  negative: '#EF4444',
  zero: '#94A3B8',
  primary: '#2563EB',
  warning: '#F59E0B',
  danger: '#EF4444',
} as const;

export function balanceColor(balance: number): string {
  if (balance > 0) return FINANCE_COLORS.positive;
  if (balance < 0) return FINANCE_COLORS.negative;
  return FINANCE_COLORS.zero;
}

export function formatWalletMoney(amount: number, currency: string): string {
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
}

export function walletStatusChipColor(status: string): 'success' | 'warning' | 'default' {
  if (status === 'active') return 'success';
  if (status === 'frozen') return 'warning';
  return 'default';
}

export function accountStatusChipColor(
  status: string,
): 'success' | 'warning' | 'error' | 'default' {
  const s = status.toUpperCase();
  if (s === 'ACTIVE') return 'success';
  if (s === 'BANNED') return 'error';
  if (s === 'SUSPENDED') return 'warning';
  return 'default';
}

export function ownerInitials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

export function shortWalletId(id: string): string {
  return `${id.slice(0, 8)}…`;
}
