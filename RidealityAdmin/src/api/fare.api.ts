import { apiClient } from '@/api/client';
import type { ApiSuccess, FareConfig, FareConfigPayload, FareProduct, ServiceProduct } from '@/api/types';

export async function listServiceProducts(): Promise<ServiceProduct[]> {
  const { data } = await apiClient.get<ApiSuccess<ServiceProduct[]>>('/admin/fares/products');
  return data.data;
}

export async function listFareConfigs(params?: {
  countryId?: string;
  cityId?: string;
  product?: FareProduct;
  serviceProductCode?: string;
}): Promise<FareConfig[]> {
  const { data } = await apiClient.get<ApiSuccess<FareConfig[]>>('/admin/fares', { params });
  return data.data;
}

export async function createFareConfig(payload: FareConfigPayload): Promise<FareConfig> {
  const { data } = await apiClient.post<ApiSuccess<FareConfig>>('/admin/fares', payload);
  return data.data;
}

export async function updateFareConfig(
  id: string,
  payload: Omit<FareConfigPayload, 'countryId' | 'cityId' | 'product'>,
): Promise<FareConfig> {
  const { data } = await apiClient.patch<ApiSuccess<FareConfig>>(`/admin/fares/${id}`, payload);
  return data.data;
}

export async function deleteFareConfig(id: string): Promise<{ id: string }> {
  const { data } = await apiClient.delete<ApiSuccess<{ id: string }>>(`/admin/fares/${id}`);
  return data.data;
}
