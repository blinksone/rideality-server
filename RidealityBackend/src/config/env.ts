import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

/** Strip accidental CRLF / surrounding whitespace (Windows-edited .env can poison process.env). */
function sanitizeEnv(raw: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value == null) {
      out[key] = value;
      continue;
    }
    out[key] = value.replace(/\r/g, '').trim();
  }
  return out;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_PREFIX: z.string().default('/api/v1'),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  OTP_LENGTH: z.coerce.number().default(6),
  OTP_EXPIRES_SECONDS: z.coerce.number().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(3),
  OTP_DEV_BYPASS_CODE: z.string().default('123456'),
  OTP_ALLOW_BYPASS: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  OTP_RETURN_CODE: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  OTP_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  OTP_RATE_LIMIT_MAX: z.coerce.number().default(5),
  DEFAULT_REGION_CODE: z.string().default('PK'),
  UPLOAD_PROVIDER: z.enum(['local', 's3']).default('local'),
  UPLOAD_LOCAL_PATH: z.string().default('./uploads'),
  LOG_PATH: z.string().default('./logs'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
  LOG_MAX_FILES: z.string().default('14d'),
  LOG_ZIP_ARCHIVE: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  ADMIN_EMAIL: z.string().default('admin@rideality.com'),
  ADMIN_PASSWORD: z.string().default('Admin@123456'),
  /** Shared secret for service-to-service calls (phase 2 finance ownership). */
  INTERNAL_SERVICE_SECRET: z.string().min(16).default('rideality-internal-dev-secret'),
  /** Override finance base URL for internal wallet APIs. Falls back to FINANCE_SERVICE_URL / :3004. */
  FINANCE_SERVICE_URL: z.string().optional(),
  /**
   * Force remote wallet writes even in monolith process.
   * When unset: remote only if SERVICE_NAME is a non-finance domain service.
   */
  WALLET_WRITES_VIA_HTTP: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  /** Absolute path to Firebase service-account JSON (FCM). Optional — push disabled if unset/missing. */
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),
  /** Server-side Google Places / Geocoding key. Never ship this to Flutter. */
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  GOOGLE_PLACES_COUNTRY: z.string().default('pk'),
  GOOGLE_PLACES_LANGUAGE: z.string().default('en'),
});

const parsed = envSchema.safeParse(sanitizeEnv(process.env));

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const isDev = env.NODE_ENV === 'development';
export const otpBypassEnabled = isDev || env.OTP_ALLOW_BYPASS;

/** Domain services that must call finance over HTTP for wallet mutations. */
export function isRemoteWalletWriter(): boolean {
  const sn = (process.env.SERVICE_NAME || '').toLowerCase();
  if (sn === 'finance') return false;
  if (env.WALLET_WRITES_VIA_HTTP) return true;
  if (!sn || sn === 'monolith' || sn === 'gateway') return false;
  return ['auth', 'users', 'fleet', 'admin'].includes(sn);
}

/** Only finance-service (or modular monolith) may perform balance mutations locally. */
export function canMutateWalletsLocally(): boolean {
  const sn = (process.env.SERVICE_NAME || '').toLowerCase();
  if (!sn || sn === 'monolith') return true;
  return sn === 'finance';
}
