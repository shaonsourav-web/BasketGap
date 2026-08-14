import { cors } from 'hono/cors';
import type { MiddlewareHandler } from 'hono';

export function createCorsMiddleware(allowedOriginsCsv: string | undefined): MiddlewareHandler {
  const allowed = (allowedOriginsCsv ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return cors({
    origin: (origin) => {
      if (!origin) return null;
      if (allowed.length === 0) return null;
      if (allowed.includes('*')) return origin;
      return allowed.includes(origin) ? origin : null;
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['content-type', 'x-device-id', 'x-request-id'],
    maxAge: 600,
  });
}
