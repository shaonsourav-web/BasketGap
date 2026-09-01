import { sql } from 'drizzle-orm';

import type { Db } from '../db/client.ts';

export interface PruneMatchCacheOptions {
  /** Rows untouched for longer than this are dropped outright. */
  maxAgeDays?: number;
  /** Hard ceiling on surviving rows; the oldest beyond it are dropped. */
  maxRows?: number;
  /** Injectable clock, for tests. */
  now?: Date;
}

export interface PruneMatchCacheResult {
  deletedByAge: number;
  deletedByCap: number;
  remaining: number;
}

export const DEFAULT_MAX_AGE_DAYS = 90;
export const DEFAULT_MAX_ROWS = 200_000;

/**
 * match_cache grows one row per distinct cleaned input forever; nothing in the
 * write path ever removes one. This is the bound: age out cold rows first, then
 * — only if the table is still over the ceiling — drop the least recently used
 * rows down to the cap. Both passes key off last_used_at, which readCache()
 * bumps on every hit, so "cold" means genuinely unused rather than merely old.
 */
export async function pruneMatchCache(
  db: Db,
  options: PruneMatchCacheOptions = {},
): Promise<PruneMatchCacheResult> {
  const maxAgeDays = options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();

  const byAge = await db.execute<{ id: string }>(sql`
    delete from public.match_cache
    where last_used_at < ${cutoff}::timestamptz
    returning cleaned_input_hash as id
  `);
  const deletedByAge = byAge.length;

  const countRows = await db.execute<{ count: string }>(sql`
    select count(*)::text as count from public.match_cache
  `);
  const remainingAfterAge = Number(countRows[0]?.count ?? '0');

  let deletedByCap = 0;
  if (remainingAfterAge > maxRows) {
    const byCap = await db.execute<{ id: string }>(sql`
      delete from public.match_cache
      where cleaned_input_hash in (
        select cleaned_input_hash
        from public.match_cache
        order by last_used_at asc
        limit ${remainingAfterAge - maxRows}
      )
      returning cleaned_input_hash as id
    `);
    deletedByCap = byCap.length;
  }

  return {
    deletedByAge,
    deletedByCap,
    remaining: remainingAfterAge - deletedByCap,
  };
}
