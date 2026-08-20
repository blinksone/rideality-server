import axios from 'axios';
import {
  clearTestSession,
  getTestAccessToken,
  getTestRefreshToken,
  setTestSession,
  type TestSessionUser,
} from './session';

const API_URL = import.meta.env.VITE_API_URL || 'http://65.21.177.122:3000/api/v1';

export const testApi = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

testApi.interceptors.request.use((config) => {
  const token = getTestAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

testApi.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || !original || original._retry) {
      return Promise.reject(error);
    }
    const refresh = getTestRefreshToken();
    if (!refresh) {
      clearTestSession();
      return Promise.reject(error);
    }
    original._retry = true;
    try {
      const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken: refresh });
      const accessToken = data.data.accessToken as string;
      const userRaw = sessionStorage.getItem('rideality_test_user');
      const user = userRaw ? (JSON.parse(userRaw) as TestSessionUser) : null;
      if (user) setTestSession(accessToken, refresh, user);
      original.headers.Authorization = `Bearer ${accessToken}`;
      return testApi(original);
    } catch (e) {
      clearTestSession();
      return Promise.reject(e);
    }
  },
);

export function testApiError(error: unknown, fallback = 'Request failed'): string {
  if (axios.isAxiosError(error)) {
    return (error.response?.data as { error?: { message?: string } })?.error?.message ?? error.message ?? fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

export async function listAuthRegions() {
  const { data } = await testApi.get<{ success: true; data: Array<{
    id: string; code: string; name: string; currency: string; phonePrefix: string;
  }> }>('/auth/regions');
  return data.data;
}

export async function sendOtp(phone: string, regionCode: string) {
  const { data } = await testApi.post<{
    success: true;
    data: {
      phone: string;
      regionCode: string;
      message: string;
      devBypassCode?: string;
      otpCode?: string;
    };
  }>('/auth/otp/send', { phone, regionCode });
  return data.data;
}

export async function verifyOtp(phone: string, code: string, regionCode: string) {
  const { data } = await testApi.post<{
    success: true;
    data: {
      accessToken: string;
      refreshToken: string;
      isNewUser: boolean;
      user: TestSessionUser & { onboarding?: unknown };
    };
  }>('/auth/otp/verify', { phone, code, regionCode });
  return data.data;
}

export async function getMe() {
  const { data } = await testApi.get('/users/me');
  return data.data;
}

export async function updateProfile(body: Record<string, unknown>) {
  const { data } = await testApi.patch('/users/me', body);
  return data.data;
}

export async function setMode(activeMode: 'passenger' | 'driver') {
  const { data } = await testApi.patch('/users/me/mode', { activeMode });
  return data.data;
}

export async function getPassenger() {
  const { data } = await testApi.get('/users/me/passenger');
  return data.data;
}

export async function getPassengerStats() {
  const { data } = await testApi.get('/users/me/passenger/stats');
  return data.data;
}

export async function getWallet() {
  const { data } = await testApi.get('/users/me/wallet');
  return data.data;
}

export async function getWalletTransactions(page = 1, limit = 20) {
  const { data } = await testApi.get('/users/me/wallet/transactions', { params: { page, limit } });
  return data.data;
}

export async function getMyRides(params?: { status?: string; page?: number }) {
  const { data } = await testApi.get('/users/me/rides', { params: { page: 1, limit: 20, ...params } });
  return data;
}

export async function getRideDetail(id: string) {
  const { data } = await testApi.get(`/users/me/rides/${id}`);
  return data.data;
}

export async function submitRating(rideId: string, body: { score: number; tags?: string[]; comment?: string }) {
  const { data } = await testApi.post(`/users/me/rides/${rideId}/rating`, body);
  return data.data;
}

export async function getRatingTags() {
  const { data } = await testApi.get('/users/me/ratings/tags');
  return data.data;
}

export async function saveLocations(locations: Array<{
  label: 'home' | 'work' | 'university' | 'custom';
  address: string;
  latitude: number;
  longitude: number;
  isDefault?: boolean;
}>) {
  const { data } = await testApi.post('/users/me/locations', { locations });
  return data.data;
}

export async function getDriver() {
  const { data } = await testApi.get('/users/me/driver');
  return data.data;
}

export async function upsertVehicle(body: {
  vehicleType: string;
  model: string;
  numberPlate: string;
  availableSeats?: number;
  color?: string;
  cargoCapacityKg?: number;
}) {
  const { data } = await testApi.post('/users/me/driver/vehicle', body);
  return data.data;
}

export async function setAvailability(isOnline: boolean, modes?: Array<'rides' | 'cargo'>) {
  const { data } = await testApi.patch('/users/me/driver/availability', {
    isOnline,
    ...(modes?.length ? { modes } : {}),
  });
  return data.data;
}

export async function setServiceModes(modes: Array<'rides' | 'cargo'>) {
  const { data } = await testApi.patch('/drivers/me/service-modes', { modes });
  return data.data;
}

export async function registerFcmToken(body: {
  fcmToken: string;
  platform?: string;
  deviceName?: string;
}) {
  const { data } = await testApi.post('/me/fcm-token', body);
  return data.data;
}

export async function createTrip(body: Record<string, unknown>) {
  const { data } = await testApi.post('/trips', body);
  return data.data;
}

export async function submitPickupProof(id: string, body: { photoUrl?: string; otp?: string }) {
  const { data } = await testApi.post(`/bookings/${id}/proof/pickup`, body);
  return data.data;
}

export async function submitDropoffProof(id: string, body: { photoUrl?: string; otp?: string }) {
  const { data } = await testApi.post(`/bookings/${id}/proof/dropoff`, body);
  return data.data;
}

export async function getOnboarding() {
  const { data } = await testApi.get('/users/me/onboarding');
  return data.data;
}

export async function getTrustScore() {
  const { data } = await testApi.get('/users/me/trust-score');
  return data.data;
}

export async function registerDocument(type: string, fileUrl: string) {
  const { data } = await testApi.post('/users/me/documents', { type, fileUrl });
  return data.data;
}

export async function listDocuments() {
  const { data } = await testApi.get('/users/me/documents');
  return data.data;
}

export async function listMyFleetInvites() {
  const { data } = await testApi.get('/fleet/me/invites');
  return data.data as Array<{
    id: string;
    token: string;
    kind: 'driver' | 'team';
    memberRole: string | null;
    expiresAt: string;
    createdAt: string;
    status: 'pending';
    fleetCompany: { id: string; legalName: string; status: string; regionId: string };
  }>;
}

export async function acceptFleetInvite(token: string) {
  const { data } = await testApi.post(`/fleet/invites/${token}/accept`);
  return data.data;
}

export async function rejectFleetInvite(token: string) {
  const { data } = await testApi.post(`/fleet/invites/${token}/reject`);
  return data.data;
}
