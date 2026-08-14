import { createMiddleware } from 'hono/factory';

import type { ApiVariables } from './types.ts';

type ResponseStatus = { status: number };

export const requestLogMiddleware = createMiddleware<{ Variables: ApiVariables }>(
  async (c, next) => {
    const t0 = performance.now();
    await next();
    const latencyMs = Math.round(performance.now() - t0);
    // Vercel's Node type environment can declare the global Response without
    // its Fetch API members. Hono still returns a Fetch Response at runtime.
    const responseStatus = (c.res as unknown as ResponseStatus).status;
    process.stdout.write(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        msg: 'request',
        method: c.req.method,
        path: c.req.path,
        status: responseStatus,
        request_id: c.get('requestId'),
        ip_hash: c.get('ipHash'),
        device_id_hash: c.get('deviceIdHash'),
        latency_ms: latencyMs,
      }) + '\n',
    );
  },
);
