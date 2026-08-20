import {
  ActiveMode,
  FleetCompanyStatus,
  FleetMemberStatus,
  PlatformRole,
  UserStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env, otpBypassEnabled } from '../config/env';
import { hashToken, verifyPassword, hashPassword } from '../utils/crypto';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  newSessionId,
  refreshTokenExpiresAt,
  accessTokenExpiresInSeconds,
} from '../utils/jwt';
import { sendOtp, verifyOtp } from './otp.service';
import { normalizePhone, isValidE164 } from '../utils/phone';
import { UnauthorizedError, ValidationError } from '../utils/errors';
import { canAccessPortal, canAccessPortalAsync } from './portal.service';
import { computeOnboarding } from './onboarding.service';
import { ensureUserWallet } from '../clients/finance.client';
import { registerFcmToken as userServiceRegisterFcm } from './user.service';
import { logger } from '../lib/logger';

const PLATFORM_PORTAL_ROLES: PlatformRole[] = [
  PlatformRole.SUPER_ADMIN,
  PlatformRole.SUB_ADMIN,
  PlatformRole.ADMIN,
  PlatformRole.FINANCE_OFFICER,
];

/** Fleet staff may only sign in when they have at least one active fleet company. */
async function assertFleetPortalLoginAllowed(userId: string, roles: PlatformRole[]) {
  if (roles.some((r) => PLATFORM_PORTAL_ROLES.includes(r))) return;

  const [memberships, owned] = await Promise.all([
    prisma.fleetMembership.findMany({
      where: { userId, status: FleetMemberStatus.active },
      select: {
        fleetCompany: { select: { id: true, status: true, statusReason: true, legalName: true } },
      },
    }),
    prisma.fleetCompany.findMany({
      where: { ownerUserId: userId },
      select: { id: true, status: true, statusReason: true, legalName: true },
    }),
  ]);

  const byId = new Map<
    string,
    { id: string; status: FleetCompanyStatus; statusReason: string | null; legalName: string }
  >();
  for (const m of memberships) byId.set(m.fleetCompany.id, m.fleetCompany);
  for (const c of owned) byId.set(c.id, c);

  const companies = Array.from(byId.values());
  if (!companies.length) return;

  if (companies.some((c) => c.status === FleetCompanyStatus.active)) return;

  const suspended = companies.find((c) => c.status === FleetCompanyStatus.suspended);
  if (suspended) {
    const reason = suspended.statusReason?.trim();
    throw new UnauthorizedError(
      reason
        ? `Your fleet "${suspended.legalName}" is suspended: ${reason}`
        : `Your fleet "${suspended.legalName}" is suspended. Contact Rideality support.`,
      'FLEET_SUSPENDED',
    );
  }

  const pending = companies.find((c) => c.status === FleetCompanyStatus.pending);
  if (pending) {
    const reason = pending.statusReason?.trim();
    throw new UnauthorizedError(
      reason
        ? `Your fleet "${pending.legalName}" is pending approval: ${reason}`
        : `Your fleet "${pending.legalName}" is pending approval and cannot sign in yet.`,
      'FLEET_PENDING',
    );
  }

  throw new UnauthorizedError('No active fleet company available for login', 'FLEET_INACTIVE');
}

async function getDefaultRegion() {
  const region = await prisma.region.findFirst({
    where: { code: env.DEFAULT_REGION_CODE, isActive: true },
  });
  if (!region) {
    throw new Error('Default region not configured. Run db:seed first.');
  }
  return region;
}

async function ensureUserProfiles(userId: string, tx: Prisma.TransactionClient = prisma) {
  await tx.userProfile.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  await tx.passengerProfile.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  await tx.notificationPreference.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

async function issueTokens(userId: string, regionId: string, activeMode: ActiveMode, roles: PlatformRole[]) {
  const sessionId = newSessionId();
  const refreshToken = signRefreshToken(userId, sessionId);
  const refreshHash = hashToken(refreshToken);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: refreshHash,
      expiresAt: refreshTokenExpiresAt(),
    },
  });

  const accessToken = signAccessToken({
    sub: userId,
    roles,
    regionId,
    activeMode,
    sessionId,
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: accessTokenExpiresInSeconds(),
    sessionId,
  };
}

export async function requestOtp(phone: string, regionCode?: string) {
  const normalized = normalizePhone(phone);
  if (!isValidE164(normalized)) {
    throw new ValidationError('Invalid phone number. Use E.164 format e.g. +923001234567');
  }

  const region = regionCode
    ? await prisma.region.findUnique({ where: { code: regionCode } })
    : await getDefaultRegion();

  if (!region) {
    throw new ValidationError('Invalid region code');
  }

  const code = await sendOtp(normalized, region.id);
  // Dev/test only: never expose OTP in production responses.
  const debugExtras =
    env.NODE_ENV !== 'production'
      ? {
          debugOtp: code,
          ...(otpBypassEnabled ? { devBypassCode: env.OTP_DEV_BYPASS_CODE } : {}),
          ...(env.OTP_RETURN_CODE || env.NODE_ENV === 'development' || env.NODE_ENV === 'test'
            ? { otpCode: code }
            : {}),
        }
      : {};

  return {
    phone: normalized,
    regionCode: region.code,
    message: 'OTP sent successfully',
    ...debugExtras,
  };
}

export async function verifyOtpAndLogin(
  phone: string,
  code: string,
  regionCode?: string,
  device?: { fcmToken?: string; platform?: string; deviceName?: string },
) {
  const normalized = normalizePhone(phone);
  const region = regionCode
    ? await prisma.region.findUnique({ where: { code: regionCode } })
    : await getDefaultRegion();

  if (!region) {
    throw new ValidationError('Invalid region code');
  }

  const valid = await verifyOtp(normalized, region.id, code);
  if (!valid) {
    throw new UnauthorizedError('Invalid or expired OTP', 'INVALID_OTP');
  }

  let user = await prisma.user.findUnique({
    where: { phone_regionId: { phone: normalized, regionId: region.id } },
    include: {
      platformRoles: true,
      profile: true,
      passengerProfile: true,
      driverProfile: { include: { vehicle: true } },
    },
  });

  let isNewUser = false;

  if (user) {
    if (user.status === UserStatus.BANNED || user.deletedAt) {
      throw new UnauthorizedError('Account is not active');
    }
  }

  if (!user) {
    isNewUser = true;
    user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          phone: normalized,
          phoneVerifiedAt: new Date(),
          status: UserStatus.PHONE_VERIFIED,
          regionId: region.id,
          platformRoles: {
            create: { role: PlatformRole.CUSTOMER },
          },
        },
        include: {
          platformRoles: true,
          profile: true,
          passengerProfile: true,
          driverProfile: { include: { vehicle: true } },
        },
      });

      await ensureUserProfiles(created.id, tx);
      return created;
    });
    // Phase 2: wallet is owned by finance-service (HTTP or local adapter).
    await ensureUserWallet(user.id, region.currency);
  } else {
    if (!user.phoneVerifiedAt) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          phoneVerifiedAt: new Date(),
          status:
            user.status === UserStatus.REGISTERED
              ? UserStatus.PHONE_VERIFIED
              : user.status,
        },
        include: {
          platformRoles: true,
          profile: true,
          passengerProfile: true,
          driverProfile: { include: { vehicle: true } },
        },
      });

      const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
      if (!wallet) {
        await ensureUserWallet(user.id, region.currency);
      }
    }
  }

  let deviceId: string | undefined;
  if (device?.fcmToken) {
    try {
      const reg = await userServiceRegisterFcm(user.id, {
        fcmToken: device.fcmToken,
        platform: device.platform,
        deviceName: device.deviceName,
      });
      deviceId = reg.deviceId;
    } catch (err) {
      logger.warn('FCM register during OTP login failed', {
        userId: user.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const roles = user.platformRoles.map((r) => r.role);
  const tokens = await issueTokens(user.id, user.regionId, user.activeMode, roles);
  const onboarding = await computeOnboarding(user.id);

  return {
    ...tokens,
    isNewUser,
    deviceId,
    user: {
      id: user.id,
      phone: user.phone,
      email: user.email,
      status: user.status,
      activeMode: user.activeMode,
      regionId: user.regionId,
      onboarding,
    },
  };
}

export async function refreshAccessToken(refreshToken: string) {
  let payload: { sub: string; sessionId: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new UnauthorizedError('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  }

  const tokenHash = hashToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: { include: { platformRoles: true } } },
  });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new UnauthorizedError('Refresh token expired or revoked', 'INVALID_REFRESH_TOKEN');
  }

  const user = stored.user;
  if (user.status === 'BANNED' || user.deletedAt) {
    throw new UnauthorizedError('Account is not active');
  }

  const roles = user.platformRoles.map((r) => r.role);
  const accessToken = signAccessToken({
    sub: user.id,
    roles,
    regionId: user.regionId,
    activeMode: user.activeMode,
    sessionId: payload.sessionId,
  });

  return {
    accessToken,
    expiresIn: accessTokenExpiresInSeconds(),
  };
}

export async function logout(userId: string, refreshToken?: string) {
  if (refreshToken) {
    const tokenHash = hashToken(refreshToken);
    await prisma.refreshToken.updateMany({
      where: { userId, tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return;
  }

  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeSession(userId: string, sessionId: string) {
  await prisma.refreshToken.updateMany({
    where: { id: sessionId, userId },
    data: { revokedAt: new Date() },
  });
}

export async function adminLogin(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { platformRoles: true },
  });

  if (!user || !user.passwordHash) {
    throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS');
  }

  const roles = user.platformRoles.map((r) => r.role);

  const allowed = await canAccessPortalAsync(user.id, roles);
  if (!allowed) {
    throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS');
  }

  if (user.status === 'BANNED' || user.deletedAt) {
    throw new UnauthorizedError('Account is not active');
  }

  await assertFleetPortalLoginAllowed(user.id, roles);

  const tokens = await issueTokens(user.id, user.regionId, user.activeMode, roles);

  return {
    ...tokens,
    mustResetPassword: user.mustResetPassword,
    user: {
      id: user.id,
      email: user.email,
      roles,
      mustResetPassword: user.mustResetPassword,
    },
  };
}

export async function changeAdminPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  if (currentPassword === newPassword) {
    throw new ValidationError('New password must be different from the current password');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.passwordHash) {
    throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS');
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Current password is incorrect', 'INVALID_CREDENTIALS');
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, mustResetPassword: false },
  });

  return { message: 'Password updated successfully' };
}

export async function hashAndStorePassword(userId: string, password: string) {
  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, mustResetPassword: false },
  });
}
