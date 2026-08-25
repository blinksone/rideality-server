import { apiClient } from '@/api/client';
import type { AdminPlace, AdminPlacePayload, ApiPaginated, ApiSuccess, PaginationParams } from '@/api/types';

export async function listAdminPlaces(
  params: PaginationParams & { city?: string; search?: string },
): Promise<ApiPaginated<AdminPlace>> {
  const { data } = await apiClient.get<ApiPaginated<AdminPlace>>('/admin/places', { params });
  return data;
}

export async function createAdminPlace(payload: AdminPlacePayload): Promise<AdminPlace> {
  const { data } = await apiClient.post<ApiSuccess<AdminPlace>>('/admin/places', payload);
  return data.data;
}

export async function updateAdminPlace(
  id: string,
  payload: Partial<AdminPlacePayload> & { isActive?: boolean; formattedAddress?: string },
): Promise<AdminPlace> {
  const { data } = await apiClient.patch<ApiSuccess<AdminPlace>>(`/admin/places/${id}`, payload);
  return data.data;
}
