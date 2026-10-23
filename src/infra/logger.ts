import { ENV } from '../core/env.js';

/**
 * Minimal structured logger (no dependency on purpose).
 *
 * Output goes to stdout (debug/info) and stderr (warn/error) as single
 * lines: `2026-10-22T15:00:00.000Z INFO  [scope] message {"k":1}`.
 * PM2 captures both streams and the server already runs pm2-logrotate,
 * so this service must NOT write or rotate log files itself.
 *
 * Level is controlled by LOG_LEVEL (debug|info|warn|error, default info).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function activeThreshold(): number {
  const configured = String(ENV.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
  return LEVEL_ORDER[configured] ?? LEVEL_ORDER.info;
}

function stringifyMeta(meta: unknown): string {
  if (meta instanceof Error) return ` error=${JSON.stringify(meta.message)}`;
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return ` ${String(meta)}`;
  }
}

export interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

export function createLogger(scope: string): Logger {
  const write = (level: LogLevel, message: string, meta?: unknown): void => {
    if (LEVEL_ORDER[level] < activeThreshold()) return;
    const line =
      `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ` +
      `[${scope}] ${message}` +
      (meta === undefined ? '' : stringifyMeta(meta));
    if (level === 'warn' || level === 'error') {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  };

  return {
    debug: (message, meta) => write('debug', message, meta),
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
  };
}

/** Root logger for process-level events (startup, shutdown, uncaught). */
export const logger = createLogger('app');
