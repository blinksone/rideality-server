import { Router } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { sendSuccess } from '../utils/response';
import { param } from '../utils/params';
import * as cargoService from '../services/cargo.service';

/**
 * Booking/cargo proof routes under /api/v1/bookings/*
 * Spec:
 *   POST /bookings/:id/proof/pickup
 *   POST /bookings/:id/proof/dropoff
 */
const router = Router();
router.use(authenticate);

const proofBodySchema = z
  .object({
    photoUrl: z.string().min(1).max(500).optional(),
    otp: z.string().min(4).max(12).optional(),
  })
  .refine((b) => Boolean(b.photoUrl || b.otp), {
    message: 'Provide photoUrl and/or otp',
  });

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

export default router;
