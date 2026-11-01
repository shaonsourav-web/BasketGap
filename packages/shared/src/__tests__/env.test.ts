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

  it('treats both provider keys as optional and defaults each model', () => {
    const env = loadEnv({ DATABASE_URL: 'postgresql://user:pass@host:6543/postgres' });
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.GEMINI_EMBEDDING_MODEL).toBe('gemini-embedding-001');
    expect(env.OPENAI_LLM_MODEL).toBe('gpt-6-luna');
  });

  it('honours an OPENAI_LLM_MODEL override', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgresql://user:pass@host:6543/postgres',
      OPENAI_API_KEY: 'k',
      OPENAI_LLM_MODEL: 'gpt-6.1-terra',
    });
    expect(env.OPENAI_API_KEY).toBe('k');
    expect(env.OPENAI_LLM_MODEL).toBe('gpt-6.1-terra');
  });
});
