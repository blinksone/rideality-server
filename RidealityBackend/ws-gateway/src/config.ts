import dotenv from 'dotenv';
import path from 'path';

// Prefer monorepo backend .env when run from sibling path
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

export const wsEnv = {
  PORT: Number(process.env.WS_PORT || process.env.PORT || 3100),
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || '',
  DOMAIN_CHANNEL: process.env.DOMAIN_CHANNEL || 'rideality:domain',
  CORS_ORIGIN: process.env.WS_CORS_ORIGIN || '*',
  API_URL: process.env.API_URL || process.env.REST_API_URL || 'http://127.0.0.1:3000',
  API_PREFIX: process.env.API_PREFIX || '/api/v1',
};

if (!wsEnv.JWT_ACCESS_SECRET || wsEnv.JWT_ACCESS_SECRET.length < 16) {
  console.error('JWT_ACCESS_SECRET is required (same secret as REST API)');
  process.exit(1);
}
