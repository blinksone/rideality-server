/**
 * Shared Redis channel names for API ↔ ws-gateway (and multi-instance).
 * Key prefixes keep real-time traffic distinct from OTP keys.
 */
export const REALTIME = {
  /** Redis Pub/Sub channel for domain events to sockets */
  DOMAIN_CHANNEL: 'rideality:domain',
  GEO_DRIVERS: 'drivers:online',
  driverMeta: (driverId: string) => `driver:${driverId}:meta`,
  offerLock: (driverId: string) => `driver:${driverId}:offer_lock`,
  STALE_MS: 30_000,
  OFFER_LOCK_MS: 20_000,
  OFFER_TIMEOUT_MS: 18_000,
  SEARCH_RADIUS_KM: 5,
  SEARCH_RADIUS_EXPAND_KM: 10,
  SEARCH_COUNT: 10,
  AVG_URBAN_SPEED_MPS: 8.3, // ~30 km/h straight-line ETA heuristic
} as const;

export type DomainEventType =
  | 'ride.status_changed'
  | 'dispatch.offer'
  | 'dispatch.response'
  | 'driver.location'
  | 'ride.location_broadcast'
  | 'dispatch.no_drivers';

export interface DomainEvent {
  type: DomainEventType;
  at: string;
  payload: Record<string, unknown>;
}

export function rideRoom(rideId: string) {
  return `ride:${rideId}`;
}

export function driverRoom(driverId: string) {
  return `driver:${driverId}`;
}
