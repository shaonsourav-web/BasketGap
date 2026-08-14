import { createMiddleware } from 'hono/factory';

import { hashId } from '../lib/hash.ts';
import type { ApiVariables } from './types.ts';

export const requestIdMiddleware = createMiddleware<{ Variables: ApiVariables }>(
  async (c, next) => {
    const incoming = c.req.header('x-request-id');
    const requestId = incoming && incoming.length <= 128 ? incoming : crypto.randomUUID();

    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      c.req.header('x-real-ip') ??
      'unknown';
    const deviceId = c.req.header('x-device-id') ?? null;

    c.set('requestId', requestId);
    c.set('ipHash', hashId(ip));
    c.set('deviceIdHash', hashId(deviceId));
    c.header('X-Request-Id', requestId);

    await next();
  },
);
