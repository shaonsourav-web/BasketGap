import { zValidator } from '@hono/zod-validator';
import { matchBasket } from '@basketgap/shared/matching/pipeline';
import type { MatchResult, PipelineContext } from '@basketgap/shared/matching/types';
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
}

export type MatchResultWithTruncation = MatchResult & { truncated: boolean };

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
      const { lines } = c.req.valid('json');

      const baseCtx = deps.getContext();
      const cappedCtx = withLlmCap(baseCtx, deps.getMaxLlmCalls());
      const results = await matchBasket(lines, cappedCtx);

      let cached = 0;
      let llmCalls = 0;
      const annotated: MatchResultWithTruncation[] = results.map((r) => {
        if (r.decidedBy === 'cache') cached++;
        const hasLlmFallback = r.audit.some((a) => a.step === 'llm-fallback');
        if (hasLlmFallback && r.decidedBy === 'llm') llmCalls++;
        const truncated =
          hasLlmFallback &&
          r.decidedBy !== 'llm' &&
          r.band === 'needs_attention' &&
          cappedCtx.llmCapReached();
        return { ...r, truncated };
      });

      return c.json({
        results: annotated,
        stats: {
          cached,
          llm_calls: llmCalls,
          llm_cap_reached: cappedCtx.llmCapReached(),
          latency_ms: Math.round(performance.now() - t0),
          request_id: requestId,
        },
      });
    },
  );

  return route;
}
