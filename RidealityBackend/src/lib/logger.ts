import fs from 'fs';
import path from 'path';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { env } from '../config/env';

const logDir = path.resolve(env.LOG_PATH);

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}: ${message}${extra}`;
  }),
);

function dailyTransport(filename: string, level?: string): DailyRotateFile {
  return new DailyRotateFile({
    dirname: logDir,
    filename: `${filename}-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    maxFiles: env.LOG_MAX_FILES,
    zippedArchive: env.LOG_ZIP_ARCHIVE,
    level,
    format: fileFormat,
  });
}

const loggerTransports: winston.transport[] = [
  dailyTransport('app'),
  dailyTransport('error', 'error'),
];

if (env.NODE_ENV !== 'production') {
  loggerTransports.push(
    new winston.transports.Console({
      format: consoleFormat,
      level: env.LOG_LEVEL,
    }),
  );
}

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  transports: loggerTransports,
});

const accessTransports: winston.transport[] = [dailyTransport('access')];

if (env.NODE_ENV !== 'production') {
  accessTransports.push(
    new winston.transports.Console({
      format: consoleFormat,
      level: 'info',
    }),
  );
}

export const accessLogger = winston.createLogger({
  level: 'info',
  transports: accessTransports,
});

export const morganStream = {
  write(message: string): void {
    accessLogger.info(message.trim());
  },
};
