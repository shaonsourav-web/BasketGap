import * as Sentry from '@sentry/node';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

let sentryInitialized = false;

export interface InitObservabilityOptions {
  dsn?: string | undefined;
  environment?: string | undefined;
}

export function initObservability(opts: InitObservabilityOptions = {}): void {
  if (sentryInitialized) return;
  const dsn = opts.dsn ?? process.env.SENTRY_DSN;
  const environment = opts.environment ?? process.env.NODE_ENV ?? 'production';
  if (dsn && dsn.length > 0) {
    Sentry.init({ dsn, tracesSampleRate: 0, environment });
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
  if (sentryInitialized) {
    Sentry.captureException(err, meta ? { extra: meta } : undefined);
  }
}
