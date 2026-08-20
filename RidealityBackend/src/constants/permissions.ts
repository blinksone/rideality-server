export const PERMISSION_KEYS = {
  MANAGE_USERS: 'manage_users',
  MANAGE_DRIVERS: 'manage_drivers',
  MANAGE_FLEETS: 'manage_fleets',
  MANAGE_ROLES: 'manage_roles',
  VIEW_REPORTS: 'view_reports',
  MANAGE_DOCUMENTS: 'manage_documents',
  MANAGE_PENALTIES: 'manage_penalties',
  MANAGE_NOTES: 'manage_notes',
  VIEW_FINANCE: 'view_finance',
  MANAGE_WALLET_ADJUSTMENTS: 'manage_wallet_adjustments',
  APPROVE_WALLET_ADJUSTMENTS: 'approve_wallet_adjustments',
  MANAGE_PAYOUTS: 'manage_payouts',
  EXPORT_FINANCE_REPORTS: 'export_finance_reports',
} as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[keyof typeof PERMISSION_KEYS];

export const DEFAULT_PERMISSIONS: { key: PermissionKey; meaning: string }[] = [
  { key: PERMISSION_KEYS.MANAGE_USERS, meaning: 'List, view, update user status' },
  { key: PERMISSION_KEYS.MANAGE_DRIVERS, meaning: 'Approve/reject drivers' },
  { key: PERMISSION_KEYS.MANAGE_FLEETS, meaning: 'Fleet companies & drivers' },
  { key: PERMISSION_KEYS.MANAGE_ROLES, meaning: 'Create/edit roles and assign permissions' },
  { key: PERMISSION_KEYS.VIEW_REPORTS, meaning: 'Read-only reports/audit' },
  { key: PERMISSION_KEYS.MANAGE_DOCUMENTS, meaning: 'Review KYC documents' },
  { key: PERMISSION_KEYS.MANAGE_PENALTIES, meaning: 'Apply wallet penalties' },
  { key: PERMISSION_KEYS.MANAGE_NOTES, meaning: 'Add support notes' },
  { key: PERMISSION_KEYS.VIEW_FINANCE, meaning: 'View wallets, transactions, and finance dashboard' },
  { key: PERMISSION_KEYS.MANAGE_WALLET_ADJUSTMENTS, meaning: 'Request manual wallet credits and debits' },
  { key: PERMISSION_KEYS.APPROVE_WALLET_ADJUSTMENTS, meaning: 'Approve or reject wallet adjustments and payouts' },
  { key: PERMISSION_KEYS.MANAGE_PAYOUTS, meaning: 'Create payout requests' },
  { key: PERMISSION_KEYS.EXPORT_FINANCE_REPORTS, meaning: 'Export finance reports' },
];

export const DEFAULT_ROLE_TEMPLATES = [
  {
    name: 'Support Agent',
    slug: 'support-agent',
    description: 'Basic user support access',
    permissionKeys: [PERMISSION_KEYS.MANAGE_USERS, PERMISSION_KEYS.MANAGE_NOTES, PERMISSION_KEYS.VIEW_REPORTS],
    isSystem: true,
  },
  {
    name: 'Fleet Manager',
    slug: 'fleet-manager',
    description: 'Manage fleet operations',
    permissionKeys: [PERMISSION_KEYS.MANAGE_FLEETS, PERMISSION_KEYS.MANAGE_DRIVERS, PERMISSION_KEYS.VIEW_REPORTS],
    isSystem: true,
  },
  {
    name: 'Sub Admin',
    slug: 'sub-admin',
    description: 'Operations sub-admin without role management',
    permissionKeys: [
      PERMISSION_KEYS.MANAGE_USERS,
      PERMISSION_KEYS.MANAGE_DRIVERS,
      PERMISSION_KEYS.MANAGE_DOCUMENTS,
      PERMISSION_KEYS.MANAGE_NOTES,
      PERMISSION_KEYS.VIEW_REPORTS,
    ],
    isSystem: true,
  },
  {
    name: 'Finance Officer',
    slug: 'finance-officer',
    description: 'Platform finance and wallet operations',
    permissionKeys: [
      PERMISSION_KEYS.VIEW_FINANCE,
      PERMISSION_KEYS.MANAGE_WALLET_ADJUSTMENTS,
      PERMISSION_KEYS.MANAGE_PAYOUTS,
      PERMISSION_KEYS.EXPORT_FINANCE_REPORTS,
      PERMISSION_KEYS.VIEW_REPORTS,
    ],
    isSystem: true,
  },
] as const;
