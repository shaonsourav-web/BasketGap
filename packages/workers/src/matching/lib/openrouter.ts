import type { LlmChooseInput, LlmChooseOutput } from '../types.ts';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const DEFAULT_OPENROUTER_MODEL = 'google/gemini-2.0-flash-001';

export interface ChooseOptions {
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
}

const SYSTEM_PROMPT = `You are a grocery product matcher for an Australian shopping app.
You must choose the single best canonical product from the provided shortlist for the user's shopping list line.

Rules:
- You MUST return one of the provided shortlist IDs verbatim, or null if no candidate is a confident match.
- Never invent an ID. Never include an ID outside the shortlist.
- Confidence is a number from 0 to 1. Return < 0.55 if you are unsure.
- Output STRICT JSON only: {"chosen_id": "...", "confidence": 0.0, "reasoning": "..."}.`;

export async function chooseWithLlm(
  input: LlmChooseInput,
  options: ChooseOptions,
): Promise<LlmChooseOutput> {
  if (!options.apiKey) {
    throw new Error('chooseWithLlm: OPENROUTER_API_KEY is required');
  }
  const shortlistText = input.shortlist
    .map(
      (c, i) =>
        `${i + 1}. id=${c.canonicalProductId} name="${c.name}" brand="${c.brand ?? ''}" size=${c.unitSizeValue ?? ''}${c.unitSizeUom ?? ''}`,
    )
    .join('\n');
  const userPrompt = `Shopping list line: "${input.cleaned}"
Shortlist:
${shortlistText}

Return the best match as strict JSON.`;
  const init: RequestInit = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${options.apiKey}`,
      'http-referer': 'https://basketgap.app',
      'x-title': 'BasketGap matcher',
    },
    body: JSON.stringify({
      model: options.model ?? DEFAULT_OPENROUTER_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
    }),
  };
  if (options.signal) init.signal = options.signal;
  const response = await fetch(OPENROUTER_URL, init);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`OpenRouter chat failed (${response.status}): ${text.slice(0, 240)}`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenRouter chat returned empty content');
  }
  const parsed = parseLooseJson(content);
  return {
    chosenId: normaliseId(parsed.chosen_id),
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
  };
}

function parseLooseJson(text: string): {
  chosen_id?: unknown;
  confidence?: unknown;
  reasoning?: unknown;
} {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        // fall through
      }
    }
    return {};
  }
}

function normaliseId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null') return null;
  return trimmed;
}
