import { useMemo } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import type { FleetAccessTier, FleetMembershipSummary } from '@/api/types';

const CITY_PORTAL_ROLES = ['REGIONAL_FLEET', 'FLEET_SUPPORT', 'FLEET_FINANCE'] as const;

/** Fleet company staff use the fleet portal. Geo/platform admins stay in admin. */
export function useFleetPortalMode() {
  const { can, isSuperAdmin } = usePermissions();
  const { user } = useAuth();

  return useMemo(() => {
    if (isSuperAdmin) return false;
    if (user?.adminRole === 'FLEET_OWNER' || user?.platformRoles?.includes('FLEET_OWNER')) {
      return true;
    }
    if (user?.adminRole && (CITY_PORTAL_ROLES as readonly string[]).includes(user.adminRole)) {
      return true;
    }
    const memberships = user?.fleetMemberships ?? [];
    const isCityOperator = memberships.some(
      (m) => m.role === 'regional' || m.role === 'support' || m.role === 'finance',
    );
    if (isCityOperator) return true;

    const hasMembership = memberships.length > 0;
    const hasFleet = can('manage_fleets') || hasMembership;
    const isPlatformStaff = can('manage_users');
    return hasFleet && !isPlatformStaff;
  }, [can, isSuperAdmin, user?.adminRole, user?.fleetMemberships, user?.platformRoles]);
}

export function useActiveFleetMembership(companyId?: string): FleetMembershipSummary | null {
  const { user } = useAuth();
  return useMemo(() => {
    const memberships = user?.fleetMemberships ?? [];
    if (!memberships.length) return null;
    if (companyId) return memberships.find((m) => m.companyId === companyId) ?? null;
    return memberships[0];
  }, [user?.fleetMemberships, companyId]);
}

export function normalizeFleetAccessTier(
  role?: string | null,
  rawRole?: string | null,
): FleetAccessTier | null {
  const value = (role || rawRole || '').toLowerCase();
  if (value === 'owner') return 'owner';
  if (value === 'regional' || value === 'manager') return 'regional';
  if (value === 'finance') return 'finance';
  if (value === 'support' || value === 'dispatcher') return 'support';
  return null;
}

export function useFleetAccessTier(companyId?: string): FleetAccessTier | null {
  const membership = useActiveFleetMembership(companyId);
  const { user } = useAuth();
  return useMemo(() => {
    const fromMembership = normalizeFleetAccessTier(membership?.role, membership?.rawRole);
    if (fromMembership) return fromMembership;
    if (user?.platformRoles?.includes('FLEET_OWNER')) return 'owner';
    if (user?.adminRole === 'FLEET_FINANCE') return 'finance';
    if (user?.adminRole === 'FLEET_SUPPORT') return 'support';
    if (user?.adminRole === 'REGIONAL_FLEET') return 'regional';
    return null;
  }, [membership?.role, membership?.rawRole, user?.platformRoles, user?.adminRole]);
}
