import { Prisma, RatingModerationStatus, RideStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError } from '../utils/errors';

const RATING_WINDOW_HOURS = 72;

type RideStatusGroup = 'active' | 'completed' | 'cancelled' | 'all';

const STATUS_GROUPS: Record<Exclude<RideStatusGroup, 'all'>, RideStatus[]> = {
  active: [
    RideStatus.requested,
    RideStatus.accepted,
    RideStatus.driver_en_route,
    RideStatus.arrived,
    RideStatus.picked_up,
    RideStatus.assigned,
    RideStatus.in_progress,
  ],
  completed: [RideStatus.completed],
  cancelled: [RideStatus.cancelled],
};

function parseDateRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  const range: { gte?: Date; lte?: Date } = {};
  if (from) range.gte = new Date(from);
  if (to) range.lte = new Date(to);
  return range;
}

function ratingWindowOpen(ride: { status: RideStatus; completedAt: Date | null; updatedAt: Date }) {
  if (ride.status !== RideStatus.completed) return false;
  const base = ride.completedAt ?? ride.updatedAt;
  return new Date() <= new Date(base.getTime() + RATING_WINDOW_HOURS * 60 * 60 * 1000);
}

const rideListInclude = {
  driver: { include: { profile: true } },
  vehicle: true,
  ratings: true,
} satisfies Prisma.RideInclude;

function buildRideWhere(
  passengerUserId: string,
  query: { status?: RideStatusGroup; from?: string; to?: string; search?: string },
): Prisma.RideWhereInput {
  const where: Prisma.RideWhereInput = { passengerUserId };

  if (query.status && query.status !== 'all') {
    where.status = { in: STATUS_GROUPS[query.status] };
  }

  const dateRange = parseDateRange(query.from, query.to);
  if (dateRange) where.createdAt = dateRange;

  if (query.search) {
    where.OR = [
      { pickupAddress: { contains: query.search, mode: 'insensitive' } },
      { dropoffAddress: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  return where;
}

function formatRideListItem(
  ride: Prisma.RideGetPayload<{ include: typeof rideListInclude }>,
  passengerUserId: string,
) {
  const givenByPassenger = ride.ratings.find((r) => r.raterUserId === passengerUserId);
  const receivedByPassenger = ride.ratings.find((r) => r.rateeUserId === passengerUserId);
  return {
    id: ride.id,
    status: ride.status,
    pickupAddress: ride.pickupAddress,
    dropoffAddress: ride.dropoffAddress,
    fare: Number(ride.fare),
    distanceKm: Number(ride.distanceKm),
    currency: ride.currency,
    vehicleType: ride.vehicleType,
    driver: ride.driver
      ? {
          id: ride.driver.id,
          fullName: ride.driver.profile?.fullName ?? ride.driver.phone,
          photoUrl: ride.driver.profile?.photoUrl ?? null,
          ratingAvg: ride.driver.profile ? Number(ride.driver.profile.ratingAvg) : 0,
        }
      : null,
    vehicle: ride.vehicle
      ? { model: ride.vehicle.model, plate: ride.vehicle.numberPlate, vehicleType: ride.vehicle.vehicleType }
      : null,
    startedAt: ride.startedAt,
    completedAt: ride.completedAt,
    createdAt: ride.createdAt,
    ratingGiven: givenByPassenger?.score ?? null,
    ratingReceived: receivedByPassenger?.score ?? null,
    canRate: ratingWindowOpen(ride) && !givenByPassenger,
  };
}

export async function listPassengerRides(
  passengerUserId: string,
  query: { page: number; limit: number; status?: RideStatusGroup; from?: string; to?: string; search?: string },
) {
  const where = buildRideWhere(passengerUserId, query);
  const skip = (query.page - 1) * query.limit;

  const [rides, total] = await Promise.all([
    prisma.ride.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit,
      include: rideListInclude,
    }),
    prisma.ride.count({ where }),
  ]);

  return {
    rides: rides.map((r) => formatRideListItem(r, passengerUserId)),
    total,
  };
}

export async function getPassengerRide(passengerUserId: string, rideId: string) {
  const ride = await prisma.ride.findFirst({
    where: { id: rideId, passengerUserId },
    include: {
      driver: { include: { profile: true } },
      vehicle: true,
      ratings: { include: { rater: { include: { profile: true } } } },
      fleetCompany: { select: { id: true, legalName: true } },
    },
  });
  if (!ride) throw new NotFoundError('Ride not found');

  const given = ride.ratings.find((r) => r.raterUserId === passengerUserId);
  const received = ride.ratings.find(
    (r) => r.rateeUserId === passengerUserId && r.moderationStatus !== RatingModerationStatus.hidden,
  );

  const timeline = [
    { status: 'requested', at: ride.createdAt, label: 'Ride requested' },
    ride.startedAt ? { status: 'in_progress', at: ride.startedAt, label: 'Trip started' } : null,
    ride.completedAt
      ? { status: ride.status, at: ride.completedAt, label: ride.status === RideStatus.cancelled ? 'Trip cancelled' : 'Trip completed' }
      : null,
  ].filter(Boolean);

  return {
    ride: {
      id: ride.id,
      status: ride.status,
      pickupAddress: ride.pickupAddress,
      dropoffAddress: ride.dropoffAddress,
      pickupLat: ride.pickupLat ? Number(ride.pickupLat) : null,
      pickupLng: ride.pickupLng ? Number(ride.pickupLng) : null,
      dropoffLat: ride.dropoffLat ? Number(ride.dropoffLat) : null,
      dropoffLng: ride.dropoffLng ? Number(ride.dropoffLng) : null,
      fare: Number(ride.fare),
      distanceKm: Number(ride.distanceKm),
      currency: ride.currency,
      vehicleType: ride.vehicleType,
      startedAt: ride.startedAt,
      completedAt: ride.completedAt,
      createdAt: ride.createdAt,
      fleetCompany: ride.fleetCompany,
      driver: ride.driver
        ? {
            id: ride.driver.id,
            fullName: ride.driver.profile?.fullName ?? ride.driver.phone,
            photoUrl: ride.driver.profile?.photoUrl ?? null,
            ratingAvg: ride.driver.profile ? Number(ride.driver.profile.ratingAvg) : 0,
          }
        : null,
      vehicle: ride.vehicle
        ? {
            model: ride.vehicle.model,
            plate: ride.vehicle.numberPlate,
            color: ride.vehicle.color,
            vehicleType: ride.vehicle.vehicleType,
          }
        : null,
    },
    timeline,
    fareBreakdown: {
      total: Number(ride.fare),
      currency: ride.currency,
      distanceKm: Number(ride.distanceKm),
    },
    rating: {
      canRate: ratingWindowOpen(ride) && !given,
      given: given ? { score: given.score, tags: given.tags, comment: given.comment } : null,
      received: received ? { score: received.score, tags: received.tags } : null,
    },
  };
}

export async function getPassengerStats(userId: string) {
  const profile = await prisma.passengerProfile.findUnique({ where: { userId } });

  const [statusCounts, spendAgg, lastRide] = await Promise.all([
    prisma.ride.groupBy({
      by: ['status'],
      where: { passengerUserId: userId },
      _count: { _all: true },
    }),
    prisma.ride.aggregate({
      where: { passengerUserId: userId, status: RideStatus.completed },
      _sum: { fare: true },
      _count: { _all: true },
    }),
    prisma.ride.findFirst({
      where: { passengerUserId: userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, completedAt: true },
    }),
  ]);

  const countMap = new Map(statusCounts.map((s) => [s.status, s._count._all]));
  const totalRides = Array.from(countMap.values()).reduce((a, b) => a + b, 0);
  const cancelled = countMap.get(RideStatus.cancelled) ?? 0;
  const completed = spendAgg._count._all;

  return {
    totalRides,
    completedRides: completed,
    cancelledRides: cancelled,
    cancellationRate: totalRides > 0 ? Number((cancelled / totalRides).toFixed(3)) : 0,
    totalSpend: Number(spendAgg._sum.fare ?? 0),
    loyaltyTier: profile?.loyaltyTier ?? 'basic',
    loyaltyPoints: profile?.loyaltyPoints ?? 0,
    verificationLevel: profile?.verificationLevel ?? 'basic',
    lastRideAt: lastRide?.completedAt ?? lastRide?.createdAt ?? null,
  };
}

// ─── Admin / Fleet passenger views ───────────────────────────────────────────

export async function getPassengerSummaryAdmin(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      passengerProfile: true,
      wallet: true,
      region: { select: { id: true, code: true, name: true, currency: true } },
    },
  });
  if (!user) throw new NotFoundError('User not found');

  const stats = await getPassengerStats(userId);

  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    status: user.status,
    fullName: user.profile?.fullName ?? null,
    photoUrl: user.profile?.photoUrl ?? null,
    ratingAvg: user.profile ? Number(user.profile.ratingAvg) : 0,
    ratingCount: user.profile?.ratingCount ?? 0,
    region: user.region,
    wallet: user.wallet
      ? {
          id: user.wallet.id,
          balance: Number(user.wallet.balance),
          currency: user.wallet.currency,
          status: user.wallet.status,
        }
      : null,
    stats,
  };
}

export async function listPassengerRidesAdmin(
  userId: string,
  query: { page: number; limit: number; status?: RideStatusGroup; from?: string; to?: string; search?: string },
) {
  return listPassengerRides(userId, query);
}

const CREDIT_TX_TYPES = ['topup', 'adjustment_credit', 'ride_earnings', 'refund', 'release'];

export async function getPassengerWalletAdmin(
  userId: string,
  query: { page: number; limit: number },
) {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new NotFoundError('Wallet not found');

  const skip = (query.page - 1) * query.limit;
  const [rows, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit,
      include: { createdBy: { include: { profile: true } } },
    }),
    prisma.walletTransaction.count({ where: { walletId: wallet.id } }),
  ]);

  return {
    wallet: {
      id: wallet.id,
      balance: Number(wallet.balance),
      currency: wallet.currency,
      status: wallet.status,
      updatedAt: wallet.updatedAt,
    },
    transactions: rows.map((tx) => ({
      id: tx.id,
      type: tx.type,
      amount: CREDIT_TX_TYPES.includes(tx.type) ? Number(tx.amount) : -Number(tx.amount),
      currency: tx.currency,
      balanceAfter: Number(tx.balanceAfter),
      description: tx.description,
      referenceType: tx.referenceType,
      referenceId: tx.referenceId,
      createdBy: tx.createdBy
        ? tx.createdBy.profile?.fullName ?? tx.createdBy.email
        : null,
      createdAt: tx.createdAt,
    })),
    total,
  };
}
