import winston, { format, transports } from 'winston';
import config from '../config';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

const { combine, timestamp, printf, colorize, json, errors } = format;

// Log levels configuration
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Color configuration for log levels
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'cyan',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(colors);

// Custom console format
const consoleFormat = printf(({ level, message, timestamp, correlationId, ...meta }) => {
  const metaString = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
  const correlationIdStr = correlationId ? `[${correlationId}] ` : '';
  return `${timestamp} ${correlationIdStr}${level}: ${message}${metaString}`;
});

// Ensure logs directory exists
const logDir = 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

/**
 * Logger configuration
 */
const logger = winston.createLogger({
  level: config.LOG_LEVEL || 'debug',
  levels,
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    errors({ stack: true }),
    json(),
  ),
  defaultMeta: { service: 'jupiter-api' },
  transports: [
    // Console transport for development
    new transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp({ format: 'HH:mm:ss.SSS' }),
        consoleFormat,
      ),
    }),
    // Error logs file transport
    new transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true,
      zippedArchive: true,
    }),
    // Combined logs file transport
    new transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true,
      zippedArchive: true,
    }),
  ],
  exceptionHandlers: [
    new transports.File({ filename: path.join(logDir, 'exceptions.log') }),
  ],
  rejectionHandlers: [
    new transports.File({ filename: path.join(logDir, 'rejections.log') }),
  ],
  exitOnError: false,
});

/**
 * Request logging middleware
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  const correlationId = (req.headers['x-correlation-id'] as string) || randomUUID().substring(0, 8);

  // Log request start
  logger.info('Request started', {
    correlationId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    body: req.body,
    query: req.query,
    params: req.params,
  });

  // Log response completion
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      correlationId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('content-length'),
    });
  });

  // Log errors
  res.on('error', (err: Error) => {
    logger.error('Request error', {
      correlationId,
      method: req.method,
      url: req.originalUrl,
      error: err.message,
      stack: err.stack,
    });
  });

  next();
};

/**
 * Stream for morgan HTTP request logging
 */
export const stream = {
  write: (message: string): void => {
    logger.http(message.trim());
  },
};

/**
 * Log request with correlation ID
 * @param req - Express request object
 * @param message - Log message
 * @param meta - Additional metadata
 */
export const logRequest = (req: Request, message: string, meta: Record<string, unknown> = {}): void => {
  const correlationId = (req.headers['x-correlation-id'] as string) || 'N/A';
  logger.info(message, { ...meta, correlationId });
};

/**
 * Log error with stack trace
 * @param error - Error object
 * @param message - Log message
 * @param meta - Additional metadata
 */
export const logError = (error: Error, message: string, meta: Record<string, unknown> = {}): void => {
  logger.error(message, {
    ...meta,
    error: error.message,
    stack: error.stack,
  });
};

/**
 * Log debug message
 * @param message - Log message
 * @param meta - Additional metadata
 */
export const logDebug = (message: string, meta: Record<string, unknown> = {}): void => {
  logger.debug(message, meta);
};

/**
 * Log warning message
 * @param message - Log message
 * @param meta - Additional metadata
 */
export const logWarning = (message: string, meta: Record<string, unknown> = {}): void => {
  logger.warn(message, meta);
};

export default logger;