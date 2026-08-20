/**
 * Unified microservice entrypoint.
 *
 *   SERVICE_NAME=auth|users|fleet|finance|admin|gateway  PORT=...
 *   npx tsx src/microservices/server.ts
 *
 * Omitting SERVICE_NAME (or SERVICE_NAME=monolith) preserves the modular monolith
 * via src/server.ts — do not use this file for that mode.
 */
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { connectDatabase, disconnectDatabase } from '../lib/prisma';
import { connectRedis, disconnectRedis } from '../lib/redis';
import { createDomainApp } from './createDomainApp';
import { createGatewayApp } from './createGatewayApp';
import { DOMAIN_SERVICES, GATEWAY, type ServiceId } from './registry';

const serviceName = (process.env.SERVICE_NAME || '').toLowerCase() as ServiceId | '';

function resolveDefinition() {
  if (serviceName === 'gateway') return GATEWAY;
  const found = DOMAIN_SERVICES.find((s) => s.id === serviceName);
  if (found) return found;
  throw new Error(
    `SERVICE_NAME must be one of: gateway, ${DOMAIN_SERVICES.map((s) => s.id).join(', ')}. Got: "${serviceName}"`,
  );
}

async function main() {
  const def = resolveDefinition();
  const port = env.PORT || def.defaultPort;

  if (def.id !== 'gateway') {
    await connectDatabase();
  }
  if (def.needsRedis) {
    await connectRedis();
  }

  const app =
    def.id === 'gateway'
      ? createGatewayApp()
      : createDomainApp(def.id as Exclude<ServiceId, 'gateway'>, def.name);

  const server = app.listen(port, () => {
    logger.info('Microservice started', {
      service: def.name,
      serviceId: def.id,
      url: `http://localhost:${port}`,
      apiPrefix: def.id === 'gateway' ? env.API_PREFIX : `${env.API_PREFIX}`,
      environment: env.NODE_ENV,
    });
  });

  const shutdown = async (signal: string) => {
    logger.info('Shutdown signal received', { signal, service: def.name });
    server.close(async () => {
      if (def.needsRedis) await disconnectRedis();
      if (def.id !== 'gateway') await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Failed to start microservice', {
    error: err instanceof Error ? err.message : String(err),
    serviceName,
  });
  process.exit(1);
});
