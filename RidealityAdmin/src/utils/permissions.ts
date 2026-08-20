import type { PermissionKey, PlatformRole } from '@/api/types';

export const PERMISSIONS: PermissionKey[] = [
  'manage_users',
  'manage_drivers',
  'manage_fleets',
  'manage_roles',
  'view_reports',
  'manage_documents',
  'manage_penalties',
  'manage_notes',
  'view_finance',
  'manage_wallet_adjustments',
  'approve_wallet_adjustments',
  'manage_payouts',
  'export_finance_reports',
];

export const PLATFORM_ROLES: PlatformRole[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'SUB_ADMIN',
  'FINANCE_OFFICER',
  'FLEET_OWNER',
  'FLEET_MANAGER',
  'SUPPORT_AGENT',
];

export const PLATFORM_STAFF_ROLES: PlatformRole[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'SUB_ADMIN',
  'FINANCE_OFFICER',
  'SUPPORT_AGENT',
];

export function hasPermission(
  effective: PermissionKey[] | undefined,
  required: PermissionKey | PermissionKey[],
  isSuperAdmin = false,
): boolean {
  if (isSuperAdmin) return true;
  if (!effective?.length) return false;
  const requiredList = Array.isArray(required) ? required : [required];
  return requiredList.every((p) => effective.includes(p));
}

export function hasAnyPermission(
  effective: PermissionKey[] | undefined,
  required: PermissionKey[],
  isSuperAdmin = false,
): boolean {
  if (isSuperAdmin) return true;
  if (!effective?.length) return false;
  return required.some((p) => effective.includes(p));
}

export function hasAllPermissions(
  effective: PermissionKey[] | undefined,
  required: PermissionKey[],
  isSuperAdmin = false,
): boolean {
  if (isSuperAdmin) return true;
  if (!effective?.length) return false;
  return required.every((p) => effective.includes(p));
}

export function hasPlatformRole(roles: PlatformRole[] | undefined, role: PlatformRole): boolean {
  return roles?.includes(role) ?? false;
}
