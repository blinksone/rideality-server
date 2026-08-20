import { redis } from '../lib/redis';
import { logger } from '../lib/logger';
import { REALTIME } from '../realtime/constants';
import { makeEvent, publishDomainEvent } from '../realtime/domainEvents';

export interface DriverLocationInput {
  driverId: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  vehicleType?: string;
  status?: string;
}

/**
 * Redis geo + meta for online drivers. Live GPS never touches SQL.
 */
export async function upsertDriverLocation(input: DriverLocationInput): Promise<void> {
  const { driverId, lat, lng } = input;
  const now = Date.now();

  // Redis GEO is lon, lat
  await redis.geoadd(REALTIME.GEO_DRIVERS, lng, lat, driverId);
  await redis.hset(REALTIME.driverMeta(driverId), {
    status: input.status ?? 'online',
    vehicleType: input.vehicleType ?? 'sedan',
    lastPing: String(now),
    lat: String(lat),
    lng: String(lng),
    heading: String(input.heading ?? 0),
    speed: String(input.speed ?? 0),
  });

  await publishDomainEvent(
    makeEvent('driver.location', {
      driverId,
      lat,
      lng,
      heading: input.heading ?? 0,
      speed: input.speed ?? 0,
    }),
  );
}

export async function markDriverOffline(driverId: string): Promise<void> {
  await redis.zrem(REALTIME.GEO_DRIVERS, driverId);
  await redis.hset(REALTIME.driverMeta(driverId), {
    status: 'offline',
    lastPing: String(Date.now()),
  });
}

export async function getDriverMeta(driverId: string): Promise<Record<string, string>> {
  return redis.hgetall(REALTIME.driverMeta(driverId));
}

export interface NearbyDriver {
  driverId: string;
  distanceMeters: number;
  vehicleType: string;
  status: string;
  lat: number;
  lng: number;
}

/**
 * GEOSEARCH nearby online drivers (sorted ascending by distance).
 */
export async function searchNearbyDrivers(
  lon: number,
  lat: number,
  radiusKm: number,
  count: number,
): Promise<NearbyDriver[]> {
  // ioredis: GEOSEARCH key FROMLONLAT lon lat BYRADIUS r km ASC COUNT n WITHDIST
  const raw = (await redis.call(
    'GEOSEARCH',
    REALTIME.GEO_DRIVERS,
    'FROMLONLAT',
    String(lon),
    String(lat),
    'BYRADIUS',
    String(radiusKm),
    'km',
    'ASC',
    'COUNT',
    String(count),
    'WITHDIST',
  )) as Array<[string, string]> | null;

  if (!raw?.length) return [];

  const results: NearbyDriver[] = [];
  for (const row of raw) {
    const driverId = row[0];
    const distKm = parseFloat(row[1]);
    const meta = await getDriverMeta(driverId);
    if (meta.status && meta.status !== 'online') continue;
    if (meta.lastPing && Date.now() - Number(meta.lastPing) > REALTIME.STALE_MS) continue;

    results.push({
      driverId,
      distanceMeters: Math.round(distKm * 1000),
      vehicleType: meta.vehicleType || 'sedan',
      status: meta.status || 'online',
      lat: Number(meta.lat) || lat,
      lng: Number(meta.lng) || lon,
    });
  }
  return results;
}

/**
 * Drop stale drivers from the geo index (lastPing older than STALE_MS).
 */
export async function sweepStaleDrivers(): Promise<number> {
  const members = await redis.zrange(REALTIME.GEO_DRIVERS, 0, -1);
  let removed = 0;
  const now = Date.now();
  for (const driverId of members) {
    const lastPing = await redis.hget(REALTIME.driverMeta(driverId), 'lastPing');
    if (!lastPing || now - Number(lastPing) > REALTIME.STALE_MS) {
      await markDriverOffline(driverId);
      removed += 1;
    }
  }
  if (removed > 0) {
    logger.info('Stale drivers swept', { removed });
  }
  return removed;
}

let sweepTimer: NodeJS.Timeout | null = null;

export function startLocationSweep(intervalMs = 15_000): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    sweepStaleDrivers().catch((err) =>
      logger.warn('Driver sweep failed', { error: err instanceof Error ? err.message : String(err) }),
    );
  }, intervalMs);
  sweepTimer.unref?.();
}

export function stopLocationSweep(): void {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}

/** Haversine straight-line distance meters. */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function etaSeconds(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const m = haversineMeters(fromLat, fromLng, toLat, toLng);
  return Math.max(30, Math.round(m / REALTIME.AVG_URBAN_SPEED_MPS));
}
