import { zValidator } from '@hono/zod-validator';
import { matchBasket } from '@basketgap/shared/matching/pipeline';
import type { MatchResult, PipelineContext } from '@basketgap/shared/matching/types';
import type { ProductOffers } from '@basketgap/shared/pricing';
import { Hono, type Context } from 'hono';
import { z } from 'zod';

import { withLlmCap } from '../lib/llm-cap.ts';
import type { ApiVariables } from '../middleware/types.ts';

function readRequestId(c: Context): string {
  const typed = c as unknown as Context<{ Variables: ApiVariables }>;
  return typed.get('requestId') ?? crypto.randomUUID();
}

export const MatchRequestSchema = z.object({
  lines: z.array(z.string().min(1).max(200)).min(1).max(100),
  postcode: z
    .string()
    .regex(/^\d{4}$/, 'postcode must be 4 digits')
    .optional(),
});

export type MatchRequest = z.infer<typeof MatchRequestSchema>;

export interface MatchRouteDeps {
  getContext: () => PipelineContext;
  getMaxLlmCalls: () => number;
  loadOffers: (
    canonicalProductIds: string[],
    state: string | null,
  ) => Promise<Map<string, ProductOffers>>;
  resolveState: (postcode: string) => Promise<string | null>;
}

export type MatchResultWithTruncation = MatchResult & {
  truncated: boolean;
  offers: ProductOffers | null;
};

export function createMatchRoute(deps: MatchRouteDeps): Hono<{ Variables: ApiVariables }> {
  const route = new Hono<{ Variables: ApiVariables }>();

  route.post(
    '/',
    zValidator('json', MatchRequestSchema, (result, c) => {
      if (result.success === false) {
        return c.json(
          {
            error: {
              message: 'Invalid request body',
              code: 'INVALID_BODY',
              request_id: readRequestId(c),
              issues: result.error.issues.map((i) => ({
                path: i.path.join('.'),
                message: i.message,
              })),
            },
          },
          400,
        );
      }
      return undefined;
    }),
    async (c) => {
      const requestId = readRequestId(c);
      const t0 = performance.now();
      const { lines, postcode } = c.req.valid('json');

      const baseCtx = deps.getContext();
      const cappedCtx = withLlmCap(baseCtx, deps.getMaxLlmCalls());
      const results = await matchBasket(lines, cappedCtx);

      const matchedIds = [
        ...new Set(
          results.map((r) => r.canonicalProductId).filter((id): id is string => id != null),
        ),
      ];

      // Offers degrade to null rather than failing the whole match request —
      // a shopper still gets their matched list when the offers query is down.
      let offersById = new Map<string, ProductOffers>();
      let offersAvailable = true;
      if (matchedIds.length > 0) {
        try {
          const state = postcode ? await deps.resolveState(postcode) : null;
          offersById = await deps.loadOffers(matchedIds, state);
        } catch (err) {
          offersAvailable = false;
          process.stderr.write(
            JSON.stringify({
              ts: new Date().toISOString(),
              level: 'error',
              msg: 'offers_load_failed',
              request_id: requestId,
              err: err instanceof Error ? err.message : String(err),
            }) + '\n',
          );
        }
      }

      let cached = 0;
      let llmCalls = 0;
      let onSpecial = 0;
      const annotated: MatchResultWithTruncation[] = results.map((r) => {
        if (r.decidedBy === 'cache') cached++;
        const hasLlmFallback = r.audit.some((a) => a.step === 'llm-fallback');
        if (hasLlmFallback && r.decidedBy === 'llm') llmCalls++;
        const truncated =
          hasLlmFallback &&
          r.decidedBy !== 'llm' &&
          r.band === 'needs_attention' &&
          cappedCtx.llmCapReached();
        const offers =
          r.canonicalProductId != null ? (offersById.get(r.canonicalProductId) ?? null) : null;
        if (offers && (offers.coles || offers.woolworths)) onSpecial++;
        return { ...r, truncated, offers };
      });

      return c.json({
        results: annotated,
        stats: {
          cached,
          llm_calls: llmCalls,
          llm_cap_reached: cappedCtx.llmCapReached(),
          on_special: onSpecial,
          offers_available: offersAvailable,
          latency_ms: Math.round(performance.now() - t0),
          request_id: requestId,
        },
      });
    },
  );

  return route;
}
