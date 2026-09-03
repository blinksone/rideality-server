import express, { type Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { env, isDev } from '../config/env';
import { morganStream } from '../lib/logger';
import { errorHandler, notFoundHandler } from '../middleware/errorHandler';
import authRoutes from '../routes/auth.routes';
import userRoutes from '../routes/user.routes';
import onboardingRoutes from '../routes/onboarding.routes';
import adminRoutes from '../routes/admin.routes';
import adminPermissionRoutes, { roleRouter } from '../routes/admin.permission.routes';
import adminPortalRoutes from '../routes/admin.portal.routes';
import adminRegionRoutes from '../routes/admin.region.routes';
import adminFleetRoutes from '../routes/admin.fleet.routes';
import adminFinanceRoutes from '../routes/admin.finance.routes';
import adminFareRoutes from '../routes/admin.fare.routes';
import adminPlacesRoutes from '../routes/admin.places.routes';
import fleetRoutes from '../routes/fleet.routes';
import placesRoutes from '../routes/places.routes';
import internalFinanceRoutes from '../routes/internal.finance.routes';
import tripRoutes from '../routes/trip.routes';
import type { ServiceId } from './registry';

function applyCommonMiddleware(app: express.Application) {
  app.use(helmet());
  app.use(cors());
  app.use(morgan('combined', { stream: morganStream }));
  if (isDev) {
    app.use(morgan('dev'));
  }
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    '/uploads',
    (_req, res, next) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(path.resolve(env.UPLOAD_LOCAL_PATH)),
  );
}

function mountAuth(api: Router) {
  api.use('/auth', authRoutes);
}

function mountUsers(api: Router) {
  api.use('/onboarding', onboardingRoutes);
  api.use('/users', userRoutes);
  api.use('/trips', tripRoutes);
  api.use('/places', placesRoutes);
}

function mountFleet(api: Router) {
  api.use('/fleet', fleetRoutes);
  api.use('/admin/fleets', adminFleetRoutes);
}

function mountFinance(api: Router) {
  api.use('/admin/finance', adminFinanceRoutes);
  api.use('/internal/finance', internalFinanceRoutes);
}

function mountAdmin(api: Router) {
  api.use('/admin/users', adminRoutes);
  api.use('/admin/permissions', adminPermissionRoutes);
  api.use('/admin/roles', roleRouter);
  api.use('/admin/regions', adminRegionRoutes);
  api.use('/admin/fares', adminFareRoutes);
  api.use('/admin/places', adminPlacesRoutes);
  api.use('/admin', adminPortalRoutes);
}

const mountByService: Record<Exclude<ServiceId, 'gateway'>, (api: Router) => void> = {
  auth: mountAuth,
  users: mountUsers,
  fleet: mountFleet,
  finance: mountFinance,
  admin: mountAdmin,
};

export function createDomainApp(serviceId: Exclude<ServiceId, 'gateway'>, serviceName: string) {
  const app = express();
  applyCommonMiddleware(app);

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      architecture: 'microservices',
      service: serviceName,
      serviceId,
      version: '1.0.0',
    });
  });

  const api = express.Router();
  mountByService[serviceId](api);
  app.use(env.API_PREFIX, api);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
