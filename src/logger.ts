import pino from 'pino';
import type { Config } from './config.js';

let rootLogger: pino.Logger;

export function createLogger(config: Config): pino.Logger {
  rootLogger = pino({
    level: config.logLevel,
    transport:
      process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    base: { service: 'telegram-lead-bot' },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
  return rootLogger;
}

export function getLogger(module: string): pino.Logger {
  if (!rootLogger) {
    throw new Error('Logger not initialized. Call createLogger first.');
  }
  return rootLogger.child({ module });
}
