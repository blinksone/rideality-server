import { apiClient } from '@/api/client';
import type {
  ApiPaginated,
  ApiSuccess,
  CreateRegionPayload,
  PaginationParams,
  Region,
  UpdateRegionPayload,
} from '@/api/types';

export async function listActiveRegions(): Promise<Region[]> {
  const { data } = await apiClient.get<ApiSuccess<Region[]>>('/admin/regions/active');
  return data.data;
}

export async function listRegions(
  params: PaginationParams & { search?: string; activeOnly?: boolean },
): Promise<ApiPaginated<Region>> {
  const { data } = await apiClient.get<ApiPaginated<Region>>('/admin/regions', { params });
  return data;
}

export async function createRegion(payload: CreateRegionPayload): Promise<Region> {
  const { data } = await apiClient.post<ApiSuccess<Region>>('/admin/regions', payload);
  return data.data;
}

export async function updateRegion(id: string, payload: UpdateRegionPayload): Promise<Region> {
  const { data } = await apiClient.patch<ApiSuccess<Region>>(`/admin/regions/${id}`, payload);
  return data.data;
}
