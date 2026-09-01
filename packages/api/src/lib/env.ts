import { BaseEnvSchema, parseEnv } from '@basketgap/shared/lib/env';
import { z } from 'zod';

export const ApiEnvSchema = BaseEnvSchema.extend({
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  SENTRY_DSN_API: z.string().optional(),
  MAX_LLM_CALLS_PER_REQUEST: z.coerce.number().int().min(1).max(100).default(10),
});

export type ApiEnv = z.infer<typeof ApiEnvSchema>;

export function loadApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  return parseEnv(ApiEnvSchema, source);
}

/**
 * True on the production deployment. Used to decide whether the API may run
 * without a rate limiter (dev/preview: yes; production: no — fail closed).
 */
export function isProductionRuntime(source: NodeJS.ProcessEnv = process.env): boolean {
  return source.VERCEL_ENV === 'production' || source.NODE_ENV === 'production';
}
