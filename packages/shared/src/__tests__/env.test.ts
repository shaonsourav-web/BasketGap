import { describe, it, expect } from 'vitest';
import { loadEnv } from '../lib/env.ts';

describe('loadEnv', () => {
  it('parses a valid DATABASE_URL', () => {
    const env = loadEnv({ DATABASE_URL: 'postgresql://user:pass@host:6543/postgres' });
    expect(env.DATABASE_URL).toBe('postgresql://user:pass@host:6543/postgres');
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it('throws when DATABASE_URL is empty', () => {
    expect(() => loadEnv({ DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
  });
});
