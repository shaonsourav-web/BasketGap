import { createMiddleware } from 'hono/factory';

import { hashId } from '../lib/hash.ts';
import type { ApiVariables } from './types.ts';

const MAX_IP_LENGTH = 64;

/**
 * Trust order for the client IP behind Vercel's proxy:
 *  1. `x-vercel-forwarded-for` — set by the platform, not forwardable by callers
 *  2. `x-real-ip`             — single value, also platform-set
 *  3. the FIRST entry of `x-forwarded-for` — the original client, not the
 *     last hop; taking any other entry lets a caller pin the rate-limit key
 *  4. 'unknown'
 * Values are trimmed and capped so a huge header cannot bloat the hash input.
 */
export function clientIpFrom(header: (name: string) => string | undefined): string {
  const candidates = [
    header('x-vercel-forwarded-for'),
    header('x-real-ip'),
    header('x-forwarded-for')?.split(',')[0],
  ];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) return value.slice(0, MAX_IP_LENGTH);
  }
  return 'unknown';
}

export const requestIdMiddleware = createMiddleware<{ Variables: ApiVariables }>(
  async (c, next) => {
    const incoming = c.req.header('x-request-id');
    const requestId = incoming && incoming.length <= 128 ? incoming : crypto.randomUUID();

    const ip = clientIpFrom((name) => c.req.header(name));
    const deviceId = c.req.header('x-device-id') ?? null;

    c.set('requestId', requestId);
    c.set('ipHash', hashId(ip));
    c.set('deviceIdHash', hashId(deviceId));
    c.header('X-Request-Id', requestId);

    await next();
  },
);
