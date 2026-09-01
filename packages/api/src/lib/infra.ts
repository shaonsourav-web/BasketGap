import { createDb, createSqlClient, type Db, type SqlClient } from '@basketgap/shared/db';
import { createDbContext } from '@basketgap/shared/matching/db';
import type { PipelineContext } from '@basketgap/shared/matching/types';
import {
  loadOffersForCanonicalIds,
  resolveStateForPostcode,
  type ProductOffers,
} from '@basketgap/shared/pricing';

import { buildLimiter, type RateLimiterLike } from '../middleware/rate-limit.ts';
import { loadApiEnv, type ApiEnv } from './env.ts';
import { initSentryOnce } from './sentry.ts';

let cachedEnv: ApiEnv | null = null;
let cachedSqlClient: SqlClient | null = null;
let cachedDb: Db | null = null;
let cachedLimiter: RateLimiterLike | null | undefined;

export function getApiEnv(): ApiEnv {
  cachedEnv ??= loadApiEnv();
  initSentryOnce(cachedEnv.SENTRY_DSN_API, process.env.VERCEL_ENV ?? 'development');
  return cachedEnv;
}

export function getDb(): Db {
  const env = getApiEnv();
  cachedSqlClient ??= createSqlClient(env.DATABASE_URL);
  cachedDb ??= createDb(cachedSqlClient);
  return cachedDb;
}

export function getMatchingContext(): PipelineContext {
  const env = getApiEnv();
  return createDbContext({
    db: getDb(),
    openAiKey: env.OPENAI_API_KEY,
    openRouterKey: env.OPENROUTER_API_KEY,
    openRouterModel: env.OPENROUTER_MODEL,
  });
}

export function loadOffers(
  canonicalProductIds: string[],
  state: string | null,
): Promise<Map<string, ProductOffers>> {
  return loadOffersForCanonicalIds(getDb(), canonicalProductIds, { state });
}

export function resolveState(postcode: string): Promise<string | null> {
  return resolveStateForPostcode(getDb(), postcode);
}

export function getRateLimiter(): RateLimiterLike | null {
  if (cachedLimiter === undefined) {
    const env = getApiEnv();
    cachedLimiter = buildLimiter({
      redisUrl: env.UPSTASH_REDIS_REST_URL,
      redisToken: env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return cachedLimiter;
}

export function resetInfraForTests(): void {
  cachedEnv = null;
  cachedSqlClient = null;
  cachedDb = null;
  cachedLimiter = undefined;
}
