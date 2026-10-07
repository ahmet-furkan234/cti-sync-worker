import { pino, type Logger } from 'pino';
import type { ILogger } from '../../application/ports/ports.js';
import type { EnvConfig } from './env.config.js';

/** Secrets that must never reach the logs. */
const REDACTED_PATHS = ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'];
const PRETTY_ENV = 'development';
const PRETTY_TRANSPORT = { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } };

export function createLogger(config: EnvConfig): ILogger & { raw: Logger } {
  const raw = pino({
    level: config.LOG_LEVEL,
    redact: REDACTED_PATHS,
    ...(config.NODE_ENV === PRETTY_ENV ? { transport: PRETTY_TRANSPORT } : {}),
  });
  return {
    raw,
    info: (o, m) => raw.info(o as object, m),
    warn: (o, m) => raw.warn(o as object, m),
    error: (o, m) => raw.error(o as object, m),
    debug: (o, m) => raw.debug(o as object, m),
  };
}
