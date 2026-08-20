import { apiClient } from '@/api/client';
import type {
  ApiPaginated,
  ApiSuccess,
  CreatePermissionPayload,
  PaginationParams,
  PermissionItem,
  UpdatePermissionPayload,
} from '@/api/types';

export async function getPermissionCatalog(): Promise<PermissionItem[]> {
  const { data } = await apiClient.get<ApiSuccess<PermissionItem[]>>('/admin/permissions/catalog');
  return data.data;
}

export async function listPermissions(
  params: PaginationParams & { search?: string },
): Promise<ApiPaginated<PermissionItem>> {
  const { data } = await apiClient.get<ApiPaginated<PermissionItem>>('/admin/permissions', {
    params,
  });
  return data;
}

export async function getPermission(id: string): Promise<PermissionItem> {
  const { data } = await apiClient.get<ApiSuccess<PermissionItem>>(`/admin/permissions/${id}`);
  return data.data;
}

export async function createPermission(payload: CreatePermissionPayload): Promise<PermissionItem> {
  const { data } = await apiClient.post<ApiSuccess<PermissionItem>>('/admin/permissions', payload);
  return data.data;
}

export async function updatePermission(
  id: string,
  payload: UpdatePermissionPayload,
): Promise<PermissionItem> {
  const { data } = await apiClient.patch<ApiSuccess<PermissionItem>>(
    `/admin/permissions/${id}`,
    payload,
  );
  return data.data;
}

export async function deletePermission(id: string): Promise<unknown> {
  const { data } = await apiClient.delete<ApiSuccess<unknown>>(`/admin/permissions/${id}`);
  return data.data;
}
