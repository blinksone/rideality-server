import {
  Prisma,
  RatingModerationStatus,
  RatingRaterRole,
  RideStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';

const RATING_WINDOW_HOURS = 72;

const PASSENGER_TAGS = [
  'friendly',
  'clean_car',
  'safe_driving',
  'good_navigation',
  'rude',
  'unsafe_driving',
  'dirty_car',
  'long_route',
];

const DRIVER_TAGS = ['polite', 'on_time', 'rude', 'late', 'messy'];

export function getRatingTags() {
  return { passengerToDriver: PASSENGER_TAGS, driverToPassenger: DRIVER_TAGS };
}

function formatRating(row: {
  id: string;
  rideId: string;
  raterUserId: string;
  rateeUserId: string;
  raterRole: RatingRaterRole;
  score: number;
  tags: string[];
  comment: string | null;
  isAnonymous: boolean;
  moderationStatus: RatingModerationStatus;
  createdAt: Date;
  rater?: { id: string; profile?: { fullName: string | null; photoUrl: string | null } | null } | null;
  ratee?: { id: string; profile?: { fullName: string | null; photoUrl: string | null } | null } | null;
  ride?: { id: string; pickupAddress: string; dropoffAddress: string; completedAt: Date | null } | null;
}) {
  return {
    id: row.id,
    rideId: row.rideId,
    raterUserId: row.raterUserId,
    rateeUserId: row.rateeUserId,
    raterRole: row.raterRole,
    score: row.score,
    tags: row.tags,
    comment: row.moderationStatus === RatingModerationStatus.hidden ? null : row.comment,
    isAnonymous: row.isAnonymous,
    moderationStatus: row.moderationStatus,
    createdAt: row.createdAt,
    rater: row.rater
      ? row.isAnonymous
        ? { id: null, fullName: 'Anonymous', photoUrl: null }
        : {
            id: row.rater.id,
            fullName: row.rater.profile?.fullName ?? null,
            photoUrl: row.rater.profile?.photoUrl ?? null,
          }
      : null,
    ratee: row.ratee
      ? {
          id: row.ratee.id,
          fullName: row.ratee.profile?.fullName ?? null,
          photoUrl: row.ratee.profile?.photoUrl ?? null,
        }
      : null,
    ride: row.ride
      ? {
          id: row.ride.id,
          pickupAddress: row.ride.pickupAddress,
          dropoffAddress: row.ride.dropoffAddress,
          completedAt: row.ride.completedAt,
        }
      : null,
  };
}

async function recalcUserRating(userId: string, tx: Prisma.TransactionClient = prisma) {
  const agg = await tx.rideRating.aggregate({
    where: { rateeUserId: userId, moderationStatus: { not: RatingModerationStatus.hidden } },
    _avg: { score: true },
    _count: { _all: true },
  });

  await tx.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      ratingAvg: agg._avg.score ? Number(agg._avg.score.toFixed(2)) : 0,
      ratingCount: agg._count._all,
    },
    update: {
      ratingAvg: agg._avg.score ? Number(agg._avg.score.toFixed(2)) : 0,
      ratingCount: agg._count._all,
    },
  });
}

export async function submitRating(
  raterUserId: string,
  rideId: string,
  data: { score: number; tags?: string[]; comment?: string; isAnonymous?: boolean },
) {
  const ride = await prisma.ride.findUnique({ where: { id: rideId } });
  if (!ride) throw new NotFoundError('Ride not found');

  const isPassenger = ride.passengerUserId === raterUserId;
  const isDriver = ride.driverUserId === raterUserId;
  if (!isPassenger && !isDriver) {
    throw new ForbiddenError('You were not part of this ride');
  }

  if (ride.status !== RideStatus.completed) {
    throw new ValidationError('You can only rate completed rides');
  }

  const completedAt = ride.completedAt ?? ride.updatedAt;
  const deadline = new Date(completedAt.getTime() + RATING_WINDOW_HOURS * 60 * 60 * 1000);
  if (new Date() > deadline) {
    throw new ValidationError('Rating window has closed for this ride');
  }

  const raterRole = isPassenger ? RatingRaterRole.passenger : RatingRaterRole.driver;
  const rateeUserId = isPassenger ? ride.driverUserId : ride.passengerUserId;
  if (!rateeUserId) {
    throw new ValidationError('This ride has no counterparty to rate');
  }

  const allowedTags = isPassenger ? PASSENGER_TAGS : DRIVER_TAGS;
  const tags = (data.tags ?? []).filter((t) => allowedTags.includes(t));

  const existing = await prisma.rideRating.findUnique({
    where: { rideId_raterUserId: { rideId, raterUserId } },
  });
  if (existing) throw new ConflictError('You have already rated this ride', 'ALREADY_RATED');

  const rating = await prisma.$transaction(async (tx) => {
    const created = await tx.rideRating.create({
      data: {
        rideId,
        raterUserId,
        rateeUserId,
        raterRole,
        score: data.score,
        tags,
        comment: data.comment,
        isAnonymous: data.isAnonymous ?? false,
      },
      include: {
        rater: { include: { profile: true } },
        ratee: { include: { profile: true } },
        ride: true,
      },
    });

    await recalcUserRating(rateeUserId, tx);
    return created;
  });

  return formatRating(rating);
}

export async function listRatingsGiven(userId: string, page: number, limit: number) {
  const where: Prisma.RideRatingWhereInput = { raterUserId: userId };
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    prisma.rideRating.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        ratee: { include: { profile: true } },
        ride: true,
      },
    }),
    prisma.rideRating.count({ where }),
  ]);
  return { ratings: rows.map(formatRating), total };
}

export async function listRatingsReceived(userId: string, page: number, limit: number) {
  const where: Prisma.RideRatingWhereInput = {
    rateeUserId: userId,
    moderationStatus: { not: RatingModerationStatus.hidden },
  };
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    prisma.rideRating.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        rater: { include: { profile: true } },
        ride: true,
      },
    }),
    prisma.rideRating.count({ where }),
  ]);
  return { ratings: rows.map(formatRating), total };
}

export async function listUserRatingsAdmin(
  userId: string,
  query: { page: number; limit: number; direction?: 'given' | 'received' },
) {
  const direction = query.direction ?? 'received';
  const where: Prisma.RideRatingWhereInput =
    direction === 'given' ? { raterUserId: userId } : { rateeUserId: userId };
  const skip = (query.page - 1) * query.limit;

  const [rows, total, summary] = await Promise.all([
    prisma.rideRating.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit,
      include: {
        rater: { include: { profile: true } },
        ratee: { include: { profile: true } },
        ride: true,
      },
    }),
    prisma.rideRating.count({ where }),
    prisma.rideRating.aggregate({
      where: { rateeUserId: userId, moderationStatus: { not: RatingModerationStatus.hidden } },
      _avg: { score: true },
      _count: { _all: true },
    }),
  ]);

  return {
    ratings: rows.map(formatRating),
    total,
    summary: {
      averageReceived: summary._avg.score ? Number(summary._avg.score.toFixed(2)) : 0,
      countReceived: summary._count._all,
    },
  };
}

export async function moderateRating(
  actorId: string,
  ratingId: string,
  status: RatingModerationStatus,
  ipAddress?: string,
) {
  const existing = await prisma.rideRating.findUnique({ where: { id: ratingId } });
  if (!existing) throw new NotFoundError('Rating not found');

  const updated = await prisma.$transaction(async (tx) => {
    const rating = await tx.rideRating.update({
      where: { id: ratingId },
      data: { moderationStatus: status },
      include: {
        rater: { include: { profile: true } },
        ratee: { include: { profile: true } },
        ride: true,
      },
    });

    await recalcUserRating(existing.rateeUserId, tx);

    await tx.auditLog.create({
      data: {
        actorId,
        targetUserId: existing.rateeUserId,
        action: 'rating.moderate',
        details: { ratingId, from: existing.moderationStatus, to: status },
        ipAddress,
      },
    });

    return rating;
  });

  return formatRating(updated);
}
