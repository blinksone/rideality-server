import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { connectDatabase, disconnectDatabase } from './lib/prisma';
import { connectRedis, disconnectRedis } from './lib/redis';
import { startLocationSweep, stopLocationSweep } from './services/location.service';
import { initFirebase, isFcmReady } from './services/push.service';

async function main() {
  await connectDatabase();
  await connectRedis();
  startLocationSweep(15_000);
  initFirebase();

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info('Rideality API started', {
      url: `http://localhost:${env.PORT}${env.API_PREFIX}`,
      environment: env.NODE_ENV,
      logPath: env.LOG_PATH,
      fcm: isFcmReady(),
    });
  });

  const shutdown = async (signal: string) => {
    logger.info('Shutdown signal received', { signal });
    stopLocationSweep();
    server.close(async () => {
      await disconnectRedis();
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Failed to start server', { error: err });
  process.exit(1);
});
