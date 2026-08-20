import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { createProxyMiddleware, type Options } from 'http-proxy-middleware';
import { env, isDev } from '../config/env';
import { morganStream } from '../lib/logger';
import { logger } from '../lib/logger';
import { errorHandler, notFoundHandler } from '../middleware/errorHandler';
import { DOMAIN_SERVICES, resolveServiceUrl } from './registry';

/**
 * API Gateway — single public entry. Routes by path prefix to domain services.
 * Clients keep using http://host:3000/api/v1/* unchanged.
 */
export function createGatewayApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(morgan('combined', { stream: morganStream }));
  if (isDev) {
    app.use(morgan('dev'));
  }

  // Gateway serves uploads so mobile/admin keep the same host.
  app.use('/uploads', express.static(path.resolve(env.UPLOAD_LOCAL_PATH)));

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      architecture: 'microservices',
      service: 'api-gateway',
      version: '1.0.0',
      upstreams: DOMAIN_SERVICES.map((s) => ({
        id: s.id,
        name: s.name,
        url: resolveServiceUrl(s),
        mounts: s.apiMounts,
      })),
    });
  });

  // Longest paths first so /admin/finance wins over /admin/*
  const routes = DOMAIN_SERVICES.flatMap((svc) =>
    svc.apiMounts.map((mount) => ({
      mount,
      target: resolveServiceUrl(svc),
      serviceId: svc.id,
    })),
  ).sort((a, b) => b.mount.length - a.mount.length);

  for (const { mount, target, serviceId } of routes) {
    const prefix = `${env.API_PREFIX}${mount}`;
    const proxyOptions: Options = {
      target,
      changeOrigin: true,
      // Express strips the mount path from req.url; restore full path for the backend.
      pathRewrite: (path) => `${prefix}${path === '/' ? '' : path}`,
      on: {
        error(err, _req, res) {
          logger.error('Gateway proxy error', {
            serviceId,
            target,
            mount: prefix,
            error: err.message,
          });
          const response = res as express.Response;
          if (!response.headersSent) {
            response.status(502).json({
              success: false,
              error: {
                code: 'UPSTREAM_UNAVAILABLE',
                message: `Service ${serviceId} is unavailable`,
              },
            });
          }
        },
      },
    };

    app.use(prefix, createProxyMiddleware(proxyOptions));
    logger.info('Gateway route registered', { prefix, target, serviceId });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
