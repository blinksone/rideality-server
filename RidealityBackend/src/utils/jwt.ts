import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';
import { ActiveMode, PlatformRole } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string;
  roles: PlatformRole[];
  regionId: string;
  activeMode: ActiveMode;
  sessionId: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(userId: string, sessionId: string): string {
  return jwt.sign({ sub: userId, sessionId, type: 'refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): { sub: string; sessionId: string } {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as {
    sub: string;
    sessionId: string;
    type: string;
  };
  if (payload.type !== 'refresh') {
    throw new Error('Invalid refresh token');
  }
  return { sub: payload.sub, sessionId: payload.sessionId };
}

export function newSessionId(): string {
  return uuidv4();
}

export function refreshTokenExpiresAt(): Date {
  const days = env.JWT_REFRESH_EXPIRES_IN.endsWith('d')
    ? parseInt(env.JWT_REFRESH_EXPIRES_IN, 10)
    : 30;
  const expires = new Date();
  expires.setDate(expires.getDate() + days);
  return expires;
}

export function accessTokenExpiresInSeconds(): number {
  const value = env.JWT_ACCESS_EXPIRES_IN;
  if (value.endsWith('m')) return parseInt(value, 10) * 60;
  if (value.endsWith('h')) return parseInt(value, 10) * 3600;
  if (value.endsWith('d')) return parseInt(value, 10) * 86400;
  return 900;
}
