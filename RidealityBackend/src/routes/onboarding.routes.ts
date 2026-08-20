import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { sendSuccess } from '../utils/response';
import {
  passengerOnboardingSchema,
  driverOnboardingSchema,
} from '../validators/onboarding.validator';
import * as onboardingProfileService from '../services/onboarding-profile.service';

const router = Router();

router.use(authenticate);

/**
 * POST /api/v1/onboarding/passenger
 * Complete passenger signup profile (after OTP). Phone comes from token.
 */
router.post(
  '/passenger',
  validate(passengerOnboardingSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await onboardingProfileService.completePassengerOnboarding(
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
 * POST /api/v1/onboarding/driver
 * Complete driver signup profile (after OTP). Vehicle/docs come next.
 */
router.post(
  '/driver',
  validate(driverOnboardingSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await onboardingProfileService.completeDriverOnboarding(
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
 * GET /api/v1/onboarding/status
 * Wizard progress + capabilities (no "me" in path).
 */
router.get('/status', async (req: AuthRequest, res, next) => {
  try {
    const data = await onboardingProfileService.getOnboardingStatus(req.user!.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

export default router;
