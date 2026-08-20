/**
 * Load test: ≥50 concurrent mock drivers + concurrent ride matching.
 * Pass criterion: no ride has more than one DispatchLog with response=accepted.
 *
 *   npx tsx scripts/load-test-dispatch.ts
 */
import { DispatchResponse, PlatformRole, RideStatus } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { redis, connectRedis, disconnectRedis } from '../src/lib/redis';
import { connectDatabase, disconnectDatabase } from '../src/lib/prisma';
import { REALTIME } from '../src/realtime/constants';
import { upsertDriverLocation } from '../src/services/location.service';
import { startDispatch, recordDispatchResponse, getActiveDispatch } from '../src/services/dispatch.service';

const DRIVER_COUNT = 50;
const RIDE_COUNT = 15;
// Center near Karachi for geo
const CENTER = { lat: 24.8607, lng: 67.0011 };

async function ensureTestUsers() {
  const region = await prisma.region.findFirst({ where: { isActive: true } });
  if (!region) throw new Error('No region — run db:seed');

  const drivers: string[] = [];
  for (let i = 0; i < DRIVER_COUNT; i++) {
    const phone = `+92900${String(1000000 + i).slice(0, 7)}`;
    const user = await prisma.user.upsert({
      where: { phone_regionId: { phone, regionId: region.id } },
      create: {
        phone,
        phoneVerifiedAt: new Date(),
        status: 'ACTIVE',
        regionId: region.id,
        platformRoles: { create: { role: PlatformRole.DRIVER } },
        profile: { create: { fullName: `Load Driver ${i}` } },
        driverProfile: {
          create: { onboardingStatus: 'approved', driverType: 'independent' },
        },
      },
      update: {},
    });
    drivers.push(user.id);
  }

  const riders: string[] = [];
  for (let i = 0; i < RIDE_COUNT; i++) {
    const phone = `+92901${String(1000000 + i).slice(0, 7)}`;
    const user = await prisma.user.upsert({
      where: { phone_regionId: { phone, regionId: region.id } },
      create: {
        phone,
        phoneVerifiedAt: new Date(),
        status: 'ACTIVE',
        regionId: region.id,
        platformRoles: { create: { role: PlatformRole.CUSTOMER } },
        profile: { create: { fullName: `Load Rider ${i}` } },
      },
      update: {},
    });
    riders.push(user.id);
  }

  return { drivers, riders, region };
}

async function placeDrivers(driverIds: string[]) {
  for (let i = 0; i < driverIds.length; i++) {
    // Scatter within ~3km
    const dLat = (Math.random() - 0.5) * 0.04;
    const dLng = (Math.random() - 0.5) * 0.04;
    await upsertDriverLocation({
      driverId: driverIds[i],
      lat: CENTER.lat + dLat,
      lng: CENTER.lng + dLng,
      vehicleType: 'sedan',
      status: 'online',
    });
  }
}

async function autoAcceptLoop(stop: { value: boolean }) {
  while (!stop.value) {
    // Peek pending offers: keys are in-memory via domain events; instead poll open locks
    // Drivers race to accept whatever redis response is expected by scanning dispatch logs without response
    const pending = await prisma.dispatchLog.findMany({
      where: { response: null },
      take: 20,
      orderBy: { offeredAt: 'asc' },
    });
    for (const log of pending) {
      // Half the drivers accept immediately; others ignore (timeout)
      if (Math.random() > 0.3) {
        await recordDispatchResponse(log.rideId, log.driverUserId, true);
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function main() {
  await connectDatabase();
  await connectRedis();

  console.log(`Placing ${DRIVER_COUNT} drivers within ~3km of ${CENTER.lat},${CENTER.lng}...`);
  const { drivers, riders } = await ensureTestUsers();
  await placeDrivers(drivers);

  const autoStop = { value: false };
  const autoPromise = autoAcceptLoop(autoStop);

  console.log(`Creating ${RIDE_COUNT} concurrent REQUESTED rides...`);
  const rideIds: string[] = [];

  await Promise.all(
    riders.map(async (riderId, i) => {
      // Cancel any prior active load-test ride for this rider
      await prisma.ride.updateMany({
        where: {
          passengerUserId: riderId,
          status: { notIn: [RideStatus.completed, RideStatus.cancelled] },
        },
        data: { status: RideStatus.cancelled, cancelledAt: new Date() },
      });

      const ride = await prisma.ride.create({
        data: {
          passengerUserId: riderId,
          passengerName: `Load Rider ${i}`,
          pickupLat: CENTER.lat + (Math.random() - 0.5) * 0.005,
          pickupLng: CENTER.lng + (Math.random() - 0.5) * 0.005,
          dropoffLat: CENTER.lat + 0.02,
          dropoffLng: CENTER.lng + 0.02,
          pickupAddress: 'Load test pickup',
          dropoffAddress: 'Load test dropoff',
          status: RideStatus.requested,
          fare: 250,
          fareEstimate: 250,
          currency: 'PKR',
          vehicleType: 'sedan',
        },
      });
      rideIds.push(ride.id);
      startDispatch(ride.id);
    }),
  );

  // Wait for all dispatch runs to finish
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const pending = rideIds.filter((id) => getActiveDispatch(id));
    if (pending.length === 0) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  autoStop.value = true;
  await autoPromise.catch(() => undefined);

  // Analyze DispatchLog
  const logs = await prisma.dispatchLog.findMany({
    where: { rideId: { in: rideIds } },
  });

  const acceptedByRide = new Map<string, number>();
  for (const log of logs) {
    if (log.response === DispatchResponse.accepted) {
      acceptedByRide.set(log.rideId, (acceptedByRide.get(log.rideId) ?? 0) + 1);
    }
  }

  let doubles = 0;
  for (const [rideId, count] of acceptedByRide) {
    if (count > 1) {
      doubles += 1;
      console.error(`FAIL double-dispatch ride=${rideId} accepted=${count}`);
    }
  }

  const acceptedRides = acceptedByRide.size;
  const totalOffers = logs.length;

  console.log('--- Load test result ---');
  console.log(`drivers=${DRIVER_COUNT} rides=${rideIds.length}`);
  console.log(`dispatch_logs=${totalOffers} rides_with_accept=${acceptedRides}`);
  console.log(`double_dispatch_rides=${doubles}`);

  const pass = doubles === 0;
  console.log(pass ? 'RESULT: PASS (zero double-dispatch)' : 'RESULT: FAIL');

  // cleanup geo keys for test drivers
  for (const id of drivers) {
    await redis.zrem(REALTIME.GEO_DRIVERS, id);
  }

  await disconnectRedis();
  await disconnectDatabase();
  process.exit(pass ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await disconnectRedis();
    await disconnectDatabase();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
