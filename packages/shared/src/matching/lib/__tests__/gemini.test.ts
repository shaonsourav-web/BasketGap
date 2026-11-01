import { afterEach, describe, expect, it, vi } from 'vitest';

import { embedText, EMBEDDING_DIM } from '../gemini.ts';

function stubFetchOnce(body: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValueOnce(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

function lastCall(): { url: string; init: RequestInit } {
  const call = vi.mocked(fetch).mock.calls[0];
  return { url: String(call?.[0]), init: call?.[1] as RequestInit };
}

describe('embedText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests 1536 dims from the embedding model and returns that width', async () => {
    const values = Array.from({ length: EMBEDDING_DIM }, () => 2);
    stubFetchOnce({ embedding: { values } });

    const vec = await embedText('full cream milk', { apiKey: 'k-test' });

    expect(vec).toHaveLength(EMBEDDING_DIM);
    const { url, init } = lastCall();
    expect(url).toContain('gemini-embedding-001:embedContent');
    const body = JSON.parse(String(init.body)) as {
      outputDimensionality: number;
      content: { parts: Array<{ text: string }> };
    };
    expect(body.outputDimensionality).toBe(1536);
    expect(body.content.parts[0]?.text).toBe('full cream milk');
  });

  it('L2-normalises the truncated vector (Gemini does not at non-native dims)', async () => {
    // Raw magnitude here is sqrt(1536 * 4) = 78.38..., nowhere near unit length.
    const values = Array.from({ length: EMBEDDING_DIM }, () => 2);
    stubFetchOnce({ embedding: { values } });

    const vec = await embedText('milk', { apiKey: 'k-test' });

    const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0));
    expect(norm).toBeCloseTo(1, 10);
    expect(vec[0]).toBeCloseTo(2 / Math.sqrt(EMBEDDING_DIM * 4), 12);
  });

  it('sends the key in the x-goog-api-key header, never in the URL', async () => {
    stubFetchOnce({ embedding: { values: Array.from({ length: EMBEDDING_DIM }, () => 1) } });

    await embedText('milk', { apiKey: 'super-secret-key' });

    const { url, init } = lastCall();
    expect(url).not.toContain('super-secret-key');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('super-secret-key');
  });

  it('honours an overridden embedding model', async () => {
    stubFetchOnce({ embedding: { values: Array.from({ length: EMBEDDING_DIM }, () => 1) } });

    await embedText('milk', { apiKey: 'k-test', model: 'text-embedding-004' });

    expect(lastCall().url).toContain('text-embedding-004:embedContent');
  });

  it('throws when the API key is missing', async () => {
    await expect(embedText('milk', { apiKey: '' })).rejects.toThrow(/GEMINI_API_KEY/);
  });

  it('throws when Gemini returns non-2xx', async () => {
    stubFetchOnce({ error: 'quota' }, 429);
    await expect(embedText('milk', { apiKey: 'k-test' })).rejects.toThrow(
      /Gemini embeddings failed \(429\)/,
    );
  });

  it('throws when the vector width is not 1536', async () => {
    stubFetchOnce({ embedding: { values: [1, 2, 3] } });
    await expect(embedText('milk', { apiKey: 'k-test' })).rejects.toThrow(/unexpected shape/);
  });

  it('throws on a zero vector rather than dividing by zero', async () => {
    stubFetchOnce({ embedding: { values: Array.from({ length: EMBEDDING_DIM }, () => 0) } });
    await expect(embedText('milk', { apiKey: 'k-test' })).rejects.toThrow(/zero or non-finite/);
  });
});
