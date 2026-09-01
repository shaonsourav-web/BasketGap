import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { createMiddleware } from 'hono/factory';

import type { ApiVariables } from './types.ts';

export interface RateLimitConfig {
  redisUrl: string | undefined;
  redisToken: string | undefined;
  limit?: number;
  windowSeconds?: number;
}

export interface RateLimiterLike {
  limit(key: string): Promise<{
    success: boolean;
    limit: number;
    remaining: number;
    reset: number;
  }>;
}

export function buildLimiter(cfg: RateLimitConfig): RateLimiterLike | null {
  if (!cfg.redisUrl || !cfg.redisToken) return null;
  const redis = new Redis({ url: cfg.redisUrl, token: cfg.redisToken });
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(cfg.limit ?? 30, `${cfg.windowSeconds ?? 60} s`),
    analytics: false,
    prefix: 'basketgap:rl',
  });
}

export interface RateLimitMiddlewareOptions {
  /**
   * Fail closed: when true and no limiter is configured, the request is
   * rejected with 503 instead of passing through unlimited. app.ts computes
   * this from the runtime environment (true in production) and passes it in,
   * so the behaviour is unit-testable without mutating process.env.
   */
  requireLimiter?: boolean;
}

export function rateLimitMiddleware(
  getLimiter: () => RateLimiterLike | null,
  options: RateLimitMiddlewareOptions = {},
) {
  const requireLimiter = options.requireLimiter ?? false;
  return createMiddleware<{ Variables: ApiVariables }>(async (c, next) => {
    const limiter = getLimiter();
    if (!limiter) {
      if (requireLimiter) {
        return c.json(
          {
            error: {
              message: 'Rate limiting is unavailable',
              code: 'RATE_LIMIT_UNAVAILABLE',
              request_id: c.get('requestId'),
            },
          },
          503,
        );
      }
      await next();
      return;
    }
    // The key is the IP hash ALONE. x-device-id is client-controlled, so
    // including it would let a caller mint a fresh bucket per request; the
    // device hash stays on the context for logging only.
    const key = c.get('ipHash');
    const verdict = await limiter.limit(key);

    c.header('X-RateLimit-Limit', String(verdict.limit));
    c.header('X-RateLimit-Remaining', String(verdict.remaining));
    c.header('X-RateLimit-Reset', String(verdict.reset));

    if (!verdict.success) {
      const retryAfter = Math.max(1, Math.ceil((verdict.reset - Date.now()) / 1000));
      c.header('Retry-After', String(retryAfter));
      return c.json(
        {
          error: {
            message: 'Rate limit exceeded',
            code: 'RATE_LIMITED',
            request_id: c.get('requestId'),
          },
        },
        429,
      );
    }

    await next();
    return;
  });
}
