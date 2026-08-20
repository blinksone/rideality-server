import {
  DocumentStatus,
  DriverOnboardingStatus,
  DriverType,
  FleetMemberRole,
  FleetMemberStatus,
  FleetNotificationType,
  PlatformRole,
  RideStatus,
  VehicleOperationalStatus,
  WalletTransactionType,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { redis, RedisKeys } from '../lib/redis';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';
import { assertFleetAccess, assertFleetDriverOps, assertFleetOwner } from './fleet.service';
import { notStaffDriverUserFilter } from './fleet-access';
import { assertCityHasNoRegionalUser } from './fleet-hierarchy.service';
import { generateTemporaryPassword, hashPassword } from '../utils/crypto';

type FleetListQuery = {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  from?: string;
  to?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
};

function parseDateRange(from?: string, to?: string) {
  const range: { gte?: Date; lte?: Date } = {};
  if (from) range.gte = new Date(from);
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    range.lte = end;
  }
  return Object.keys(range).length ? range : undefined;
}

async function fleetDriverUserIds(companyId: string) {
  const drivers = await prisma.driverProfile.findMany({
    where: { fleetCompanyId: companyId, user: notStaffDriverUserFilter(companyId) },
    select: { userId: true },
  });
  return drivers.map((d) => d.userId);
}

async function readDriverLocation(userId: string): Promise<{ lat: number; lng: number } | null> {
  const raw = await redis.get(RedisKeys.driverLocation(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { lat?: number; lng?: number };
    if (typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
      return { lat: parsed.lat, lng: parsed.lng };
    }
  } catch {
    return null;
  }
  return null;
}

export async function listFleetVehicles(
  companyId: string,
  requesterId: string,
  query: FleetListQuery,
) {
  const access = await assertFleetDriverOps(companyId, requesterId);

  const where: {
    fleetCompanyId: string;
    OR?: Array<
      | { numberPlate: { contains: string; mode: 'insensitive' } }
      | { model: { contains: string; mode: 'insensitive' } }
      | { driverProfile: { user: { profile: { fullName: { contains: string; mode: 'insensitive' } } } } }
    >;
    operationalStatus?: VehicleOperationalStatus;
    driverProfile?: { fleetRegionId: string };
  } = { fleetCompanyId: companyId };

  if (access.fleetRegionId) {
    where.driverProfile = { fleetRegionId: access.fleetRegionId };
  }

  if (query.search) {
    where.OR = [
      { numberPlate: { contains: query.search, mode: 'insensitive' } },
      { model: { contains: query.search, mode: 'insensitive' } },
      {
        driverProfile: {
          user: { profile: { fullName: { contains: query.search, mode: 'insensitive' } } },
        },
      },
    ];
  }
  if (query.status && ['active', 'maintenance', 'offline'].includes(query.status)) {
    where.operationalStatus = query.status as VehicleOperationalStatus;
  }

  const orderBy =
    query.sortBy === 'plate'
      ? { numberPlate: query.sortDir ?? 'asc' }
      : { updatedAt: query.sortDir ?? 'desc' };

  const [vehicles, total] = await Promise.all([
    prisma.vehicle.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: {
        driverProfile: {
          include: { user: { include: { profile: true } } },
        },
      },
    }),
    prisma.vehicle.count({ where }),
  ]);

  return {
    vehicles: vehicles.map((v) => ({
      id: v.id,
      vehicleType: v.vehicleType,
      model: v.model,
      numberPlate: v.numberPlate,
      color: v.color,
      year: v.year,
      availableSeats: v.availableSeats,
      isVerified: v.isVerified,
      operationalStatus: v.operationalStatus,
      driverUserId: v.driverProfile?.userId ?? null,
      driverName: v.driverProfile
        ? (v.driverProfile.user.profile?.fullName ?? v.driverProfile.user.phone)
        : null,
      updatedAt: v.updatedAt,
    })),
    total,
  };
}

export async function createFleetVehicle(
  companyId: string,
  requesterId: string,
  data: {
    driverUserId?: string;
    vehicleType: string;
    model: string;
    numberPlate: string;
    color?: string;
    year?: number;
    availableSeats?: number;
  },
) {
  const access = await assertFleetDriverOps(companyId, requesterId);

  let driverProfileId: string | null = null;
  let driverMeta: { userId: string; name: string } | null = null;

  if (data.driverUserId) {
    const driver = await prisma.driverProfile.findFirst({
      where: {
        userId: data.driverUserId,
        fleetCompanyId: companyId,
        ...(access.fleetRegionId ? { fleetRegionId: access.fleetRegionId } : {}),
      },
      include: { vehicle: true, user: { include: { profile: true } } },
    });
    if (!driver) {
      throw new ValidationError('Driver is not assigned to this fleet');
    }
    if (driver.vehicle) {
      throw new ValidationError('This driver already has a vehicle. Edit or reassign that vehicle instead.');
    }
    driverProfileId = driver.id;
    driverMeta = {
      userId: driver.userId,
      name: driver.user.profile?.fullName ?? driver.user.phone,
    };
  }

  const plateTaken = await prisma.vehicle.findFirst({
    where: {
      fleetCompanyId: companyId,
      numberPlate: { equals: data.numberPlate, mode: 'insensitive' },
    },
  });
  if (plateTaken) {
    throw new ValidationError('A vehicle with this plate already exists in the fleet');
  }

  const created = await prisma.vehicle.create({
    data: {
      driverProfileId,
      fleetCompanyId: companyId,
      vehicleType: data.vehicleType,
      model: data.model,
      numberPlate: data.numberPlate.trim().toUpperCase(),
      color: data.color,
      year: data.year,
      availableSeats: data.availableSeats ?? 4,
      operationalStatus: VehicleOperationalStatus.active,
    },
    include: {
      driverProfile: { include: { user: { include: { profile: true } } } },
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: requesterId,
      fleetCompanyId: companyId,
      action: 'fleet.vehicle.created',
      details: {
        vehicleId: created.id,
        driverUserId: data.driverUserId ?? null,
        numberPlate: created.numberPlate,
      },
    },
  });

  return {
    id: created.id,
    vehicleType: created.vehicleType,
    model: created.model,
    numberPlate: created.numberPlate,
    color: created.color,
    year: created.year,
    availableSeats: created.availableSeats,
    isVerified: created.isVerified,
    operationalStatus: created.operationalStatus,
    driverUserId: driverMeta?.userId ?? created.driverProfile?.userId ?? null,
    driverName: driverMeta?.name
      ?? (created.driverProfile
        ? (created.driverProfile.user.profile?.fullName ?? created.driverProfile.user.phone)
        : null),
    updatedAt: created.updatedAt,
  };
}

export async function updateFleetVehicle(
  companyId: string,
  requesterId: string,
  vehicleId: string,
  data: {
    operationalStatus?: VehicleOperationalStatus;
    driverUserId?: string | null;
    vehicleType?: string;
    model?: string;
    numberPlate?: string;
    color?: string | null;
    year?: number | null;
    availableSeats?: number;
    isVerified?: boolean;
  },
) {
  const access = await assertFleetDriverOps(companyId, requesterId);

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, fleetCompanyId: companyId },
  });
  if (!vehicle) throw new NotFoundError('Vehicle not found');

  let nextDriverProfileId: string | null | undefined = undefined;

  if (data.driverUserId === null) {
    const activeRide = await prisma.ride.findFirst({
      where: {
        vehicleId,
        status: { in: [RideStatus.requested, RideStatus.assigned, RideStatus.in_progress, RideStatus.accepted, RideStatus.driver_en_route, RideStatus.arrived, RideStatus.picked_up] },
      },
    });
    if (activeRide) {
      throw new ValidationError('Cannot unassign a driver from a vehicle that is on an active trip');
    }
    nextDriverProfileId = null;
  } else if (data.driverUserId) {
    const targetDriver = await prisma.driverProfile.findFirst({
      where: {
        userId: data.driverUserId,
        fleetCompanyId: companyId,
        ...(access.fleetRegionId ? { fleetRegionId: access.fleetRegionId } : {}),
      },
      include: { vehicle: true },
    });
    if (!targetDriver) {
      throw new ValidationError('Driver is not assigned to this fleet');
    }
    if (targetDriver.vehicle && targetDriver.vehicle.id !== vehicleId) {
      throw new ValidationError(
        'Selected driver already has another vehicle. Remove or reassign that vehicle first.',
      );
    }
    nextDriverProfileId = targetDriver.id;
  }

  if (data.numberPlate) {
    const plateTaken = await prisma.vehicle.findFirst({
      where: {
        fleetCompanyId: companyId,
        id: { not: vehicleId },
        numberPlate: { equals: data.numberPlate, mode: 'insensitive' },
      },
    });
    if (plateTaken) {
      throw new ValidationError('A vehicle with this plate already exists in the fleet');
    }
  }

  const updated = await prisma.vehicle.update({
    where: { id: vehicleId },
    data: {
      ...(nextDriverProfileId !== undefined && { driverProfileId: nextDriverProfileId }),
      ...(data.operationalStatus !== undefined && { operationalStatus: data.operationalStatus }),
      ...(data.vehicleType !== undefined && { vehicleType: data.vehicleType }),
      ...(data.model !== undefined && { model: data.model }),
      ...(data.numberPlate !== undefined && { numberPlate: data.numberPlate.trim().toUpperCase() }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.year !== undefined && { year: data.year }),
      ...(data.availableSeats !== undefined && { availableSeats: data.availableSeats }),
      ...(data.isVerified !== undefined && { isVerified: data.isVerified }),
    },
    include: {
      driverProfile: { include: { user: { include: { profile: true } } } },
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: requesterId,
      fleetCompanyId: companyId,
      action: 'fleet.vehicle.updated',
      details: { vehicleId, ...data },
    },
  });

  return {
    id: updated.id,
    vehicleType: updated.vehicleType,
    model: updated.model,
    numberPlate: updated.numberPlate,
    color: updated.color,
    year: updated.year,
    availableSeats: updated.availableSeats,
    isVerified: updated.isVerified,
    operationalStatus: updated.operationalStatus,
    driverUserId: updated.driverProfile?.userId ?? null,
    driverName: updated.driverProfile
      ? (updated.driverProfile.user.profile?.fullName ?? updated.driverProfile.user.phone)
      : null,
    updatedAt: updated.updatedAt,
  };
}

export async function deleteFleetVehicle(
  companyId: string,
  requesterId: string,
  vehicleId: string,
) {
  await assertFleetDriverOps(companyId, requesterId);

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, fleetCompanyId: companyId },
    include: {
      driverProfile: { include: { user: { include: { profile: true } } } },
    },
  });
  if (!vehicle) throw new NotFoundError('Vehicle not found');

  const activeRide = await prisma.ride.findFirst({
    where: {
      vehicleId,
      status: { in: [RideStatus.requested, RideStatus.assigned, RideStatus.in_progress, RideStatus.accepted, RideStatus.driver_en_route, RideStatus.arrived, RideStatus.picked_up] },
    },
  });
  if (activeRide) {
    throw new ValidationError('Cannot remove a vehicle that is on an active trip');
  }

  await prisma.$transaction([
    prisma.ride.updateMany({
      where: { vehicleId },
      data: { vehicleId: null },
    }),
    prisma.vehicle.delete({ where: { id: vehicleId } }),
    prisma.auditLog.create({
      data: {
        actorId: requesterId,
        fleetCompanyId: companyId,
        action: 'fleet.vehicle.deleted',
        details: {
          vehicleId,
          numberPlate: vehicle.numberPlate,
          driverUserId: vehicle.driverProfile?.userId ?? null,
        },
      },
    }),
  ]);

  return {
    deleted: true,
    vehicleId,
    numberPlate: vehicle.numberPlate,
    driverUserId: vehicle.driverProfile?.userId ?? null,
    driverName: vehicle.driverProfile
      ? (vehicle.driverProfile.user.profile?.fullName ?? vehicle.driverProfile.user.phone)
      : null,
  };
}

export async function listFleetTrips(
  companyId: string,
  requesterId: string,
  query: FleetListQuery & { driverUserId?: string },
) {
  await assertFleetAccess(companyId, requesterId);

  const where: {
    fleetCompanyId: string;
    status?: RideStatus;
    driverUserId?: string;
    createdAt?: { gte?: Date; lte?: Date };
    OR?: Array<
      | { passengerName: { contains: string; mode: 'insensitive' } }
      | { pickupAddress: { contains: string; mode: 'insensitive' } }
      | { dropoffAddress: { contains: string; mode: 'insensitive' } }
    >;
  } = { fleetCompanyId: companyId };

  if (query.status && Object.values(RideStatus).includes(query.status as RideStatus)) {
    where.status = query.status as RideStatus;
  }
  if (query.driverUserId) where.driverUserId = query.driverUserId;
  const dateRange = parseDateRange(query.from, query.to);
  if (dateRange) where.createdAt = dateRange;
  if (query.search) {
    where.OR = [
      { passengerName: { contains: query.search, mode: 'insensitive' } },
      { pickupAddress: { contains: query.search, mode: 'insensitive' } },
      { dropoffAddress: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const [trips, total] = await Promise.all([
    prisma.ride.findMany({
      where,
      orderBy: { createdAt: query.sortDir === 'asc' ? 'asc' : 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: {
        driver: { include: { profile: true } },
        vehicle: true,
      },
    }),
    prisma.ride.count({ where }),
  ]);

  return {
    trips: trips.map((t) => ({
      id: t.id,
      status: t.status,
      passengerName: t.passengerName,
      pickupAddress: t.pickupAddress,
      dropoffAddress: t.dropoffAddress,
      fare: Number(t.fare),
      distanceKm: Number(t.distanceKm),
      currency: t.currency,
      driverUserId: t.driverUserId,
      driverName: t.driver?.profile?.fullName ?? t.driver?.phone ?? null,
      vehiclePlate: t.vehicle?.numberPlate ?? null,
      startedAt: t.startedAt,
      completedAt: t.completedAt,
      createdAt: t.createdAt,
    })),
    total,
  };
}

export async function getFleetTrip(
  companyId: string,
  requesterId: string,
  tripId: string,
) {
  await assertFleetAccess(companyId, requesterId);

  const trip = await prisma.ride.findFirst({
    where: { id: tripId, fleetCompanyId: companyId },
    include: {
      driver: { include: { profile: true } },
      vehicle: true,
    },
  });
  if (!trip) throw new NotFoundError('Trip not found');

  return {
    id: trip.id,
    status: trip.status,
    passengerName: trip.passengerName,
    pickupAddress: trip.pickupAddress,
    dropoffAddress: trip.dropoffAddress,
    pickupLat: trip.pickupLat ? Number(trip.pickupLat) : null,
    pickupLng: trip.pickupLng ? Number(trip.pickupLng) : null,
    dropoffLat: trip.dropoffLat ? Number(trip.dropoffLat) : null,
    dropoffLng: trip.dropoffLng ? Number(trip.dropoffLng) : null,
    fare: Number(trip.fare),
    distanceKm: Number(trip.distanceKm),
    currency: trip.currency,
    driverUserId: trip.driverUserId,
    driverName: trip.driver?.profile?.fullName ?? trip.driver?.phone ?? null,
    vehicle: trip.vehicle,
    startedAt: trip.startedAt,
    completedAt: trip.completedAt,
    createdAt: trip.createdAt,
  };
}

export async function getFleetEarnings(
  companyId: string,
  requesterId: string,
  query: { from?: string; to?: string },
) {
  await assertFleetAccess(companyId, requesterId);

  const wallet = await prisma.wallet.findUnique({ where: { fleetCompanyId: companyId } });
  const dateRange = parseDateRange(query.from, query.to);

  const rideWhere = {
    fleetCompanyId: companyId,
    status: RideStatus.completed,
    ...(dateRange ? { completedAt: dateRange } : {}),
  };

  const [rideAgg, driverEarnings, walletAgg] = await Promise.all([
    prisma.ride.aggregate({
      where: rideWhere,
      _sum: { fare: true, distanceKm: true },
      _count: { _all: true },
    }),
    prisma.ride.groupBy({
      by: ['driverUserId'],
      where: rideWhere,
      _sum: { fare: true },
      _count: { _all: true },
    }),
    wallet
      ? prisma.walletTransaction.aggregate({
          where: {
            walletId: wallet.id,
            type: { in: [WalletTransactionType.ride_earnings, WalletTransactionType.commission] },
            ...(dateRange ? { createdAt: dateRange } : {}),
          },
          _sum: { amount: true },
        })
      : Promise.resolve({ _sum: { amount: null } }),
  ]);

  const driverIds = driverEarnings
    .map((d) => d.driverUserId)
    .filter((id): id is string => Boolean(id));
  const drivers = await prisma.user.findMany({
    where: { id: { in: driverIds } },
    include: { profile: true },
  });
  const driverMap = new Map(drivers.map((d) => [d.id, d]));

  return {
    currency: wallet?.currency ?? 'PKR',
    totalTripRevenue: Number(rideAgg._sum.fare ?? 0),
    totalTrips: rideAgg._count._all,
    totalDistanceKm: Number(rideAgg._sum.distanceKm ?? 0),
    walletEarnings: Number(walletAgg._sum.amount ?? 0),
    byDriver: driverEarnings.map((row) => {
      const user = row.driverUserId ? driverMap.get(row.driverUserId) : undefined;
      return {
        driverUserId: row.driverUserId,
        driverName: user?.profile?.fullName ?? user?.phone ?? row.driverUserId ?? 'unassigned',
        trips: row._count._all,
        revenue: Number(row._sum.fare ?? 0),
      };
    }),
  };
}

export async function getFleetReports(
  companyId: string,
  requesterId: string,
  query: { days?: number },
) {
  await assertFleetAccess(companyId, requesterId);

  const days = Math.min(Math.max(query.days ?? 30, 7), 90);
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  const wallet = await prisma.wallet.findUnique({ where: { fleetCompanyId: companyId } });

  const buckets = Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [dailyStats, driverStats, docExpiring] = await Promise.all([
    Promise.all(
      buckets.map(async (dayStart) => {
        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59, 999);
        const agg = await prisma.ride.aggregate({
          where: {
            fleetCompanyId: companyId,
            status: RideStatus.completed,
            completedAt: { gte: dayStart, lte: dayEnd },
          },
          _sum: { fare: true },
          _count: { _all: true },
        });
        return {
          date: dayStart.toISOString().slice(0, 10),
          revenue: Number(agg._sum.fare ?? 0),
          trips: agg._count._all,
        };
      }),
    ),
    prisma.ride.groupBy({
      by: ['driverUserId'],
      where: {
        fleetCompanyId: companyId,
        status: RideStatus.completed,
        completedAt: { gte: start },
      },
      _sum: { fare: true, distanceKm: true },
      _count: { _all: true },
    }),
    listFleetDocuments(companyId, requesterId, { expiringWithinDays: 30 }),
  ]);

  const driverIds = driverStats
    .map((d) => d.driverUserId)
    .filter((id): id is string => Boolean(id));
  const drivers = await prisma.user.findMany({
    where: { id: { in: driverIds } },
    include: { profile: true },
  });
  const driverMap = new Map(drivers.map((d) => [d.id, d]));

  return {
    currency: wallet?.currency ?? 'PKR',
    periodDays: days,
    daily: dailyStats,
    topDrivers: driverStats
      .map((row) => ({
        driverUserId: row.driverUserId,
        driverName: row.driverUserId
          ? driverMap.get(row.driverUserId)?.profile?.fullName ??
            driverMap.get(row.driverUserId)?.phone ??
            row.driverUserId
          : 'unassigned',
        trips: row._count._all,
        revenue: Number(row._sum.fare ?? 0),
        distanceKm: Number(row._sum.distanceKm ?? 0),
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10),
    expiringDocuments: docExpiring.documents.length,
  };
}

export async function listFleetNotifications(
  companyId: string,
  requesterId: string,
  query: { page: number; limit: number; unreadOnly?: boolean },
) {
  await assertFleetAccess(companyId, requesterId);

  const where = {
    fleetCompanyId: companyId,
    userId: requesterId,
    ...(query.unreadOnly ? { readAt: null } : {}),
  };

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.fleetNotification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.fleetNotification.count({ where }),
    prisma.fleetNotification.count({
      where: { fleetCompanyId: companyId, userId: requesterId, readAt: null },
    }),
  ]);

  return { notifications, total, unreadCount };
}

export async function markFleetNotificationRead(
  companyId: string,
  requesterId: string,
  notificationId: string,
) {
  await assertFleetAccess(companyId, requesterId);

  const note = await prisma.fleetNotification.findFirst({
    where: { id: notificationId, fleetCompanyId: companyId, userId: requesterId },
  });
  if (!note) throw new NotFoundError('Notification not found');

  return prisma.fleetNotification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  });
}

export async function markAllFleetNotificationsRead(companyId: string, requesterId: string) {
  await assertFleetAccess(companyId, requesterId);

  const result = await prisma.fleetNotification.updateMany({
    where: { fleetCompanyId: companyId, userId: requesterId, readAt: null },
    data: { readAt: new Date() },
  });

  return { updated: result.count };
}

export async function listFleetDocuments(
  companyId: string,
  requesterId: string,
  query: { status?: DocumentStatus; expiringWithinDays?: number; search?: string },
) {
  const access = await assertFleetAccess(companyId, requesterId);

  const drivers = await prisma.driverProfile.findMany({
    where: {
      fleetCompanyId: companyId,
      ...(access.fleetRegionId ? { fleetRegionId: access.fleetRegionId } : {}),
      user: notStaffDriverUserFilter(companyId),
    },
    select: { userId: true },
  });
  const userIds = drivers.map((d) => d.userId);
  if (!userIds.length) return { documents: [], total: 0 };

  const where: {
    userId: { in: string[] };
    status?: DocumentStatus;
    expiresAt?: { lte: Date };
  } = { userId: { in: userIds } };

  if (query.status) where.status = query.status;
  if (query.expiringWithinDays) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + query.expiringWithinDays);
    where.expiresAt = { lte: cutoff };
  }

  const docs = await prisma.verificationDocument.findMany({
    where,
    orderBy: { submittedAt: 'desc' },
    include: {
      user: { include: { profile: true } },
    },
  });

  const filtered = query.search
    ? docs.filter((d) => {
        const name = d.user.profile?.fullName ?? '';
        return (
          name.toLowerCase().includes(query.search!.toLowerCase()) ||
          d.type.includes(query.search!.toLowerCase())
        );
      })
    : docs;

  return {
    documents: filtered.map((d) => ({
      id: d.id,
      userId: d.userId,
      driverName: d.user.profile?.fullName ?? d.user.phone,
      type: d.type,
      status: d.status,
      fileUrl: d.fileUrl,
      expiresAt: d.expiresAt,
      submittedAt: d.submittedAt,
      reviewedAt: d.reviewedAt,
      rejectionReason: d.rejectionReason,
    })),
    total: filtered.length,
  };
}

export async function listFleetAuditLogs(
  companyId: string,
  requesterId: string,
  query: { page: number; limit: number },
) {
  await assertFleetAccess(companyId, requesterId);

  const where = { fleetCompanyId: companyId };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: {
        actor: { include: { profile: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    logs: logs.map((l) => ({
      id: l.id,
      action: l.action,
      details: l.details,
      actorName: l.actor.profile?.fullName ?? l.actor.email,
      createdAt: l.createdAt,
    })),
    total,
  };
}

export async function getFleetMapData(companyId: string, requesterId: string) {
  await assertFleetAccess(companyId, requesterId);

  const drivers = await prisma.driverProfile.findMany({
    where: { fleetCompanyId: companyId, isOnline: true, user: notStaffDriverUserFilter(companyId) },
    include: { user: { include: { profile: true } }, vehicle: true },
  });

  const activeTrips = await prisma.ride.findMany({
    where: {
      fleetCompanyId: companyId,
      status: { in: [RideStatus.assigned, RideStatus.in_progress, RideStatus.accepted, RideStatus.driver_en_route, RideStatus.arrived, RideStatus.picked_up] },
    },
    include: { driver: { include: { profile: true } }, vehicle: true },
    take: 50,
  });

  const driverLocations = await Promise.all(
    drivers.map(async (d, index) => {
      const loc = await readDriverLocation(d.userId);
      const lat = loc?.lat ?? 24.86 + index * 0.002;
      const lng = loc?.lng ?? 67.0 + index * 0.002;
      return {
        userId: d.userId,
        fullName: d.user.profile?.fullName ?? d.user.phone,
        lat,
        lng,
        vehiclePlate: d.vehicle?.numberPlate ?? null,
      };
    }),
  );

  return {
    drivers: driverLocations,
    activeTrips: activeTrips.map((t) => ({
      id: t.id,
      status: t.status,
      driverUserId: t.driverUserId,
      driverName: t.driver?.profile?.fullName ?? t.driver?.phone ?? null,
      pickupAddress: t.pickupAddress,
      dropoffAddress: t.dropoffAddress,
      pickupLat: t.pickupLat ? Number(t.pickupLat) : null,
      pickupLng: t.pickupLng ? Number(t.pickupLng) : null,
      dropoffLat: t.dropoffLat ? Number(t.dropoffLat) : null,
      dropoffLng: t.dropoffLng ? Number(t.dropoffLng) : null,
      vehiclePlate: t.vehicle?.numberPlate ?? null,
    })),
  };
}

export async function createTeamInvite(
  companyId: string,
  requesterId: string,
  data: { userId: string; role: 'manager' | 'dispatcher' | 'regional' | 'support' },
) {
  await assertFleetOwner(companyId, requesterId);

  const mappedRole =
    data.role === 'manager' || data.role === 'regional'
      ? FleetMemberRole.regional
      : FleetMemberRole.support;

  const user = await prisma.user.findUnique({ where: { id: data.userId } });
  if (!user || user.deletedAt) throw new NotFoundError('User not found');

  const existing = await prisma.fleetMembership.findFirst({
    where: { fleetCompanyId: companyId, userId: data.userId, status: FleetMemberStatus.active },
  });
  if (existing) throw new ValidationError('User is already a team member');

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const invite = await prisma.fleetInvite.create({
    data: {
      fleetCompanyId: companyId,
      invitedUserId: data.userId,
      phone: user.phone,
      email: user.email,
      memberRole: mappedRole,
      expiresAt,
    },
  });

  await prisma.fleetNotification.create({
    data: {
      fleetCompanyId: companyId,
      userId: data.userId,
      type: FleetNotificationType.system,
      title: 'Fleet team invitation',
      body: `You have been invited to join the fleet team as ${data.role}.`,
      metadata: { inviteId: invite.id, token: invite.token },
    },
  });

  return { inviteId: invite.id, token: invite.token, expiresAt: invite.expiresAt };
}

export async function updateTeamMember(
  companyId: string,
  requesterId: string,
  membershipId: string,
  data: { role?: FleetMemberRole | 'manager' | 'dispatcher' | 'regional' | 'support'; fleetRegionId?: string | null },
) {
  await assertFleetOwner(companyId, requesterId);

  const membership = await prisma.fleetMembership.findFirst({
    where: { id: membershipId, fleetCompanyId: companyId, status: FleetMemberStatus.active },
  });
  if (!membership) throw new NotFoundError('Team member not found');
  if (membership.role === FleetMemberRole.owner) {
    throw new ForbiddenError('Cannot change fleet owner role');
  }

  let nextRole: FleetMemberRole | undefined;
  if (data.role) {
    const raw = String(data.role);
    nextRole = raw === 'manager' || raw === 'regional' ? FleetMemberRole.regional : FleetMemberRole.support;
  }

  const effectiveRole = nextRole ?? membership.role;
  const isSupport =
    effectiveRole === FleetMemberRole.support || effectiveRole === FleetMemberRole.dispatcher;

  if (!isSupport && data.fleetRegionId) {
    const region = await prisma.fleetRegion.findFirst({
      where: { id: data.fleetRegionId, fleetCompanyId: companyId },
    });
    if (!region) throw new NotFoundError('Fleet region not found');
  }

  if (nextRole === FleetMemberRole.regional && !data.fleetRegionId && !membership.fleetRegionId) {
    throw new ValidationError('City is required for regional fleet');
  }

  const nextCityId = isSupport
    ? null
    : data.fleetRegionId !== undefined
      ? data.fleetRegionId
      : membership.fleetRegionId;
  const willBeRegional =
    effectiveRole === FleetMemberRole.regional || effectiveRole === FleetMemberRole.manager;
  if (willBeRegional && nextCityId) {
    await assertCityHasNoRegionalUser(companyId, nextCityId, { excludeMembershipId: membershipId });
  }

  const updated = await prisma.fleetMembership.update({
    where: { id: membershipId },
    data: {
      ...(nextRole ? { role: nextRole } : {}),
      ...(isSupport
        ? { fleetRegionId: null }
        : data.fleetRegionId
          ? { fleetRegionId: data.fleetRegionId }
          : {}),
    },
  });

  if (nextRole === FleetMemberRole.regional) {
    await prisma.userPlatformRole.upsert({
      where: { userId_role: { userId: membership.userId, role: PlatformRole.FLEET_MANAGER } },
      create: { userId: membership.userId, role: PlatformRole.FLEET_MANAGER },
      update: {},
    });
  }

  await prisma.auditLog.create({
    data: {
      actorId: requesterId,
      fleetCompanyId: companyId,
      targetUserId: membership.userId,
      action: 'fleet.team.role_updated',
      details: { membershipId, role: nextRole ?? membership.role, fleetRegionId: data.fleetRegionId },
    },
  });

  return updated;
}

export async function removeTeamMember(
  companyId: string,
  requesterId: string,
  membershipId: string,
) {
  await assertFleetOwner(companyId, requesterId);

  const membership = await prisma.fleetMembership.findFirst({
    where: { id: membershipId, fleetCompanyId: companyId, status: FleetMemberStatus.active },
  });
  if (!membership) throw new NotFoundError('Team member not found');
  if (membership.role === FleetMemberRole.owner) {
    throw new ForbiddenError('Cannot remove fleet owner');
  }
  if (membership.userId === requesterId) {
    throw new ValidationError('Cannot remove yourself');
  }

  await prisma.fleetMembership.update({
    where: { id: membershipId },
    data: { status: FleetMemberStatus.removed },
  });

  await prisma.auditLog.create({
    data: {
      actorId: requesterId,
      fleetCompanyId: companyId,
      targetUserId: membership.userId,
      action: 'fleet.team.removed',
      details: { membershipId },
    },
  });

  return { removed: true };
}

export async function resetFleetStaffPassword(
  companyId: string,
  requesterId: string,
  membershipId: string,
) {
  await assertFleetOwner(companyId, requesterId);

  const membership = await prisma.fleetMembership.findFirst({
    where: { id: membershipId, fleetCompanyId: companyId, status: FleetMemberStatus.active },
    include: { user: { select: { id: true, email: true, deletedAt: true } } },
  });
  if (!membership) throw new NotFoundError('Team member not found');
  if (membership.role === FleetMemberRole.owner) {
    throw new ForbiddenError('Cannot reset the fleet owner password from here');
  }
  if (membership.userId === requesterId) {
    throw new ValidationError('Use change password for your own account');
  }
  if (membership.user.deletedAt) throw new NotFoundError('User not found');
  if (!membership.user.email) {
    throw new ValidationError('This team member has no email login. Create a new user instead.');
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: membership.userId },
      data: { passwordHash, mustResetPassword: true },
    });
    await tx.refreshToken.updateMany({
      where: { userId: membership.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });

  await prisma.auditLog.create({
    data: {
      actorId: requesterId,
      fleetCompanyId: companyId,
      targetUserId: membership.userId,
      action: 'fleet.team.password_reset',
      details: { membershipId, temporaryPasswordGenerated: true },
    },
  });

  return {
    userId: membership.userId,
    email: membership.user.email,
    temporaryPassword,
  };
}

function csvEscape(value: string | number | Date | null | undefined) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export async function exportFleetTripsCsv(
  companyId: string,
  requesterId: string,
  query: { from?: string; to?: string; status?: string },
) {
  const { trips } = await listFleetTrips(companyId, requesterId, {
    page: 1,
    limit: 10000,
    from: query.from,
    to: query.to,
    status: query.status,
  });

  const header = [
    'Trip ID',
    'Status',
    'Driver',
    'Passenger',
    'Pickup',
    'Dropoff',
    'Fare',
    'Distance Km',
    'Currency',
    'Completed At',
  ];
  const rows = trips.map((t) => [
    t.id,
    t.status,
    t.driverName,
    t.passengerName ?? '',
    t.pickupAddress,
    t.dropoffAddress,
    String(t.fare),
    String(t.distanceKm),
    t.currency,
    t.completedAt ? new Date(t.completedAt).toISOString() : '',
  ]);

  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}

export async function exportFleetWalletStatementCsv(
  companyId: string,
  requesterId: string,
  query: { from?: string; to?: string },
) {
  await assertFleetAccess(companyId, requesterId);

  const wallet = await prisma.wallet.findUnique({ where: { fleetCompanyId: companyId } });
  if (!wallet) throw new NotFoundError('Fleet wallet not found');

  const dateRange = parseDateRange(query.from, query.to);
  const transactions = await prisma.walletTransaction.findMany({
    where: {
      walletId: wallet.id,
      ...(dateRange ? { createdAt: dateRange } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 10000,
  });

  const header = ['Date', 'Type', 'Amount', 'Balance After', 'Currency', 'Description'];
  const rows = transactions.map((t) => [
    new Date(t.createdAt).toISOString(),
    t.type,
    String(t.amount),
    String(t.balanceAfter),
    t.currency,
    t.description ?? '',
  ]);

  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}

/** Sync vehicle fleetCompanyId from driver profiles and seed demo rides if empty. */
export async function syncFleetVehiclesFromDrivers(companyId: string) {
  const drivers = await prisma.driverProfile.findMany({
    where: { fleetCompanyId: companyId, user: notStaffDriverUserFilter(companyId) },
    include: { vehicle: true },
  });

  for (const d of drivers) {
    if (d.vehicle && d.vehicle.fleetCompanyId !== companyId) {
      await prisma.vehicle.update({
        where: { id: d.vehicle.id },
        data: { fleetCompanyId: companyId },
      });
    }
  }
}

export async function ensureFleetDemoRides(companyId: string) {
  const count = await prisma.ride.count({ where: { fleetCompanyId: companyId } });
  if (count > 0) return;

  const company = await prisma.fleetCompany.findUnique({
    where: { id: companyId },
    include: { region: true, wallet: true },
  });
  if (!company) return;

  const drivers = await prisma.driverProfile.findMany({
    where: {
      fleetCompanyId: companyId,
      onboardingStatus: DriverOnboardingStatus.approved,
      user: notStaffDriverUserFilter(companyId),
    },
    include: { vehicle: true, user: { include: { profile: true } } },
    take: 5,
  });
  if (!drivers.length) return;

  const currency = company.wallet?.currency ?? company.region.currency;
  const now = new Date();

  for (let i = 0; i < 14; i++) {
    const driver = drivers[i % drivers.length];
    const day = new Date(now);
    day.setDate(day.getDate() - i);
    const completedAt = new Date(day);
    completedAt.setHours(10 + (i % 8), 30, 0, 0);

    await prisma.ride.create({
      data: {
        fleetCompanyId: companyId,
        driverUserId: driver.userId,
        vehicleId: driver.vehicle?.id,
        passengerName: `Passenger ${i + 1}`,
        pickupAddress: `Pickup St ${100 + i}, Karachi`,
        dropoffAddress: `Dropoff Ave ${200 + i}, Karachi`,
        pickupLat: 24.86 + i * 0.001,
        pickupLng: 67.0 + i * 0.001,
        dropoffLat: 24.87 + i * 0.001,
        dropoffLng: 67.01 + i * 0.001,
        status: RideStatus.completed,
        fare: 350 + (i % 5) * 50,
        distanceKm: 5 + (i % 7),
        currency,
        startedAt: completedAt,
        completedAt,
        createdAt: completedAt,
      },
    });
  }
}

export async function ensureFleetNotifications(companyId: string, userId: string) {
  const count = await prisma.fleetNotification.count({
    where: { fleetCompanyId: companyId, userId },
  });
  if (count > 0) return;

  const pendingDrivers = await prisma.driverProfile.count({
    where: {
      fleetCompanyId: companyId,
      onboardingStatus: DriverOnboardingStatus.pending_review,
      user: notStaffDriverUserFilter(companyId),
    },
  });
  const pendingInvites = await prisma.fleetInvite.count({
    where: { fleetCompanyId: companyId, acceptedAt: null, expiresAt: { gt: new Date() } },
  });

  const items: Array<{ type: FleetNotificationType; title: string; body: string }> = [];
  if (pendingDrivers > 0) {
    items.push({
      type: FleetNotificationType.driver_pending,
      title: 'Drivers awaiting approval',
      body: `${pendingDrivers} driver(s) need your review.`,
    });
  }
  if (pendingInvites > 0) {
    items.push({
      type: FleetNotificationType.invite_pending,
      title: 'Pending invitations',
      body: `${pendingInvites} invitation(s) are still open.`,
    });
  }
  items.push({
    type: FleetNotificationType.system,
    title: 'Fleet portal ready',
    body: 'Your fleet operations dashboard is fully enabled.',
  });

  await prisma.fleetNotification.createMany({
    data: items.map((item) => ({
      fleetCompanyId: companyId,
      userId,
      type: item.type,
      title: item.title,
      body: item.body,
    })),
  });
}
