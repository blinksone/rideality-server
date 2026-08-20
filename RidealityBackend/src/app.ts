import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { env, isDev } from './config/env';
import { morganStream } from './lib/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import onboardingRoutes from './routes/onboarding.routes';
import adminRoutes from './routes/admin.routes';
import adminPermissionRoutes, { roleRouter } from './routes/admin.permission.routes';
import adminPortalRoutes from './routes/admin.portal.routes';
import adminRegionRoutes from './routes/admin.region.routes';
import adminFleetRoutes from './routes/admin.fleet.routes';
import adminFinanceRoutes from './routes/admin.finance.routes';
import fleetRoutes from './routes/fleet.routes';
import internalFinanceRoutes from './routes/internal.finance.routes';
import tripRoutes from './routes/trip.routes';
import bookingRoutes from './routes/booking.routes';
import driverRoutes from './routes/driver.routes';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(morgan('combined', { stream: morganStream }));
  if (isDev) {
    app.use(morgan('dev'));
  }
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use('/uploads', express.static(path.resolve(env.UPLOAD_LOCAL_PATH)));

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      architecture: 'modular-monolith',
      service: 'rideality-backend',
      version: '1.0.0',
    });
  });

  const api = express.Router();
  api.use('/auth', authRoutes);
  api.use('/onboarding', onboardingRoutes);
  api.use('/users', userRoutes);
  /**
   * Alias documented as /api/v1/me/* (Flutter contracts).
   * Same router uses paths like /me/fcm-token under /users → /users/me/fcm-token.
   * Rewrite /me/fcm-token → /me/fcm-token into the user router.
   */
  api.use('/me', (req, res, next) => {
    const rest = req.url === '/' ? '' : req.url;
    req.url = `/me${rest.startsWith('/') ? rest : `/${rest}`}`;
    return userRoutes(req, res, next);
  });
  api.use('/trips', tripRoutes);
  api.use('/bookings', bookingRoutes);
  api.use('/drivers', driverRoutes);
  api.use('/admin/users', adminRoutes);
  api.use('/admin/permissions', adminPermissionRoutes);
  api.use('/admin/roles', roleRouter);
  api.use('/admin', adminPortalRoutes);
  api.use('/admin/regions', adminRegionRoutes);
  api.use('/admin/fleets', adminFleetRoutes);
  api.use('/admin/finance', adminFinanceRoutes);
  api.use('/internal/finance', internalFinanceRoutes);
  api.use('/fleet', fleetRoutes);

  app.use(env.API_PREFIX, api);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
