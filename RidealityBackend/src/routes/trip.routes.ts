import { Router } from 'express';
import { z } from 'zod';
import { PlatformRole } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { sendSuccess } from '../utils/response';
import { param } from '../utils/params';
import * as tripService from '../services/trip.service';
import { recordDispatchResponse } from '../services/dispatch.service';
import { transitionRide } from '../services/tripStateMachine.service';
import * as cargoService from '../services/cargo.service';

const router = Router();

const createTripSchema = z.object({
  pickupLat: z.number().min(-90).max(90),
  pickupLng: z.number().min(-180).max(180),
  dropoffLat: z.number().min(-90).max(90),
  dropoffLng: z.number().min(-180).max(180),
  pickupAddress: z.string().max(500).optional(),
  dropoffAddress: z.string().max(500).optional(),
  vehicleType: z.string().max(32).optional(),
  currency: z.string().min(3).max(8).optional(),
  bookingType: z.enum(['ride', 'cargo']).optional(),
  cargoWeightKg: z.number().positive().max(50000).optional(),
  cargoDescription: z.string().max(500).optional(),
  cargoSizeTier: z.string().max(32).optional(),
  dropoffProofType: z.enum(['otp', 'photo']).optional(),
});

const proofBodySchema = z
  .object({
    photoUrl: z.string().min(1).max(500).optional(),
    otp: z.string().min(4).max(12).optional(),
  })
  .refine((b) => Boolean(b.photoUrl || b.otp), {
    message: 'Provide photoUrl and/or otp',
  });

const cancelSchema = z.object({
  reason: z.string().max(500).optional(),
});

const statusSchema = z.object({
  status: z.enum([
    'accepted',
    'driver_en_route',
    'arrived',
    'picked_up',
    'completed',
    'cancelled',
  ]),
});

const dispatchResponseSchema = z.object({
  accepted: z.boolean(),
});

function isAdmin(roles: PlatformRole[] = []) {
  return roles.some(
    (r) =>
      r === PlatformRole.ADMIN ||
      r === PlatformRole.SUPER_ADMIN ||
      r === PlatformRole.SUPPORT_AGENT,
  );
}

router.use(authenticate);

/** POST /trips — create REQUESTED ride + async dispatch */
router.post('/', validate(createTripSchema), async (req: AuthRequest, res, next) => {
  try {
    const data = await tripService.createTrip(req.user!.sub, req.body);
    sendSuccess(res, data, 201);
  } catch (err) {
    next(err);
  }
});

/** GET /trips/:id */
router.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const data = await tripService.getTrip(
      param(req.params.id),
      req.user!.sub,
      isAdmin(req.user!.platformRoles),
    );
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

/** POST /trips/:id/cancel */
router.post('/:id/cancel', validate(cancelSchema), async (req: AuthRequest, res, next) => {
  try {
    const data = await tripService.cancelTrip(
      param(req.params.id),
      req.user!.sub,
      req.body.reason,
      isAdmin(req.user!.platformRoles),
    );
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /trips/:id/status — driver advances FSM
 * (e.g. driver_en_route, arrived, picked_up, completed)
 * Cargo: picked_up / completed rejected without proof records.
 */
router.post('/:id/status', validate(statusSchema), async (req: AuthRequest, res, next) => {
  try {
    const data = await tripService.advanceTripStatus(
      param(req.params.id),
      req.user!.sub,
      req.body.status,
    );
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

/** Alias cargo proof endpoints on /trips/:id/proof/* (also /bookings/:id/proof/*). */
router.post(
  '/:id/proof/pickup',
  validate(proofBodySchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await cargoService.submitPickupProof(
        param(req.params.id),
        req.user!.sub,
        req.body,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/proof/dropoff',
  validate(proofBodySchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await cargoService.submitDropoffProof(
        param(req.params.id),
        req.user!.sub,
        req.body,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /trips/:id/dispatch-response — REST fallback for offer accept/decline
 * (ws-gateway also routes here via shared Redis wait keys)
 */
router.post(
  '/:id/dispatch-response',
  validate(dispatchResponseSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const rideId = param(req.params.id);
      await recordDispatchResponse(rideId, req.user!.sub, req.body.accepted);
      // Optimistic accept path also runs in wait loop; if already accepted elsewhere, FSM is idempotent
      if (req.body.accepted) {
        // transition happens inside dispatch wait loop to prevent races
      }
      sendSuccess(res, { rideId, accepted: req.body.accepted, recorded: true });
    } catch (err) {
      next(err);
    }
  },
);

/** GET /trips/:id/dispatch-log — admin/debug audit */
router.get('/:id/dispatch-log', async (req: AuthRequest, res, next) => {
  try {
    if (!isAdmin(req.user!.platformRoles)) {
      // parties may view their own trip's log for transparency
      await tripService.getTrip(param(req.params.id), req.user!.sub, false);
    }
    const data = await tripService.getTripDispatchLog(param(req.params.id));
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

/** Internal: explicit transition for tests/ops */
router.post('/:id/transition', validate(statusSchema), async (req: AuthRequest, res, next) => {
  try {
    if (!isAdmin(req.user!.platformRoles)) {
      const data = await tripService.advanceTripStatus(
        param(req.params.id),
        req.user!.sub,
        req.body.status,
      );
      sendSuccess(res, data);
      return;
    }
    const result = await transitionRide(param(req.params.id), req.body.status, {
      actorUserId: req.user!.sub,
    });
    sendSuccess(res, tripService.formatTrip(result.ride));
  } catch (err) {
    next(err);
  }
});

export default router;
