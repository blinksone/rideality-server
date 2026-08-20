import { Router } from 'express';
import { validate } from '../middleware/validate';
import { sendSuccess } from '../utils/response';
import { param } from '../utils/params';
import {
  sendOtpSchema,
  verifyOtpSchema,
  refreshTokenSchema,
  adminLoginSchema,
  logoutSchema,
  changeAdminPasswordSchema,
} from '../validators/auth.validator';
import * as authService from '../services/auth.service';
import * as regionService from '../services/region.service';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/otp/send', validate(sendOtpSchema), async (req, res, next) => {
  try {
    const result = await authService.requestOtp(req.body.phone, req.body.regionCode);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

router.get('/regions', async (_req, res, next) => {
  try {
    const data = await regionService.listActiveRegions();
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.post('/otp/verify', validate(verifyOtpSchema), async (req, res, next) => {
  try {
    const result = await authService.verifyOtpAndLogin(
      req.body.phone,
      req.body.code,
      req.body.regionCode,
      {
        fcmToken: req.body.fcmToken,
        platform: req.body.platform,
        deviceName: req.body.deviceName,
      },
    );
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', validate(refreshTokenSchema), async (req, res, next) => {
  try {
    const result = await authService.refreshAccessToken(req.body.refreshToken);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

router.post('/logout', authenticate, validate(logoutSchema), async (req: AuthRequest, res, next) => {
  try {
    await authService.logout(req.user!.sub, req.body.refreshToken);
    sendSuccess(res, { message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

router.delete('/sessions/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    await authService.revokeSession(req.user!.sub, param(req.params.id));
    sendSuccess(res, { message: 'Session revoked' });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/login', validate(adminLoginSchema), async (req, res, next) => {
  try {
    const result = await authService.adminLogin(req.body.email, req.body.password);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/admin/change-password',
  authenticate,
  validate(changeAdminPasswordSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const result = await authService.changeAdminPassword(
        req.user!.sub,
        req.body.currentPassword,
        req.body.newPassword,
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
