import Redis from 'ioredis';
import { env } from '../config/env';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

export async function connectRedis(): Promise<void> {
  if (redis.status === 'ready') return;
  await redis.connect();
}

export async function disconnectRedis(): Promise<void> {
  if (redis.status === 'end') return;
  await redis.quit();
}

export const RedisKeys = {
  otp: (phone: string, regionId: string) => `otp:${regionId}:${phone}`,
  otpAttempts: (phone: string, regionId: string) => `otp_attempts:${regionId}:${phone}`,
  otpRateLimit: (phone: string) => `otp_rate:${phone}`,
  driverOnline: (userId: string) => `driver:online:${userId}`,
  driverLocation: (userId: string) => `driver:location:${userId}`,
};
