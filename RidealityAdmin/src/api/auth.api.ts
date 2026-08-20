import { apiClient } from '@/api/client';
import type {
  ApiSuccess,
  LoginRequest,
  LoginResponse,
  PortalUser,
  DashboardStats,
} from '@/api/types';

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  const { data } = await apiClient.post<ApiSuccess<LoginResponse>>('/auth/admin/login', payload);
  return data.data;
}

export async function logout(refreshToken?: string): Promise<void> {
  await apiClient.post('/auth/logout', { refreshToken });
}

export async function changePassword(payload: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  await apiClient.post('/auth/admin/change-password', payload);
}

export async function fetchMe(): Promise<PortalUser> {
  const { data } = await apiClient.get<ApiSuccess<PortalUser>>('/admin/me');
  return data.data;
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const { data } = await apiClient.get<ApiSuccess<DashboardStats>>('/admin/dashboard/stats');
  return data.data;
}
