import { useMemo } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import type { FleetAccessTier, FleetMembershipSummary } from '@/api/types';

/** City fleet operators use the fleet portal. Owners and platform staff stay in admin. */
export function useFleetPortalMode() {
  const { can, isSuperAdmin } = usePermissions();
  const { user } = useAuth();

  return useMemo(() => {
    if (isSuperAdmin) return false;
    const memberships = user?.fleetMemberships ?? [];
    const isCityOperator = memberships.some((m) => m.role === 'regional' || m.role === 'support');
    if (isCityOperator) return true;

    const hasMembership = memberships.length > 0;
    const hasFleet = can('manage_fleets') || hasMembership;
    const isPlatformStaff = can('manage_users');
    return hasFleet && !isPlatformStaff;
  }, [can, isSuperAdmin, user?.fleetMemberships]);
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
    return null;
  }, [membership?.role, membership?.rawRole, user?.platformRoles]);
}
