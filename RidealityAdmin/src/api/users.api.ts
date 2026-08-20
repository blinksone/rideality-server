import { apiClient } from '@/api/client';
import type {
  ApiPaginated,
  ApiSuccess,
  AuditLogEntry,
  CreateUserPayload,
  PaginationParams,
  ResetUserPasswordResult,
  UserAccess,
  UserDetail,
  UserListItem,
  UserListParams,
  UserStatus,
} from '@/api/types';

export type PlatformStaffType =
  | 'SUB_ADMIN'
  | 'GLOBAL_ADMIN'
  | 'CONTINENT_ADMIN'
  | 'COUNTRY_ADMIN'
  | 'REGIONAL_ADMIN'
  | 'CITY_ADMIN'
  | 'FLEET_OWNER'
  | 'REGIONAL_FLEET'
  | 'FLEET_FINANCE'
  | 'FLEET_SUPPORT'
  | 'FINANCE_USER'
  | 'PLATFORM_SUPPORT';

export interface PlatformStaffUser {
  id: string;
  phone: string;
  email: string | null;
  status: string;
  fullName?: string | null;
  roles: string[];
  staffType: PlatformStaffType;
  scopeLabel?: string | null;
  fleets: Array<{ id: string; legalName: string; status: string }>;
  createdAt: string;
}

export interface CreatePlatformStaffPayload {
  type: PlatformStaffType;
  phone: string;
  email: string;
  fullName: string;
  regionId: string;
  continentId?: string;
  regionalId?: string;
  cityId?: string;
  legalName?: string;
  taxId?: string;
}

export interface FleetOwnerCompanyDetail {
  id: string;
  legalName: string;
  taxId: string | null;
  status: string;
  regionId: string;
  ownerUserId: string;
  createdAt: string;
  region?: { id: string; code: string; name: string } | null;
  owner?: { profile?: { fullName?: string | null } | null; email?: string | null };
  regions: Array<{
    id: string;
    name: string;
    fleetCompanyId: string;
    createdAt: string;
    supportCount: number;
    driverCount: number;
  }>;
  driverCount: number;
  supportCount: number;
}

export async function listPlatformStaff(params: {
  page?: number;
  limit?: number;
  type?: string;
  search?: string;
}): Promise<ApiPaginated<PlatformStaffUser>> {
  const { data } = await apiClient.get<ApiPaginated<PlatformStaffUser>>('/admin/portal/users', {
    params,
  });
  return data;
}

export interface UpdatePlatformStaffPayload {
  phone: string;
  email: string;
  fullName: string;
  regionId: string;
  continentId?: string;
  regionalId?: string;
  cityId?: string;
}

export async function createPlatformStaff(
  payload: CreatePlatformStaffPayload,
): Promise<UserDetail & { fleetCompany?: { id: string; legalName: string } }> {
  const { data } = await apiClient.post<
    ApiSuccess<UserDetail & { fleetCompany?: { id: string; legalName: string } }>
  >('/admin/portal/users', payload);
  return data.data;
}

export async function updatePlatformStaff(
  userId: string,
  payload: UpdatePlatformStaffPayload,
): Promise<UserDetail> {
  const { data } = await apiClient.patch<ApiSuccess<UserDetail>>(`/admin/portal/users/${userId}`, payload);
  return data.data;
}

export async function getFleetOwnerCompany(companyId: string): Promise<FleetOwnerCompanyDetail> {
  const { data } = await apiClient.get<ApiSuccess<FleetOwnerCompanyDetail>>(
    `/admin/portal/fleet-owners/${companyId}`,
  );
  return data.data;
}

export async function createUser(payload: CreateUserPayload): Promise<UserDetail> {
  const { data } = await apiClient.post<ApiSuccess<UserDetail>>('/admin/users', payload);
  return data.data;
}

export async function listUsers(params: UserListParams): Promise<ApiPaginated<UserListItem>> {
  const { data } = await apiClient.get<ApiPaginated<UserListItem>>('/admin/users', { params });
  return data;
}

export async function getUser(id: string): Promise<UserDetail> {
  const { data } = await apiClient.get<ApiSuccess<UserDetail>>(`/admin/users/${id}`);
  return data.data;
}

export async function resetUserPassword(userId: string): Promise<ResetUserPasswordResult> {
  const { data } = await apiClient.post<ApiSuccess<ResetUserPasswordResult>>(
    `/admin/users/${userId}/reset-password`,
  );
  return data.data;
}

export async function updateUserStatus(
  id: string,
  status: UserStatus,
  reason: string,
): Promise<unknown> {
  const { data } = await apiClient.patch<ApiSuccess<unknown>>(`/admin/users/${id}/status`, {
    status,
    reason,
  });
  return data.data;
}

export async function reviewDriver(
  id: string,
  action: 'approve' | 'reject',
  reason?: string,
): Promise<unknown> {
  const { data } = await apiClient.patch<ApiSuccess<unknown>>(`/admin/users/${id}/driver/review`, {
    action,
    reason,
  });
  return data.data;
}

export async function reviewDocument(
  userId: string,
  docId: string,
  action: 'approve' | 'reject',
  rejectionReason?: string,
): Promise<unknown> {
  const { data } = await apiClient.patch<ApiSuccess<unknown>>(
    `/admin/users/${userId}/documents/${docId}`,
    { action, rejectionReason },
  );
  return data.data;
}

export async function addNote(userId: string, content: string): Promise<unknown> {
  const { data } = await apiClient.post<ApiSuccess<unknown>>(`/admin/users/${userId}/notes`, {
    content,
  });
  return data.data;
}

export async function applyPenalty(
  userId: string,
  amount: number,
  reason: string,
): Promise<unknown> {
  const { data } = await apiClient.post<ApiSuccess<unknown>>(`/admin/users/${userId}/penalties`, {
    amount,
    reason,
  });
  return data.data;
}

export async function getAuditLog(
  userId: string,
  params: PaginationParams,
): Promise<ApiPaginated<AuditLogEntry>> {
  const { data } = await apiClient.get<ApiPaginated<AuditLogEntry>>(
    `/admin/users/${userId}/audit-log`,
    { params },
  );
  return data;
}

export async function getUserAccess(userId: string): Promise<UserAccess> {
  const { data } = await apiClient.get<ApiSuccess<UserAccess>>(`/admin/users/${userId}/access`);
  return data.data;
}

export async function setUserRoles(userId: string, roleIds: string[]): Promise<UserAccess> {
  const { data } = await apiClient.put<ApiSuccess<UserAccess>>(`/admin/users/${userId}/roles`, {
    roleIds,
  });
  return data.data;
}

export async function setUserPermissions(userId: string, permissionIds: string[]): Promise<UserAccess> {
  const { data } = await apiClient.put<ApiSuccess<UserAccess>>(`/admin/users/${userId}/permissions`, {
    permissionIds,
  });
  return data.data;
}

export async function assignUserRole(userId: string, roleId: string): Promise<UserAccess> {
  const { data } = await apiClient.post<ApiSuccess<UserAccess>>(`/admin/users/${userId}/roles`, {
    roleId,
  });
  return data.data;
}

export async function removeUserRole(userId: string, roleId: string): Promise<unknown> {
  const { data } = await apiClient.delete<ApiSuccess<unknown>>(
    `/admin/users/${userId}/roles/${roleId}`,
  );
  return data.data;
}

export async function assignPlatformRole(
  userId: string,
  platformRole: string,
): Promise<UserAccess> {
  const { data } = await apiClient.post<ApiSuccess<UserAccess>>(
    `/admin/users/${userId}/platform-roles`,
    { platformRole },
  );
  return data.data;
}

export async function revokePlatformRole(
  userId: string,
  platformRole: string,
): Promise<UserAccess> {
  const { data } = await apiClient.delete<ApiSuccess<UserAccess>>(
    `/admin/users/${userId}/platform-roles/${platformRole}`,
  );
  return data.data;
}

export async function listRegionalFleets(fleetOwnerUserId: string) {
  const { data } = await apiClient.get<
    ApiSuccess<{
      parent: { userId: string; role: string; countryId: string | null };
      regionalFleets: Array<{
        userId: string;
        fullName: string | null;
        email: string | null;
        phone: string;
        city: { id: string; name: string } | null;
      }>;
    }>
  >(`/admin/fleet-owners/${fleetOwnerUserId}/regional-fleets`);
  return data.data;
}

export async function listFleetSupportStaff(regionalFleetUserId: string) {
  const { data } = await apiClient.get<
    ApiSuccess<{
      parent: { userId: string; role: string; cityId: string | null };
      support: Array<{
        userId: string;
        fullName: string | null;
        email: string | null;
        phone: string;
      }>;
    }>
  >(`/admin/regional-fleets/${regionalFleetUserId}/support`);
  return data.data;
}
