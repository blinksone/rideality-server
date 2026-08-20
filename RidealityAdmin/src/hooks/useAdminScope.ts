import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { AdminRole, ScopeType } from '@/api/types';

/** Mirrors backend ALLOWED_INVITES so list tabs follow the same ladder. */
const INVITE_LADDER: Record<AdminRole, AdminRole[]> = {
  SUPER_ADMIN: [
    'GLOBAL_ADMIN',
    'SUB_ADMIN',
    'FINANCE_USER',
    'PLATFORM_SUPPORT',
    'CONTINENT_ADMIN',
    'COUNTRY_ADMIN',
    'FLEET_OWNER',
  ],
  GLOBAL_ADMIN: ['CONTINENT_ADMIN'],
  CONTINENT_ADMIN: ['COUNTRY_ADMIN'],
  COUNTRY_ADMIN: ['REGIONAL_ADMIN'],
  REGIONAL_ADMIN: ['CITY_ADMIN'],
  CITY_ADMIN: ['FLEET_OWNER'],
  SUB_ADMIN: [],
  FINANCE_USER: [],
  PLATFORM_SUPPORT: [],
  FLEET_OWNER: ['REGIONAL_FLEET', 'FLEET_FINANCE', 'FLEET_SUPPORT'],
  REGIONAL_FLEET: ['FLEET_SUPPORT'],
  FLEET_SUPPORT: [],
  FLEET_FINANCE: [],
};

function expandInviteTree(roots: AdminRole[]): AdminRole[] {
  const found = new Set<AdminRole>();
  const stack = [...roots];
  while (stack.length) {
    const next = stack.pop()!;
    if (found.has(next)) continue;
    found.add(next);
    stack.push(...(INVITE_LADDER[next] ?? []));
  }
  return [...found];
}

export function useAdminScope() {
  const { user, isSuperAdmin } = useAuth();

  return useMemo(() => {
    const role = user?.adminRole ?? null;
    const scopeType: ScopeType | null = user?.scopeType ?? null;
    const continentId = user?.continentId ?? null;
    const countryId = user?.countryId ?? null;
    const regionalId = user?.regionalId ?? null;
    const cityId = user?.cityId ?? null;
    const inviteTargets = user?.canInvite ?? [];
    const listableStaffRoles = expandInviteTree(
      role === 'SUPER_ADMIN'
        ? INVITE_LADDER.SUPER_ADMIN
        : inviteTargets.length
          ? inviteTargets
          : role
            ? INVITE_LADDER[role]
            : [],
    );

    const canInvite = (target: AdminRole) =>
      inviteTargets.includes(target) ||
      (role === 'SUPER_ADMIN' && INVITE_LADDER.SUPER_ADMIN.includes(target)) ||
      (!inviteTargets.length && Boolean(role) && (INVITE_LADDER[role] ?? []).includes(target));

    const isInScope = (requestedCountryId?: string | null, requestedCityId?: string | null, requestedContinentId?: string | null, requestedRegionalId?: string | null) => {
      if (isSuperAdmin || scopeType === 'PLATFORM' || scopeType === 'GLOBAL' || !scopeType) return true;
      if (scopeType === 'CONTINENT') {
        return !requestedContinentId || requestedContinentId === continentId;
      }
      if (scopeType === 'COUNTRY') {
        return !requestedCountryId || requestedCountryId === countryId;
      }
      if (scopeType === 'REGIONAL') {
        if (requestedRegionalId) return requestedRegionalId === regionalId;
        if (requestedCountryId) return requestedCountryId === countryId;
        return true;
      }
      if (scopeType === 'CITY') {
        if (requestedCityId) return requestedCityId === cityId;
        if (requestedCountryId) return requestedCountryId === countryId;
        return true;
      }
      return false;
    };

    return {
      role,
      scopeType,
      continentId,
      countryId,
      regionalId,
      cityId,
      canInvite,
      listableStaffRoles,
      canCreateStaff:
        inviteTargets.length > 0 ||
        role === 'SUPER_ADMIN' ||
        Boolean(role && (INVITE_LADDER[role] ?? []).length),
      isInScope,
      isSuperAdmin: role === 'SUPER_ADMIN' || isSuperAdmin,
      isFleetOwner: role === 'FLEET_OWNER',
      isRegionalFleet: role === 'REGIONAL_FLEET',
      isFleetSupport: role === 'FLEET_SUPPORT',
      isFleetFinance: role === 'FLEET_FINANCE',
    };
  }, [user, isSuperAdmin]);
}
