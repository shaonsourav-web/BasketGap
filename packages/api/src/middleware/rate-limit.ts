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

export function rateLimitMiddleware(getLimiter: () => RateLimiterLike | null) {
  return createMiddleware<{ Variables: ApiVariables }>(async (c, next) => {
    const limiter = getLimiter();
    if (!limiter) {
      await next();
      return;
    }
    const ipHash = c.get('ipHash');
    const deviceIdHash = c.get('deviceIdHash');
    const key = `${ipHash}:${deviceIdHash}`;
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
