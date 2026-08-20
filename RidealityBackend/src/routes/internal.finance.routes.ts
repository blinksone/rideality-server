import { Router } from 'express';
import { z } from 'zod';
import { requireInternalService } from '../middleware/internalAuth';
import { validate } from '../middleware/validate';
import { sendSuccess } from '../utils/response';
import { ensureFleetWallet, ensureUserWallet, formatWallet } from '../services/wallet.service';
import {
  applyWalletPenalty,
  captureRideFare,
  refundRidePayment,
} from '../services/finance.service';
import { prisma } from '../lib/prisma';

const router = Router();

router.use(requireInternalService);

const ensureUserWalletSchema = z.object({
  userId: z.string().uuid(),
  currency: z.string().min(3).max(8),
});

const ensureFleetWalletSchema = z.object({
  fleetCompanyId: z.string().uuid(),
  regionId: z.string().uuid(),
  currency: z.string().min(3).max(8),
});

const penaltySchema = z.object({
  actorId: z.string().uuid(),
  userId: z.string().uuid(),
  amount: z.number().positive().max(1_000_000),
  reason: z.string().min(1).max(2000),
  ipAddress: z.string().max(64).optional(),
});

const rideCaptureSchema = z.object({
  rideId: z.string().uuid(),
  passengerUserId: z.string().uuid(),
  driverUserId: z.string().uuid(),
  amount: z.number().positive().max(1_000_000),
  currency: z.string().min(3).max(8),
});

const rideRefundSchema = z.object({
  rideId: z.string().uuid(),
  passengerUserId: z.string().uuid(),
  amount: z.number().positive().max(1_000_000),
  currency: z.string().min(3).max(8),
  actorUserId: z.string().uuid().optional(),
});

/**
 * Phase 2 — finance-service is the sole mutator of wallets.
 * Other domain services call these endpoints instead of Prisma wallet writes.
 */
router.post('/wallets/user', validate(ensureUserWalletSchema), async (req, res, next) => {
  try {
    const { userId, currency } = req.body as z.infer<typeof ensureUserWalletSchema>;
    const wallet = await ensureUserWallet(userId, currency);
    const full = await prisma.wallet.findUniqueOrThrow({
      where: { id: wallet.id },
      include: {
        user: { include: { profile: true } },
        fleetCompany: { include: { region: { select: { code: true, name: true } } } },
        region: { select: { id: true, code: true, name: true } },
      },
    });
    sendSuccess(res, formatWallet(full), 201);
  } catch (err) {
    next(err);
  }
});

router.post('/wallets/fleet', validate(ensureFleetWalletSchema), async (req, res, next) => {
  try {
    const { fleetCompanyId, regionId, currency } = req.body as z.infer<
      typeof ensureFleetWalletSchema
    >;
    const wallet = await ensureFleetWallet(fleetCompanyId, regionId, currency);
    const full = await prisma.wallet.findUniqueOrThrow({
      where: { id: wallet.id },
      include: {
        user: { include: { profile: true } },
        fleetCompany: { include: { region: { select: { code: true, name: true } } } },
        region: { select: { id: true, code: true, name: true } },
      },
    });
    sendSuccess(res, formatWallet(full), 201);
  } catch (err) {
    next(err);
  }
});

router.post('/penalties', validate(penaltySchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof penaltySchema>;
    const data = await applyWalletPenalty(
      body.actorId,
      body.userId,
      body.amount,
      body.reason,
      body.ipAddress,
    );
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.post('/rides/capture', validate(rideCaptureSchema), async (req, res, next) => {
  try {
    const data = await captureRideFare(req.body as z.infer<typeof rideCaptureSchema>);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.post('/rides/refund', validate(rideRefundSchema), async (req, res, next) => {
  try {
    const data = await refundRidePayment(req.body as z.infer<typeof rideRefundSchema>);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

export default router;
