import { env, isRemoteWalletWriter } from '../config/env';
import { logger } from '../lib/logger';
import { AppError } from '../utils/errors';
import * as walletService from '../services/wallet.service';
import * as financeService from '../services/finance.service';

function financeBaseUrl(): string {
  const url =
    env.FINANCE_SERVICE_URL ||
    process.env.FINANCE_SERVICE_URL ||
    'http://127.0.0.1:3004';
  return url.replace(/\/$/, '');
}

async function financeFetch<T>(path: string, init: RequestInit): Promise<T> {
  const url = `${financeBaseUrl()}${env.API_PREFIX}/internal/finance${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Service-Secret': env.INTERNAL_SERVICE_SECRET,
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  } catch (err) {
    logger.error('Finance service unreachable', {
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new AppError(502, 'FINANCE_UNAVAILABLE', 'Finance service is unavailable');
  }

  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    data?: T;
    error?: { code?: string; message?: string; details?: Record<string, unknown> };
  };

  if (!res.ok || body.success === false) {
    throw new AppError(
      res.status >= 400 && res.status < 600 ? res.status : 502,
      body.error?.code ?? 'FINANCE_ERROR',
      body.error?.message ?? 'Finance service request failed',
      body.error?.details,
    );
  }

  return body.data as T;
}

/** Ensure a user wallet exists (local in monolith/finance; HTTP from other services). */
export async function ensureUserWallet(userId: string, currency: string) {
  if (!isRemoteWalletWriter()) {
    return walletService.ensureUserWallet(userId, currency);
  }
  return financeFetch('/wallets/user', {
    method: 'POST',
    body: JSON.stringify({ userId, currency }),
  });
}

/** Ensure a fleet wallet exists. */
export async function ensureFleetWallet(
  fleetCompanyId: string,
  regionId: string,
  currency: string,
) {
  if (!isRemoteWalletWriter()) {
    return walletService.ensureFleetWallet(fleetCompanyId, regionId, currency);
  }
  return financeFetch('/wallets/fleet', {
    method: 'POST',
    body: JSON.stringify({ fleetCompanyId, regionId, currency }),
  });
}

/** Apply a financial penalty (admin → finance ownership). */
export async function applyWalletPenalty(
  actorId: string,
  userId: string,
  amount: number,
  reason: string,
  ipAddress?: string,
) {
  if (!isRemoteWalletWriter()) {
    return financeService.applyWalletPenalty(actorId, userId, amount, reason, ipAddress);
  }
  return financeFetch('/penalties', {
    method: 'POST',
    body: JSON.stringify({ actorId, userId, amount, reason, ipAddress }),
  });
}

/** Complete-trip fare capture (always via finance ownership layer). */
export async function captureRideFare(input: {
  rideId: string;
  passengerUserId: string;
  driverUserId: string;
  amount: number;
  currency: string;
}) {
  if (!isRemoteWalletWriter()) {
    return financeService.captureRideFare(input);
  }
  return financeFetch('/rides/capture', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Cancel/refund of a captured ride (finance only). */
export async function refundRidePayment(input: {
  rideId: string;
  passengerUserId: string;
  amount: number;
  currency: string;
  actorUserId?: string;
}) {
  if (!isRemoteWalletWriter()) {
    return financeService.refundRidePayment(input);
  }
  return financeFetch('/rides/refund', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
