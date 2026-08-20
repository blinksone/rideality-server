import { apiClient } from '@/api/client';
import type { ApiPaginated, AuditLogParams, GlobalAuditLogEntry } from '@/api/types';

export async function listAuditLogs(
  params: AuditLogParams,
): Promise<ApiPaginated<GlobalAuditLogEntry>> {
  const { data } = await apiClient.get<ApiPaginated<GlobalAuditLogEntry>>('/admin/audit-logs', {
    params,
  });
  return data;
}
