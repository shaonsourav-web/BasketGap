import * as Sentry from '@sentry/node';

let initialised = false;

export function initSentryOnce(dsn: string | undefined, environment: string): void {
  if (initialised || !dsn) return;
  Sentry.init({ dsn, environment, tracesSampleRate: 0 });
  initialised = true;
}

export function captureApiException(err: unknown, requestId: string): void {
  if (!initialised) return;
  Sentry.captureException(err, { tags: { request_id: requestId } });
}
