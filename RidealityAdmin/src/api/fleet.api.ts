import { apiClient } from '@/api/client';
import type {
  AdminCreateFleetPayload,
  AdminUpdateFleetPayload,
  ApiPaginated,
  ApiSuccess,
  CreateFleetPayload,
  FleetCompany,
  FleetDriver,
  FleetInvite,
  FleetInviteCandidate,
  PaginationParams,
  WalletDetail,
  WalletTransaction,
} from '@/api/types';
import { addStoredFleetId, getStoredFleetIds, getAccessToken } from '@/utils/storage';

export async function listAdminFleets(
  params: PaginationParams & {
    search?: string;
    status?: string;
    regionId?: string;
  },
): Promise<ApiPaginated<FleetCompany>> {
  const { data } = await apiClient.get<ApiPaginated<FleetCompany>>('/admin/fleets', { params });
  return data;
}

export async function adminUpdateFleet(
  id: string,
  payload: AdminUpdateFleetPayload,
): Promise<FleetCompany> {
  const { data } = await apiClient.patch<ApiSuccess<FleetCompany>>(`/admin/fleets/${id}`, payload);
  return data.data;
}

export async function adminCreateFleet(payload: AdminCreateFleetPayload): Promise<FleetCompany> {
  const { data } = await apiClient.post<ApiSuccess<FleetCompany>>('/admin/fleets', payload);
  addStoredFleetId(data.data.id);
  return data.data;
}

export async function createFleetCompany(payload: CreateFleetPayload): Promise<FleetCompany> {
  const { data } = await apiClient.post<ApiSuccess<FleetCompany>>('/fleet/companies', payload);
  addStoredFleetId(data.data.id);
  return data.data;
}

export async function getFleetCompany(id: string): Promise<FleetCompany> {
  const { data } = await apiClient.get<ApiSuccess<FleetCompany>>(`/fleet/companies/${id}`);
  addStoredFleetId(data.data.id);
  return data.data;
}

export async function updateFleetCompany(
  id: string,
  payload: { legalName?: string; taxId?: string },
): Promise<FleetCompany> {
  const { data } = await apiClient.patch<ApiSuccess<FleetCompany>>(`/fleet/companies/${id}`, payload);
  return data.data;
}

export async function searchFleetInviteCandidates(
  companyId: string,
  search: string,
): Promise<FleetInviteCandidate[]> {
  const { data } = await apiClient.get<ApiSuccess<FleetInviteCandidate[]>>(
    `/fleet/companies/${companyId}/invite-candidates`,
    { params: { search } },
  );
  return data.data;
}

export async function createFleetInvite(
  companyId: string,
  payload: { phone?: string; email?: string; userId?: string },
): Promise<FleetInvite> {
  const { data } = await apiClient.post<ApiSuccess<FleetInvite>>(
    `/fleet/companies/${companyId}/invites`,
    payload,
  );
  return data.data;
}

export async function listFleetDrivers(
  companyId: string,
  params?: { regionId?: string },
): Promise<FleetDriver[]> {
  const { data } = await apiClient.get<ApiSuccess<FleetDriver[]>>(
    `/fleet/companies/${companyId}/drivers`,
    { params },
  );
  return data.data;
}

export interface FleetDriverDetail {
  userId: string;
  fullName: string | null;
  phone: string;
  email: string | null;
  photoUrl: string | null;
  onboardingStatus: string;
  driverType: string;
  isOnline: boolean;
  serviceModes: string[];
  totalRides: number;
  totalDistanceKm: number;
  activeHours: number;
  licenseNumber: string | null;
  licenseExpiry: string | null;
  fleetRegionId: string | null;
  fleetRegionName: string | null;
  joinedAt: string;
  wallet: { id: string; balance: number; currency: string; status: string } | null;
  walletTransactions: Array<{
    id: string;
    type: string;
    amount: number;
    currency: string;
    description: string | null;
    balanceAfter: number;
    createdAt: string;
  }>;
  vehicles: Array<{
    id: string;
    vehicleType: string;
    model: string;
    numberPlate: string;
    color: string | null;
    year: number | null;
    availableSeats: number;
    operationalStatus: string;
    isVerified: boolean;
  }>;
  documents: Array<{
    id: string;
    type: string;
    status: string;
    fileUrl: string;
    rejectionReason: string | null;
    submittedAt: string;
    reviewedAt: string | null;
    expiresAt: string | null;
  }>;
  trips: Array<{
    id: string;
    status: string;
    passengerName: string | null;
    pickupAddress: string;
    dropoffAddress: string;
    fare: number;
    distanceKm: number;
    currency: string;
    vehiclePlate: string | null;
    createdAt: string;
    completedAt: string | null;
  }>;
  tripCount: number;
  complaints: Array<{
    id: string;
    reason: string;
    description: string | null;
    status: string;
    rideId: string | null;
    reporterName: string;
    createdAt: string;
  }>;
}

export async function getFleetDriverDetail(
  companyId: string,
  userId: string,
): Promise<FleetDriverDetail> {
  const { data } = await apiClient.get<ApiSuccess<FleetDriverDetail>>(
    `/fleet/companies/${companyId}/drivers/${userId}`,
  );
  return data.data;
}

export async function updateFleetDriver(
  companyId: string,
  userId: string,
  payload: { onboardingStatus?: string },
): Promise<FleetDriver> {
  const { data } = await apiClient.patch<ApiSuccess<FleetDriver>>(
    `/fleet/companies/${companyId}/drivers/${userId}`,
    payload,
  );
  return data.data;
}

export async function removeFleetDriver(companyId: string, userId: string): Promise<unknown> {
  const { data } = await apiClient.delete<ApiSuccess<unknown>>(
    `/fleet/companies/${companyId}/drivers/${userId}`,
  );
  return data.data;
}

/** Backend has no list endpoint; hydrate from locally tracked company IDs. */
export async function listKnownFleetCompanies(): Promise<FleetCompany[]> {
  const ids = getStoredFleetIds();
  const results = await Promise.allSettled(ids.map((id) => getFleetCompany(id)));
  return results
    .filter((r): r is PromiseFulfilledResult<FleetCompany> => r.status === 'fulfilled')
    .map((r) => r.value);
}

export function trackFleetCompanyId(id: string): void {
  addStoredFleetId(id);
}

export async function getFleetWallet(fleetId: string): Promise<WalletDetail> {
  const { data } = await apiClient.get<ApiSuccess<WalletDetail>>(`/fleet/companies/${fleetId}/wallet`);
  return data.data;
}

export async function listFleetWalletTransactions(
  fleetId: string,
  params: PaginationParams,
): Promise<ApiPaginated<WalletTransaction>> {
  const { data } = await apiClient.get<ApiPaginated<WalletTransaction>>(
    `/fleet/companies/${fleetId}/wallet/transactions`,
    { params },
  );
  return data;
}

export async function createFleetPayoutRequest(
  fleetId: string,
  payload: {
    amount: number;
    bankName?: string;
    accountNumber?: string;
    accountTitle?: string;
  },
): Promise<unknown> {
  const { data } = await apiClient.post<ApiSuccess<unknown>>(`/fleet/companies/${fleetId}/payouts`, payload);
  return data.data;
}

export interface FleetDashboard {
  currency: string;
  walletBalance: number;
  availableBalance: number;
  pendingEarnings: number;
  lifetimeEarnings: number;
  todayRevenue: number;
  activeDrivers: number;
  onlineDrivers: number;
  activeVehicles: number;
  assignedVehicles: number;
  totalVehicles: number;
  totalDrivers: number;
  tripsToday: number;
  pendingApprovals: number;
  pendingInvites: number;
  revenueChart: Array<{ date: string; revenue: number; trips: number }>;
  recentActivities: Array<{
    id: string;
    type: string;
    amount: number;
    currency: string;
    description: string | null;
    createdAt: string;
    actorName: string | null;
  }>;
  onlineDriverLocations: Array<{
    userId: string;
    fullName: string | null;
    lat: number | null;
    lng: number | null;
  }>;
}

export interface FleetInviteListItem {
  id: string;
  phone: string | null;
  email: string | null;
  invitedUserId: string | null;
  invitedUserName: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  status: 'pending' | 'accepted' | 'expired';
}

export interface FleetTeamMember {
  id: string;
  userId: string;
  role: string;
  rawRole?: string;
  fleetRegionId?: string | null;
  fleetRegionName?: string | null;
  fullName: string | null;
  email: string | null;
  phone: string;
  joinedAt: string;
}

export interface FleetRegionRow {
  id: string;
  name: string;
  fleetCompanyId: string;
  createdAt: string;
  supportCount?: number;
  driverCount: number;
}

export async function getFleetDashboard(companyId: string): Promise<FleetDashboard> {
  const { data } = await apiClient.get<ApiSuccess<FleetDashboard>>(
    `/fleet/companies/${companyId}/dashboard`,
  );
  return data.data;
}

export async function listFleetInvites(companyId: string): Promise<FleetInviteListItem[]> {
  const { data } = await apiClient.get<ApiSuccess<{ invites: FleetInviteListItem[] }>>(
    `/fleet/companies/${companyId}/invites`,
  );
  return data.data.invites;
}

export async function listFleetTeam(companyId: string): Promise<FleetTeamMember[]> {
  const { data } = await apiClient.get<ApiSuccess<{ members: FleetTeamMember[] }>>(
    `/fleet/companies/${companyId}/team`,
  );
  return data.data.members;
}

export async function listFleetPayouts(
  companyId: string,
  params: PaginationParams,
): Promise<ApiPaginated<import('@/api/types').FinancePayout>> {
  const { data } = await apiClient.get<ApiPaginated<import('@/api/types').FinancePayout>>(
    `/fleet/companies/${companyId}/payouts`,
    { params },
  );
  return data;
}

export interface FleetVehicle {
  id: string;
  vehicleType: string;
  model: string;
  numberPlate: string;
  color: string | null;
  year: number | null;
  availableSeats: number;
  isVerified: boolean;
  operationalStatus: string;
  driverUserId: string | null;
  driverName: string | null;
  updatedAt: string;
}

export interface FleetTrip {
  id: string;
  status: string;
  passengerName: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  fare: number;
  distanceKm: number;
  currency: string;
  driverUserId: string;
  driverName: string | null;
  vehiclePlate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface FleetEarnings {
  currency: string;
  totalTripRevenue: number;
  totalTrips: number;
  totalDistanceKm: number;
  walletEarnings: number;
  byDriver: Array<{
    driverUserId: string;
    driverName: string;
    trips: number;
    revenue: number;
  }>;
}

export interface FleetReports {
  currency: string;
  periodDays: number;
  daily: Array<{ date: string; revenue: number; trips: number }>;
  topDrivers: Array<{
    driverUserId: string;
    driverName: string;
    trips: number;
    revenue: number;
    distanceKm: number;
  }>;
  expiringDocuments: number;
}

export interface FleetNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface FleetDocument {
  id: string;
  userId: string;
  driverName: string | null;
  type: string;
  status: string;
  fileUrl: string;
  expiresAt: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
}

export interface FleetAuditLog {
  id: string;
  action: string;
  details: Record<string, unknown>;
  actorName: string | null;
  createdAt: string;
}

export interface FleetMapData {
  drivers: Array<{
    userId: string;
    fullName: string | null;
    lat: number | null;
    lng: number | null;
    vehiclePlate: string | null;
  }>;
  activeTrips: Array<{
    id: string;
    status: string;
    driverUserId: string;
    driverName: string | null;
    pickupAddress: string;
    dropoffAddress: string;
    pickupLat: number | null;
    pickupLng: number | null;
    dropoffLat: number | null;
    dropoffLng: number | null;
    vehiclePlate: string | null;
  }>;
}

type FleetListParams = PaginationParams & {
  search?: string;
  status?: string;
  from?: string;
  to?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  driverUserId?: string;
  unreadOnly?: boolean;
};

export async function listFleetVehicles(
  companyId: string,
  params: FleetListParams,
): Promise<ApiPaginated<FleetVehicle>> {
  const { data } = await apiClient.get<ApiPaginated<FleetVehicle>>(
    `/fleet/companies/${companyId}/vehicles`,
    { params },
  );
  return data;
}

export async function updateFleetVehicle(
  companyId: string,
  vehicleId: string,
  payload: {
    operationalStatus?: string;
    driverUserId?: string | null;
    vehicleType?: string;
    model?: string;
    numberPlate?: string;
    color?: string | null;
    year?: number | null;
    availableSeats?: number;
    isVerified?: boolean;
  },
): Promise<FleetVehicle> {
  const { data } = await apiClient.patch<ApiSuccess<FleetVehicle>>(
    `/fleet/companies/${companyId}/vehicles/${vehicleId}`,
    payload,
  );
  return data.data;
}

export async function createFleetVehicle(
  companyId: string,
  payload: {
    driverUserId?: string;
    vehicleType: string;
    model: string;
    numberPlate: string;
    color?: string;
    year?: number;
    availableSeats?: number;
  },
): Promise<FleetVehicle> {
  const { data } = await apiClient.post<ApiSuccess<FleetVehicle>>(
    `/fleet/companies/${companyId}/vehicles`,
    payload,
  );
  return data.data;
}

export async function deleteFleetVehicle(
  companyId: string,
  vehicleId: string,
): Promise<{ deleted: boolean; vehicleId: string; numberPlate: string; driverUserId: string }> {
  const { data } = await apiClient.delete<
    ApiSuccess<{ deleted: boolean; vehicleId: string; numberPlate: string; driverUserId: string }>
  >(`/fleet/companies/${companyId}/vehicles/${vehicleId}`);
  return data.data;
}

export async function listFleetTrips(
  companyId: string,
  params: FleetListParams,
): Promise<ApiPaginated<FleetTrip>> {
  const { data } = await apiClient.get<ApiPaginated<FleetTrip>>(
    `/fleet/companies/${companyId}/trips`,
    { params },
  );
  return data;
}

export async function getFleetTrip(companyId: string, tripId: string): Promise<FleetTrip> {
  const { data } = await apiClient.get<ApiSuccess<FleetTrip>>(
    `/fleet/companies/${companyId}/trips/${tripId}`,
  );
  return data.data;
}

export async function getFleetEarnings(
  companyId: string,
  params?: { from?: string; to?: string },
): Promise<FleetEarnings> {
  const { data } = await apiClient.get<ApiSuccess<FleetEarnings>>(
    `/fleet/companies/${companyId}/earnings`,
    { params },
  );
  return data.data;
}

export async function getFleetReports(
  companyId: string,
  params?: { days?: number },
): Promise<FleetReports> {
  const { data } = await apiClient.get<ApiSuccess<FleetReports>>(
    `/fleet/companies/${companyId}/reports`,
    { params },
  );
  return data.data;
}

export async function listFleetNotifications(
  companyId: string,
  params: FleetListParams,
): Promise<ApiSuccess<{ notifications: FleetNotification[]; total: number; unreadCount: number }>> {
  const { data } = await apiClient.get<
    ApiSuccess<{ notifications: FleetNotification[]; total: number; unreadCount: number }>
  >(`/fleet/companies/${companyId}/notifications`, { params });
  return data;
}

export async function markFleetNotificationRead(
  companyId: string,
  notificationId: string,
): Promise<unknown> {
  const { data } = await apiClient.patch<ApiSuccess<unknown>>(
    `/fleet/companies/${companyId}/notifications/${notificationId}/read`,
  );
  return data.data;
}

export async function markAllFleetNotificationsRead(companyId: string): Promise<unknown> {
  const { data } = await apiClient.patch<ApiSuccess<unknown>>(
    `/fleet/companies/${companyId}/notifications/read-all`,
  );
  return data.data;
}

export async function listFleetDocuments(
  companyId: string,
  params?: { status?: string; search?: string; expiringWithinDays?: number },
): Promise<{ documents: FleetDocument[]; total: number }> {
  const { data } = await apiClient.get<ApiSuccess<{ documents: FleetDocument[]; total: number }>>(
    `/fleet/companies/${companyId}/documents`,
    { params },
  );
  return data.data;
}

export async function listFleetAuditLogs(
  companyId: string,
  params: PaginationParams,
): Promise<ApiPaginated<FleetAuditLog>> {
  const { data } = await apiClient.get<ApiPaginated<FleetAuditLog>>(
    `/fleet/companies/${companyId}/audit-logs`,
    { params },
  );
  return data;
}

export async function getFleetMapData(companyId: string): Promise<FleetMapData> {
  const { data } = await apiClient.get<ApiSuccess<FleetMapData>>(
    `/fleet/companies/${companyId}/map`,
  );
  return data.data;
}

export async function listManagedFleetRegions(companyId: string): Promise<FleetRegionRow[]> {
  const { data } = await apiClient.get<ApiSuccess<FleetRegionRow[]>>(
    `/fleet/companies/${companyId}/managed-regions`,
  );
  return data.data;
}

export interface FleetCityProfile {
  city: { id: string; name: string; createdAt: string };
  regionalAdmins: Array<{
    userId: string;
    fullName: string | null;
    phone: string;
    email: string | null;
  }>;
  stats: {
    drivers: number;
    online: number;
    vehicles: number;
    trips: number;
    pendingComplaints: number;
    pendingDocuments: number;
    pendingApprovals: number;
    walletTotal: number;
    currency: string;
  };
  supportNeeded: Array<{
    id: string;
    type: 'complaint' | 'onboarding' | 'document';
    title: string;
    subtitle: string;
    status: string;
    createdAt: string | null;
    driverUserId: string;
    documentId?: string;
  }>;
  drivers: Array<{
    userId: string;
    fullName: string | null;
    phone: string;
    email: string | null;
    onboardingStatus: string;
    isOnline: boolean;
    totalRides: number;
    vehicle: {
      id: string;
      vehicleType: string;
      model: string;
      numberPlate: string;
      color: string | null;
      operationalStatus: string;
      isVerified: boolean;
    } | null;
    wallet: { id: string; balance: number; currency: string; status: string } | null;
  }>;
  vehicles: Array<{
    id: string;
    vehicleType: string;
    model: string;
    numberPlate: string;
    color: string | null;
    operationalStatus: string;
    isVerified: boolean;
    driverUserId: string;
    driverName: string;
  }>;
  trips: Array<{
    id: string;
    status: string;
    passengerName: string | null;
    pickupAddress: string;
    dropoffAddress: string;
    fare: number;
    distanceKm: number;
    currency: string;
    driverUserId: string | null;
    driverName: string | null;
    vehiclePlate: string | null;
    createdAt: string;
    completedAt: string | null;
  }>;
  wallets: Array<{
    driverUserId: string;
    driverName: string;
    wallet: { id: string; balance: number; currency: string; status: string } | null;
  }>;
  complaints: Array<{
    id: string;
    reason: string;
    description: string | null;
    status: string;
    rideId: string | null;
    createdAt: string;
    reporterName: string;
    driverUserId: string;
    driverName: string;
    needsSupport: boolean;
  }>;
  documents: Array<{
    id: string;
    type: string;
    status: string;
    fileUrl?: string | null;
    driverUserId: string;
    driverName: string;
    submittedAt: string;
    expiresAt: string | null;
  }>;
}

export async function getFleetCityProfile(
  companyId: string,
  regionId: string,
): Promise<FleetCityProfile> {
  const { data } = await apiClient.get<ApiSuccess<FleetCityProfile>>(
    `/fleet/companies/${companyId}/regions/${regionId}`,
  );
  return data.data;
}

export async function reviewFleetComplaint(
  companyId: string,
  complaintId: string,
  status: 'in_review' | 'resolved',
): Promise<unknown> {
  const { data } = await apiClient.patch<ApiSuccess<unknown>>(
    `/fleet/companies/${companyId}/complaints/${complaintId}`,
    { status },
  );
  return data.data;
}

export async function createFleetRegion(
  companyId: string,
  payload: { name: string },
): Promise<{ id: string; name: string; fleetCompanyId: string; createdAt: string }> {
  const { data } = await apiClient.post<
    ApiSuccess<{ id: string; name: string; fleetCompanyId: string; createdAt: string }>
  >(`/fleet/companies/${companyId}/regions`, payload);
  return data.data;
}

export async function inviteRegionalFleet(
  companyId: string,
  regionId: string,
  payload: { email: string },
): Promise<{ inviteId: string; token: string; expiresAt: string }> {
  const { data } = await apiClient.post<
    ApiSuccess<{ inviteId: string; token: string; expiresAt: string }>
  >(`/fleet/companies/${companyId}/regions/${regionId}/invites`, payload);
  return data.data;
}

export async function inviteFleetSupport(
  companyId: string,
  payload: { email: string },
): Promise<{ inviteId: string; token: string; expiresAt: string }> {
  const { data } = await apiClient.post<
    ApiSuccess<{ inviteId: string; token: string; expiresAt: string }>
  >(`/fleet/companies/${companyId}/support-invites`, payload);
  return data.data;
}

export async function reviewFleetDocument(
  companyId: string,
  documentId: string,
  payload: { status: 'APPROVED' | 'REJECTED' | 'approved' | 'rejected'; rejectionReason?: string },
): Promise<unknown> {
  const { data } = await apiClient.patch<ApiSuccess<unknown>>(
    `/fleet/companies/${companyId}/documents/${documentId}`,
    payload,
  );
  return data.data;
}

export async function createFleetStaffUser(
  companyId: string,
  payload: {
    role: 'REGIONAL' | 'SUPPORT' | 'regional' | 'support';
    fleetRegionId?: string;
    fullName: string;
    email: string;
    phone: string;
  },
): Promise<{
  id: string;
  email: string | null;
  phone: string;
  fullName: string;
  role: string;
  fleetRegionId: string | null;
  fleetRegionName: string | null;
  temporaryPassword: string;
}> {
  const { data } = await apiClient.post<
    ApiSuccess<{
      id: string;
      email: string | null;
      phone: string;
      fullName: string;
      role: string;
      fleetRegionId: string | null;
      fleetRegionName: string | null;
      temporaryPassword: string;
    }>
  >(`/fleet/companies/${companyId}/team/users`, payload);
  return data.data;
}

export type FleetTeamInviteRole = 'manager' | 'dispatcher' | 'regional' | 'support';

export async function createTeamInvite(
  companyId: string,
  payload: { userId: string; role: FleetTeamInviteRole },
): Promise<unknown> {
  const { data } = await apiClient.post<ApiSuccess<unknown>>(
    `/fleet/companies/${companyId}/team/invites`,
    payload,
  );
  return data.data;
}

export async function updateTeamMember(
  companyId: string,
  membershipId: string,
  payload: { role?: FleetTeamInviteRole; fleetRegionId?: string | null },
): Promise<unknown> {
  const { data } = await apiClient.patch<ApiSuccess<unknown>>(
    `/fleet/companies/${companyId}/team/${membershipId}`,
    payload,
  );
  return data.data;
}

export async function removeTeamMember(companyId: string, membershipId: string): Promise<unknown> {
  const { data } = await apiClient.delete<ApiSuccess<unknown>>(
    `/fleet/companies/${companyId}/team/${membershipId}`,
  );
  return data.data;
}

export async function resetFleetStaffPassword(
  companyId: string,
  membershipId: string,
): Promise<{ userId: string; email: string; temporaryPassword: string }> {
  const { data } = await apiClient.post<ApiSuccess<{ userId: string; email: string; temporaryPassword: string }>>(
    `/fleet/companies/${companyId}/team/${membershipId}/reset-password`,
  );
  return data.data;
}

function fleetExportUrl(companyId: string, kind: 'trips' | 'wallet-statement', params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const base = import.meta.env.VITE_API_URL || 'http://65.21.177.122:3000/api/v1';
  return `${base}/fleet/companies/${companyId}/exports/${kind}${qs ? `?${qs}` : ''}`;
}

export function downloadFleetExport(
  companyId: string,
  kind: 'trips' | 'wallet-statement',
  params: Record<string, string> = {},
) {
  const token = getAccessToken();
  const url = fleetExportUrl(companyId, kind, params);
  fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then((r) => r.blob())
    .then((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = kind === 'trips' ? 'fleet-trips.csv' : 'fleet-wallet-statement.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    });
}
