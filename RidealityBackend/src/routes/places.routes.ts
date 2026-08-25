import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { sendSuccess } from '../utils/response';
import { param } from '../utils/params';
import * as placesService from '../services/places.service';
import {
  googlePlaceParamsSchema,
  googlePlaceQuerySchema,
  nearbyPlacesQuerySchema,
  reverseGeocodeQuerySchema,
  searchPlacesQuerySchema,
  selectPlaceSchema,
  suggestionsQuerySchema,
  upsertPlaceSchema,
} from '../validators/places.validator';

const router = Router();
router.use(authenticate);

const searchLimiter = rateLimit({
  windowMs: 60_000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many location searches. Wait a moment.' } },
});

router.get(
  '/nearby',
  validate(nearbyPlacesQuerySchema, 'query'),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await placesService.listNearbyPlaces(
        req.query as unknown as { latitude: number; longitude: number; radius: number; limit: number },
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/suggestions',
  validate(suggestionsQuerySchema, 'query'),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await placesService.listPickupSuggestions(
        req.user!.sub,
        req.query as unknown as { latitude: number; longitude: number; radius: number; limit: number },
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.get('/recents', async (req: AuthRequest, res, next) => {
  try {
    const data = await placesService.listRecentPlaces(req.user!.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

router.get(
  '/search',
  searchLimiter,
  validate(searchPlacesQuerySchema, 'query'),
  async (req: AuthRequest, res, next) => {
    try {
      const q = req.query as unknown as {
        query: string;
        latitude?: number;
        longitude?: number;
        sessionToken?: string;
      };
      const data = await placesService.searchPlaces(q);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/reverse',
  validate(reverseGeocodeQuerySchema, 'query'),
  async (req: AuthRequest, res, next) => {
    try {
      const q = req.query as unknown as { latitude: number; longitude: number };
      const data = await placesService.reverseGeocodePin(q.latitude, q.longitude);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/google/:placeId',
  searchLimiter,
  validate(googlePlaceParamsSchema, 'params'),
  validate(googlePlaceQuerySchema, 'query'),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await placesService.getGooglePlace(
        param(req.params.placeId),
        (req.query as { sessionToken?: string }).sessionToken,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  },
);

router.post('/', validate(upsertPlaceSchema), async (req: AuthRequest, res, next) => {
  try {
    const data = await placesService.upsertGooglePlace(req.user!.sub, req.body);
    sendSuccess(res, data, 201);
  } catch (err) {
    next(err);
  }
});

router.post('/select', validate(selectPlaceSchema), async (req: AuthRequest, res, next) => {
  try {
    const data = await placesService.selectPlace(req.user!.sub, req.body);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

export default router;
