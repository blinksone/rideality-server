import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listAdminFleets } from '@/api/fleet.api';
import type { FleetCompany } from '@/api/types';

const STORAGE_KEY = 'rideality_active_fleet_id';

interface FleetCompanyContextValue {
  companies: FleetCompany[];
  company: FleetCompany | null;
  companyId: string | null;
  setCompanyId: (id: string) => void;
  loading: boolean;
}

const FleetCompanyContext = createContext<FleetCompanyContextValue | null>(null);

export function FleetCompanyProvider({
  companyId,
  children,
}: {
  companyId?: string;
  children: React.ReactNode;
}) {
  const [activeId, setActiveId] = useState<string | null>(companyId ?? localStorage.getItem(STORAGE_KEY));

  const { data, isLoading } = useQuery({
    queryKey: ['fleet-portal-companies'],
    queryFn: () => listAdminFleets({ page: 1, limit: 50 }),
  });

  const companies = data?.data ?? [];

  useEffect(() => {
    if (companyId) {
      setActiveId(companyId);
      localStorage.setItem(STORAGE_KEY, companyId);
    }
  }, [companyId]);

  useEffect(() => {
    if (!activeId && companies.length === 1) {
      setActiveId(companies[0].id);
      localStorage.setItem(STORAGE_KEY, companies[0].id);
    }
  }, [activeId, companies]);

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
      companyId: activeId,
      setCompanyId,
      loading: isLoading,
    }),
    [companies, company, activeId, setCompanyId, isLoading],
  );

  return <FleetCompanyContext.Provider value={value}>{children}</FleetCompanyContext.Provider>;
}

export function useFleetCompany() {
  const ctx = useContext(FleetCompanyContext);
  if (!ctx) throw new Error('useFleetCompany must be used within FleetCompanyProvider');
  return ctx;
}
