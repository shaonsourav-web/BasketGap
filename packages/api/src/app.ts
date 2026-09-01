import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import {
  getApiEnv,
  getMatchingContext,
  getRateLimiter,
  loadOffers,
  resolveState,
} from './lib/infra.ts';
import { captureApiException } from './lib/sentry.ts';
import { createCorsMiddleware } from './middleware/cors.ts';
import { rateLimitMiddleware } from './middleware/rate-limit.ts';
import { requestIdMiddleware } from './middleware/request-id.ts';
import { requestLogMiddleware } from './middleware/request-log.ts';
import type { ApiVariables } from './middleware/types.ts';
import { createMatchRoute } from './routes/match.ts';

const MAX_BODY_BYTES = 32 * 1024;

export const app = new Hono<{ Variables: ApiVariables }>().basePath('/api');

app.use('*', requestIdMiddleware);
app.use('*', requestLogMiddleware);

const env = safeLoadEnv();
app.use('*', createCorsMiddleware(env?.ALLOWED_ORIGINS));

app.get('/health', (c) => c.json({ ok: true }));

app.use(
  '/match',
  bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) =>
      c.json(
        {
          error: {
            message: `Body exceeds ${MAX_BODY_BYTES} bytes`,
            code: 'INPUT_TOO_LARGE',
            request_id: c.get('requestId') ?? crypto.randomUUID(),
          },
        },
        413,
      ),
  }),
);

app.use('/match', rateLimitMiddleware(safeGetLimiter));

app.route(
  '/match',
  createMatchRoute({
    getContext: getMatchingContext,
    getMaxLlmCalls: () => safeLoadEnv()?.MAX_LLM_CALLS_PER_REQUEST ?? 10,
    loadOffers,
    resolveState,
  }),
);

app.onError((err, c) => {
  const requestId = c.get('requestId') ?? crypto.randomUUID();
  const message = err instanceof Error ? err.message : String(err);
  const isMalformedJson =
    err instanceof SyntaxError ||
    message.includes('Malformed JSON') ||
    message.includes('Unexpected token');

  if (isMalformedJson) {
    return c.json(
      {
        error: {
          message: 'Invalid JSON in request body',
          code: 'INVALID_BODY',
          request_id: requestId,
        },
      },
      400,
    );
  }

  captureApiException(err, requestId);
  process.stderr.write(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      msg: 'unhandled',
      request_id: requestId,
      err: message,
    }) + '\n',
  );
  return c.json(
    {
      error: {
        message: 'Internal Server Error',
        code: 'INTERNAL',
        request_id: requestId,
      },
    },
    500,
  );
});

function safeLoadEnv(): ReturnType<typeof getApiEnv> | undefined {
  try {
    return getApiEnv();
  } catch {
    return undefined;
  }
}

function safeGetLimiter(): ReturnType<typeof getRateLimiter> | null {
  try {
    return getRateLimiter();
  } catch {
    return null;
  }
}
