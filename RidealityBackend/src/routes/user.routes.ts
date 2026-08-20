import { Router } from 'express';
import multer from 'multer';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { sendSuccess, sendPaginated } from '../utils/response';
import { param } from '../utils/params';
import { computeOnboarding } from '../services/onboarding.service';
import * as userService from '../services/user.service';
import * as passengerService from '../services/passenger.service';
import * as ratingService from '../services/rating.service';
import {
  updateProfileSchema,
  setModeSchema,
  locationsSchema,
  vehicleSchema,
  documentSchema,
  consentSchema,
  availabilitySchema,
  fcmTokenSchema,
  notificationPrefsSchema,
  reportUserSchema,
  rideHistoryQuerySchema,
  walletTxQuerySchema,
  ratingsQuerySchema,
  submitRatingSchema,
  serviceModesSchema,
} from '../validators/user.validator';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(authenticate);

// ─── Me ──────────────────────────────────────────────────────────────────────

router.get('/me', async (req: AuthRequest, res, next) => {
  try {
    const data = await userService.formatUserResponse(req.user!.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.patch('/me', validate(updateProfileSchema), async (req: AuthRequest, res, next) => {
  try {
    const data = await userService.updateProfile(req.user!.sub, req.body);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.post('/me/profile', validate(updateProfileSchema), async (req: AuthRequest, res, next) => {
  try {
    const data = await userService.updateProfile(req.user!.sub, req.body);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get('/me/onboarding', async (req: AuthRequest, res, next) => {
  try {
    const data = await computeOnboarding(req.user!.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.patch('/me/mode', validate(setModeSchema), async (req: AuthRequest, res, next) => {
  try {
    const data = await userService.setActiveMode(req.user!.sub, req.body.activeMode);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.post('/me/locations', validate(locationsSchema), async (req: AuthRequest, res, next) => {
  try {
    const data = await userService.saveLocations(req.user!.sub, req.body.locations);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.post('/me/consent', validate(consentSchema), async (req: AuthRequest, res, next) => {
  try {
    const data = await userService.recordConsent(req.user!.sub, req.body.consents);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.post('/me/photo', upload.single('photo'), async (req: AuthRequest, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'Photo file required' } });
      return;
    }
    const url = await userService.saveLocalUpload(req.file.originalname, req.file.buffer);
    const data = await userService.updatePhotoUrl(req.user!.sub, url);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get('/me/passenger', async (req: AuthRequest, res, next) => {
  try {
    const data = await userService.getPassengerView(req.user!.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get('/me/passenger/stats', async (req: AuthRequest, res, next) => {
  try {
    const data = await passengerService.getPassengerStats(req.user!.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.delete('/me/locations/:id', async (req: AuthRequest, res, next) => {
  try {
    const data = await userService.removeSavedLocation(req.user!.sub, param(req.params.id));
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

// ─── Wallet ────────────────────────────────────────────────────────────────

router.get('/me/wallet', async (req: AuthRequest, res, next) => {
  try {
    const data = await userService.getMyWallet(req.user!.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get(
  '/me/wallet/transactions',
  validate(walletTxQuerySchema, 'query'),
  async (req: AuthRequest, res, next) => {
    try {
      const query = req.query as unknown as Parameters<typeof userService.getMyWalletTransactions>[1];
      const { wallet, transactions, total } = await userService.getMyWalletTransactions(
        req.user!.sub,
        query,
      );
      sendSuccess(res, {
        wallet,
        transactions,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          total_pages: Math.ceil(total / query.limit) || 0,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Ride history ────────────────────────────────────────────────────────────

router.get(
  '/me/rides',
  validate(rideHistoryQuerySchema, 'query'),
  async (req: AuthRequest, res, next) => {
    try {
      const query = req.query as unknown as Parameters<typeof passengerService.listPassengerRides>[1];
      const { rides, total } = await passengerService.listPassengerRides(req.user!.sub, query);
      sendPaginated(res, rides, { page: query.page, limit: query.limit, total });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/me/rides/:id', async (req: AuthRequest, res, next) => {
  try {
    const data = await passengerService.getPassengerRide(req.user!.sub, param(req.params.id));
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/me/rides/:id/rating',
  validate(submitRatingSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await ratingService.submitRating(req.user!.sub, param(req.params.id), req.body);
      sendSuccess(res, data, 201);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Ratings ─────────────────────────────────────────────────────────────────

router.get('/me/ratings/tags', async (_req: AuthRequest, res, next) => {
  try {
    sendSuccess(res, ratingService.getRatingTags());
  } catch (err) {
    next(err);
  }
});

router.get(
  '/me/ratings/given',
  validate(ratingsQuerySchema, 'query'),
  async (req: AuthRequest, res, next) => {
    try {
      const query = req.query as unknown as { page: number; limit: number };
      const { ratings, total } = await ratingService.listRatingsGiven(
        req.user!.sub,
        query.page,
        query.limit,
      );
      sendPaginated(res, ratings, { page: query.page, limit: query.limit, total });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/me/ratings/received',
  validate(ratingsQuerySchema, 'query'),
  async (req: AuthRequest, res, next) => {
    try {
      const query = req.query as unknown as { page: number; limit: number };
      const { ratings, total } = await ratingService.listRatingsReceived(
        req.user!.sub,
        query.page,
        query.limit,
      );
      sendPaginated(res, ratings, { page: query.page, limit: query.limit, total });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/me/driver', async (req: AuthRequest, res, next) => {
  try {
    const data = await userService.getDriverView(req.user!.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/me/driver/availability',
  validate(availabilitySchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await userService.setDriverAvailability(
        req.user!.sub,
        req.body.isOnline,
        req.body.modes,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/me/driver/service-modes',
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

router.post('/me/driver/vehicle', validate(vehicleSchema), async (req: AuthRequest, res, next) => {
  try {
    const data = await userService.upsertVehicle(req.user!.sub, req.body);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get('/me/driver/vehicle', async (req: AuthRequest, res, next) => {
  try {
    const data = await userService.getDriverView(req.user!.sub);
    sendSuccess(res, data.vehicle);
  } catch (err) {
    next(err);
  }
});

router.post('/me/documents', validate(documentSchema), async (req: AuthRequest, res, next) => {
  try {
    const data = await userService.registerDocument(
      req.user!.sub,
      req.body.type,
      req.body.fileUrl,
      req.body.expiresAt,
    );
    sendSuccess(res, data, 201);
  } catch (err) {
    next(err);
  }
});

router.get('/me/documents', async (req: AuthRequest, res, next) => {
  try {
    const data = await userService.listDocuments(req.user!.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get('/me/trust-score', async (req: AuthRequest, res, next) => {
  try {
    const data = await userService.getTrustScore(req.user!.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get('/me/devices', async (req: AuthRequest, res, next) => {
  try {
    const data = await userService.listDevices(req.user!.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.delete('/me/devices/:id', async (req: AuthRequest, res, next) => {
  try {
    await userService.removeDevice(req.user!.sub, param(req.params.id));
    sendSuccess(res, { message: 'Device removed' });
  } catch (err) {
    next(err);
  }
});

router.get('/me/restrictions', async (req: AuthRequest, res, next) => {
  try {
    const data = await userService.getRestrictions(req.user!.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.post('/me/delete-account', async (req: AuthRequest, res, next) => {
  try {
    const data = await userService.requestAccountDeletion(req.user!.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get('/me/export', async (req: AuthRequest, res, next) => {
  try {
    const data = await userService.exportUserData(req.user!.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get('/me/notification-preferences', async (req: AuthRequest, res, next) => {
  try {
    const data = await userService.getNotificationPreferences(req.user!.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/me/notification-preferences',
  validate(notificationPrefsSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await userService.updateNotificationPreferences(req.user!.sub, req.body);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.post('/me/fcm-token', validate(fcmTokenSchema), async (req: AuthRequest, res, next) => {
  try {
    const data = await userService.registerFcmToken(req.user!.sub, req.body);
    sendSuccess(res, data, 201);
  } catch (err) {
    next(err);
  }
});

// ─── Public profiles (authenticated) ─────────────────────────────────────────

router.get('/:id/public', async (req: AuthRequest, res, next) => {
  try {
    const data = await userService.getPublicProfile(param(req.params.id));
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/report', validate(reportUserSchema), async (req: AuthRequest, res, next) => {
  try {
    const data = await userService.reportUser(
      req.user!.sub,
      param(req.params.id),
      req.body.reason,
      req.body.description,
      req.body.rideId,
    );
    sendSuccess(res, data, 201);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/block', async (req: AuthRequest, res, next) => {
  try {
    const data = await userService.blockUser(req.user!.sub, param(req.params.id));
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/block', async (req: AuthRequest, res, next) => {
  try {
    const data = await userService.unblockUser(req.user!.sub, param(req.params.id));
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

export default router;
