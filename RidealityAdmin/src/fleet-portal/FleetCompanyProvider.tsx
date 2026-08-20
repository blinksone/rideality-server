import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { FleetMembershipSummary } from '@/api/types';

const STORAGE_KEY = 'rideality_active_fleet_id';

export interface FleetPortalCompany {
  id: string;
  legalName: string;
  status: string;
}

interface FleetCompanyContextValue {
  companies: FleetPortalCompany[];
  company: FleetPortalCompany | null;
  companyId: string | null;
  setCompanyId: (id: string) => void;
  loading: boolean;
  memberships: FleetMembershipSummary[];
}

const EMPTY_MEMBERSHIPS: FleetMembershipSummary[] = [];

const FleetCompanyContext = createContext<FleetCompanyContextValue | null>(null);

function companiesFromMemberships(memberships: FleetMembershipSummary[]): FleetPortalCompany[] {
  const seen = new Set<string>();
  const companies: FleetPortalCompany[] = [];
  for (const row of memberships) {
    if (seen.has(row.companyId)) continue;
    seen.add(row.companyId);
    companies.push({
      id: row.companyId,
      legalName: row.companyName,
      status: row.companyStatus,
    });
  }
  return companies;
}

export function FleetCompanyProvider({
  companyId,
  children,
}: {
  companyId?: string;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const memberships = user?.fleetMemberships ?? EMPTY_MEMBERSHIPS;
  const companies = useMemo(() => companiesFromMemberships(memberships), [memberships]);
  const allowedIds = useMemo(() => new Set(companies.map((c) => c.id)), [companies]);

  const [activeId, setActiveId] = useState<string | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (companyId) return companyId;
    return stored;
  });

  useEffect(() => {
    if (!user) return;
    if (companyId && allowedIds.has(companyId)) {
      setActiveId(companyId);
      localStorage.setItem(STORAGE_KEY, companyId);
      return;
    }
    setActiveId((current) => {
      if (current && allowedIds.has(current)) return current;
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && allowedIds.has(stored)) return stored;
      const next = companies[0]?.id ?? null;
      if (next) localStorage.setItem(STORAGE_KEY, next);
      else localStorage.removeItem(STORAGE_KEY);
      return next;
    });
  }, [user, companyId, allowedIds, companies]);

  const setCompanyId = useCallback((id: string) => {
    setActiveId(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const company = useMemo(
    () => companies.find((c) => c.id === activeId) ?? null,
    [companies, activeId],
  );

  const value = useMemo(
    () => ({
      companies,
      company,
      companyId: company ? activeId : null,
      setCompanyId,
      loading: false,
      memberships,
    }),
    [companies, company, activeId, setCompanyId, memberships],
  );

  return <FleetCompanyContext.Provider value={value}>{children}</FleetCompanyContext.Provider>;
}

export function useFleetCompany() {
  const ctx = useContext(FleetCompanyContext);
  if (!ctx) throw new Error('useFleetCompany must be used within FleetCompanyProvider');
  return ctx;
}
