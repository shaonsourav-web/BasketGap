import * as Sentry from '@sentry/node';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

let sentryInitialized = false;

export function initObservability(): void {
  if (sentryInitialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (dsn && dsn.length > 0) {
    Sentry.init({
      dsn,
      tracesSampleRate: 0,
      environment: process.env.NODE_ENV ?? 'production',
    });
  }
  sentryInitialized = true;
}

export function log(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
  const entry = { ts: new Date().toISOString(), level, msg, ...(meta ?? {}) };
  process.stderr.write(JSON.stringify(entry) + '\n');
}

export function captureException(err: unknown, meta?: Record<string, unknown>): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  log('error', message, { ...(meta ?? {}), ...(stack ? { stack } : {}) });
  if (sentryInitialized && process.env.SENTRY_DSN) {
    Sentry.captureException(err, meta ? { extra: meta } : undefined);
  }
}
