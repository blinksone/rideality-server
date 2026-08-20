import { apiClient } from '@/api/client';
import type {
  ApiPaginated,
  ApiSuccess,
  Continent,
  CreateRegionPayload,
  GeoCity,
  PaginationParams,
  Province,
  Region,
  UpdateRegionPayload,
} from '@/api/types';

export async function listContinents(): Promise<Continent[]> {
  const { data } = await apiClient.get<ApiSuccess<Continent[]>>('/admin/regions/continents');
  return data.data;
}

export async function listProvinces(countryId: string): Promise<Province[]> {
  const { data } = await apiClient.get<ApiSuccess<Province[]>>('/admin/regions/provinces', {
    params: { countryId },
  });
  return data.data;
}

export async function listCities(params: {
  countryId?: string;
  provinceId?: string;
}): Promise<GeoCity[]> {
  const { data } = await apiClient.get<ApiSuccess<GeoCity[]>>('/admin/regions/cities', { params });
  return data.data;
}

export async function createCity(payload: {
  name: string;
  provinceId: string;
}): Promise<GeoCity> {
  const { data } = await apiClient.post<ApiSuccess<GeoCity>>('/admin/regions/cities', payload);
  return data.data;
}

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
