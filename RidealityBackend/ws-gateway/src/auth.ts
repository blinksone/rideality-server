import jwt from 'jsonwebtoken';
import { wsEnv } from './config';

export interface SocketUser {
  sub: string;
  roles: string[];
  regionId?: string;
  activeMode?: string;
  sessionId?: string;
}

export function verifyAccessToken(token: string): SocketUser {
  return jwt.verify(token, wsEnv.JWT_ACCESS_SECRET) as SocketUser;
}

export function extractToken(auth: unknown, headers: Record<string, unknown>): string | null {
  if (typeof auth === 'string' && auth.length > 10) return auth.replace(/^Bearer\s+/i, '');
  if (auth && typeof auth === 'object' && 'token' in auth) {
    return String((auth as { token: string }).token);
  }
  const h = headers.authorization || headers.Authorization;
  if (typeof h === 'string') return h.replace(/^Bearer\s+/i, '');
  return null;
}
