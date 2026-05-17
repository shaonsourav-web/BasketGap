// Sentry import deferred to first adapter round when a DSN exists.
// Stub writes to stderr so failures aren't silently swallowed.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export function log(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
  const entry = { ts: new Date().toISOString(), level, msg, ...(meta ?? {}) };
  process.stderr.write(JSON.stringify(entry) + '\n');
}

export function captureException(err: unknown, meta?: Record<string, unknown>): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  log('error', message, { ...(meta ?? {}), ...(stack ? { stack } : {}) });
}
