const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const DEFAULT_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIM = 1536;

export interface EmbedOptions {
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
}

export async function embedText(text: string, options: EmbedOptions): Promise<number[]> {
  if (!options.apiKey) {
    throw new Error('embedText: OPENAI_API_KEY is required');
  }
  const body = {
    input: text,
    model: options.model ?? DEFAULT_MODEL,
    encoding_format: 'float',
  };
  const init: RequestInit = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify(body),
  };
  if (options.signal) init.signal = options.signal;
  const response = await fetch(OPENAI_EMBEDDINGS_URL, init);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`OpenAI embeddings failed (${response.status}): ${text.slice(0, 240)}`);
  }
  const payload = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const vec = payload.data?.[0]?.embedding;
  if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIM) {
    throw new Error(`OpenAI embeddings returned unexpected shape (len=${vec?.length ?? 'n/a'})`);
  }
  return vec;
}
