import { apiClient } from '@/api/client';
import type { ApiPaginated, ApiSuccess, PaginationParams } from '@/api/types';

export interface PassengerRide {
  id: string;
  status: 'requested' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  pickupAddress: string;
  dropoffAddress: string;
  fare: number;
  distanceKm: number;
  currency: string;
  driver: {
    id: string;
    fullName: string | null;
    photoUrl: string | null;
    ratingAvg: number;
  };
  vehicle: { model: string; plate: string } | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  ratingGiven: number | null;
  ratingReceived: number | null;
  canRate: boolean;
}

export interface PassengerWalletTransaction {
  id: string;
  type: string;
  amount: number;
  currency: string;
  balanceAfter: number;
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface PassengerWalletResult {
  wallet: {
    id: string;
    balance: number;
    currency: string;
    status: 'active' | 'frozen' | 'closed';
    updatedAt: string;
  };
  transactions: PassengerWalletTransaction[];
  total: number;
}

export interface RideRating {
  id: string;
  rideId: string;
  raterUserId: string;
  rateeUserId: string;
  raterRole: 'passenger' | 'driver';
  score: number;
  tags: string[];
  comment: string | null;
  isAnonymous: boolean;
  moderationStatus: 'visible' | 'hidden' | 'flagged';
  createdAt: string;
  rater: { id: string | null; fullName: string | null; photoUrl: string | null } | null;
  ratee: { id: string; fullName: string | null; photoUrl: string | null } | null;
  ride: { id: string; pickupAddress: string; dropoffAddress: string; completedAt: string | null } | null;
}

export interface PassengerRatingsResult {
  ratings: RideRating[];
  total: number;
  summary: { averageReceived: number; countReceived: number };
}

export interface PassengerSummary {
  id: string;
  phone: string;
  email: string | null;
  status: string;
  fullName: string | null;
  photoUrl: string | null;
  ratingAvg: number;
  ratingCount: number;
  region: { id: string; code: string; name: string; currency: string } | null;
  wallet: { id: string; balance: number; currency: string; status: string } | null;
  stats: {
    totalRides: number;
    completedRides: number;
    cancelledRides: number;
    cancellationRate: number;
    totalSpend: number;
    loyaltyTier: string;
    loyaltyPoints: number;
    verificationLevel: string;
    lastRideAt: string | null;
  };
}

export interface PassengerRidesParams extends PaginationParams {
  status?: 'active' | 'completed' | 'cancelled' | 'all';
  from?: string;
  to?: string;
  search?: string;
}

export async function getPassengerSummary(userId: string): Promise<PassengerSummary> {
  const { data } = await apiClient.get<ApiSuccess<PassengerSummary>>(
    `/admin/users/${userId}/passenger-summary`,
  );
  return data.data;
}

export async function getPassengerRides(
  userId: string,
  params: PassengerRidesParams,
): Promise<ApiPaginated<PassengerRide>> {
  const { data } = await apiClient.get<ApiPaginated<PassengerRide>>(
    `/admin/users/${userId}/rides`,
    { params },
  );
  return data;
}

export async function getPassengerWallet(
  userId: string,
  params: PaginationParams,
): Promise<PassengerWalletResult> {
  const { data } = await apiClient.get<ApiSuccess<PassengerWalletResult>>(
    `/admin/users/${userId}/wallet`,
    { params },
  );
  return data.data;
}

export async function getPassengerRatings(
  userId: string,
  params: PaginationParams & { direction?: 'given' | 'received' },
): Promise<PassengerRatingsResult> {
  const { data } = await apiClient.get<ApiSuccess<PassengerRatingsResult>>(
    `/admin/users/${userId}/ratings`,
    { params },
  );
  return data.data;
}

export async function moderateRating(
  ratingId: string,
  status: 'visible' | 'hidden' | 'flagged',
): Promise<RideRating> {
  const { data } = await apiClient.patch<ApiSuccess<RideRating>>(
    `/admin/ratings/${ratingId}/moderate`,
    { status },
  );
  return data.data;
}
