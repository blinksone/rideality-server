import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { sendSuccess } from '../utils/response';
import * as userService from '../services/user.service';
import { serviceModesSchema } from '../validators/user.validator';

/**
 * Driver-facing routes under /api/v1/drivers/*
 * Spec: PATCH /drivers/me/service-modes
 */
const router = Router();
router.use(authenticate);

router.patch(
  '/me/service-modes',
  validate(serviceModesSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await userService.setDriverServiceModes(req.user!.sub, req.body.modes);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.get('/me', async (req: AuthRequest, res, next) => {
  try {
    const data = await userService.getDriverView(req.user!.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

export default router;
