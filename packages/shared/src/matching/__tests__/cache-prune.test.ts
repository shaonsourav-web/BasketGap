import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import type { Db } from '../../db/client.ts';
import { pruneMatchCache } from '../cache-prune.ts';

const dialect = new PgDialect();

interface Captured {
  sql: string;
  params: unknown[];
}

/**
 * db.execute() is the only method pruneMatchCache touches, so a recorder that
 * renders each SQL fragment through the real Postgres dialect is enough to
 * assert both behaviour and parameterisation without a live database.
 */
function fakeDb(responses: unknown[][]): { db: Db; calls: Captured[] } {
  const calls: Captured[] = [];
  let i = 0;
  const db = {
    execute(query: SQL) {
      const { sql, params } = dialect.sqlToQuery(query);
      calls.push({ sql, params });
      return Promise.resolve(responses[i++] ?? []);
    },
  } as unknown as Db;
  return { db, calls };
}

function rows(n: number): Array<{ id: string }> {
  return Array.from({ length: n }, (_, k) => ({ id: `h${k}` }));
}

describe('pruneMatchCache', () => {
  it('deletes rows older than maxAgeDays and reports the remaining count', async () => {
    const { db, calls } = fakeDb([rows(3), [{ count: '10' }]]);
    const result = await pruneMatchCache(db, {
      maxAgeDays: 90,
      maxRows: 200_000,
      now: new Date('2026-09-02T00:00:00.000Z'),
    });

    expect(result).toEqual({ deletedByAge: 3, deletedByCap: 0, remaining: 10 });
    // age delete + count only; the cap pass is skipped when under the ceiling.
    expect(calls).toHaveLength(2);
    expect(calls[0]?.sql).toMatch(/delete from public\.match_cache/);
    expect(calls[0]?.sql).toMatch(/last_used_at </);
  });

  it('passes the cutoff as a bound parameter, never interpolated text', async () => {
    const { db, calls } = fakeDb([[], [{ count: '0' }]]);
    await pruneMatchCache(db, {
      maxAgeDays: 30,
      now: new Date('2026-09-02T00:00:00.000Z'),
    });

    expect(calls[0]?.params).toEqual(['2026-08-03T00:00:00.000Z']);
    expect(calls[0]?.sql).toContain('$1');
    expect(calls[0]?.sql).not.toContain('2026-08-03');
  });

  it('honours maxAgeDays when computing the cutoff', async () => {
    const { db, calls } = fakeDb([[], [{ count: '0' }]]);
    await pruneMatchCache(db, { maxAgeDays: 1, now: new Date('2026-09-02T12:00:00.000Z') });
    expect(calls[0]?.params).toEqual(['2026-09-01T12:00:00.000Z']);
  });

  it('deletes the oldest rows beyond maxRows when still over the cap', async () => {
    const { db, calls } = fakeDb([rows(2), [{ count: '105' }], rows(5)]);
    const result = await pruneMatchCache(db, { maxAgeDays: 90, maxRows: 100 });

    expect(result).toEqual({ deletedByAge: 2, deletedByCap: 5, remaining: 100 });
    expect(calls).toHaveLength(3);
    expect(calls[2]?.sql).toMatch(/order by last_used_at asc/);
    expect(calls[2]?.params).toEqual([5]);
    expect(calls[2]?.sql).not.toMatch(/limit 5/);
  });

  it('applies the documented defaults', async () => {
    const { db, calls } = fakeDb([[], [{ count: '199999' }]]);
    const now = new Date('2026-09-02T00:00:00.000Z');
    const result = await pruneMatchCache(db, { now });

    // 199,999 rows is under the 200,000 default cap, so no second delete.
    expect(calls).toHaveLength(2);
    expect(result.deletedByCap).toBe(0);
    // 90 days before now.
    expect(calls[0]?.params).toEqual(['2026-06-04T00:00:00.000Z']);
  });

  it('treats a missing count row as zero', async () => {
    const { db } = fakeDb([[], []]);
    const result = await pruneMatchCache(db, { maxRows: 10 });
    expect(result).toEqual({ deletedByAge: 0, deletedByCap: 0, remaining: 0 });
  });
});
