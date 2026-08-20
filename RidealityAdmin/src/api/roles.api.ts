import { apiClient } from '@/api/client';
import type {
  ApiPaginated,
  ApiSuccess,
  CreateRolePayload,
  PaginationParams,
  Role,
  UpdateRolePayload,
} from '@/api/types';

export async function listRoles(
  params: PaginationParams & { search?: string },
): Promise<ApiPaginated<Role>> {
  const { data } = await apiClient.get<ApiPaginated<Role>>('/admin/roles', { params });
  return data;
}

export async function getRole(id: string): Promise<Role> {
  const { data } = await apiClient.get<ApiSuccess<Role>>(`/admin/roles/${id}`);
  return data.data;
}

export async function createRole(payload: CreateRolePayload): Promise<Role> {
  const { data } = await apiClient.post<ApiSuccess<Role>>('/admin/roles', payload);
  return data.data;
}

export async function updateRole(id: string, payload: UpdateRolePayload): Promise<Role> {
  const { data } = await apiClient.patch<ApiSuccess<Role>>(`/admin/roles/${id}`, payload);
  return data.data;
}

export async function deleteRole(id: string): Promise<unknown> {
  const { data } = await apiClient.delete<ApiSuccess<unknown>>(`/admin/roles/${id}`);
  return data.data;
}
