import { env, isDev, otpBypassEnabled } from '../config/env';
import { logger } from '../lib/logger';
import { redis, RedisKeys } from '../lib/redis';
import { generateOtp } from '../utils/crypto';
import { TooManyRequestsError } from '../utils/errors';

export async function sendOtp(phone: string, regionId: string): Promise<string> {
  const rateKey = RedisKeys.otpRateLimit(phone);
  const count = await redis.incr(rateKey);
  if (count === 1) {
    await redis.pexpire(rateKey, env.OTP_RATE_LIMIT_WINDOW_MS);
  }
  if (count > env.OTP_RATE_LIMIT_MAX) {
    throw new TooManyRequestsError('OTP rate limit exceeded. Try again later.');
  }

  const code = generateOtp(env.OTP_LENGTH);
  const key = RedisKeys.otp(phone, regionId);
  const attemptsKey = RedisKeys.otpAttempts(phone, regionId);

  await redis.setex(key, env.OTP_EXPIRES_SECONDS, code);
  await redis.setex(attemptsKey, env.OTP_EXPIRES_SECONDS, '0');

  // In production, integrate Twilio / SNS / local SMS provider
  if (isDev || env.OTP_RETURN_CODE) {
    logger.info('OTP sent (dev/demo)', { phone, code });
  } else {
    logger.info('OTP sent', { phone });
  }

  return code;
}

export async function verifyOtp(
  phone: string,
  regionId: string,
  code: string,
): Promise<boolean> {
  if (otpBypassEnabled && code === env.OTP_DEV_BYPASS_CODE) {
    return true;
  }

  const key = RedisKeys.otp(phone, regionId);
  const attemptsKey = RedisKeys.otpAttempts(phone, regionId);

  const stored = await redis.get(key);
  if (!stored) {
    return false;
  }

  const attempts = parseInt((await redis.get(attemptsKey)) ?? '0', 10);
  if (attempts >= env.OTP_MAX_ATTEMPTS) {
    await redis.del(key, attemptsKey);
    return false;
  }

  if (stored !== code) {
    await redis.incr(attemptsKey);
    return false;
  }

  await redis.del(key, attemptsKey);
  return true;
}
