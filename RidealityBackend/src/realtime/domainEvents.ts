import { EventEmitter } from 'events';
import { redis } from '../lib/redis';
import { logger } from '../lib/logger';
import { REALTIME, type DomainEvent } from './constants';

const CHANNEL = REALTIME.DOMAIN_CHANNEL;

/** In-process bus (monolith hooks / tests). */
export const domainEmitter = new EventEmitter();
domainEmitter.setMaxListeners(50);

let pubSubReady = false;

/**
 * Publish a domain event to Redis (ws-gateway subscribers) and in-process emitters.
 */
export async function publishDomainEvent(event: DomainEvent): Promise<void> {
  domainEmitter.emit(event.type, event);
  domainEmitter.emit('*', event);

  try {
    await redis.publish(CHANNEL, JSON.stringify(event));
  } catch (err) {
    logger.warn('Failed to publish domain event to Redis', {
      type: event.type,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function makeEvent(
  type: DomainEvent['type'],
  payload: Record<string, unknown>,
): DomainEvent {
  return { type, at: new Date().toISOString(), payload };
}

/** Optional subscriber helpers for co-located consumers (tests). */
export function onDomainEvent(
  type: DomainEvent['type'] | '*',
  handler: (event: DomainEvent) => void,
): () => void {
  domainEmitter.on(type, handler);
  return () => domainEmitter.off(type, handler);
}

export async function ensureRedisPubReady(): Promise<void> {
  if (pubSubReady) return;
  if (redis.status !== 'ready') {
    await redis.connect().catch(() => undefined);
  }
  pubSubReady = true;
}

export { CHANNEL as DOMAIN_REDIS_CHANNEL };
