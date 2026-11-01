import { z } from 'zod';

export const BaseEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // Each provider key enables one tier, independently of the other.
  // GEMINI_API_KEY absent → no vector search (trigram-only).
  // OPENAI_API_KEY absent → no LLM disambiguation (rank-only).
  // Both absent → fully offline deterministic matching.
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_EMBEDDING_MODEL: z.string().min(1).default('gemini-embedding-001'),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_LLM_MODEL: z.string().min(1).default('gpt-6-luna'),
});

export type BaseEnv = z.infer<typeof BaseEnvSchema>;

export function parseEnv<T extends z.ZodTypeAny>(
  schema: T,
  source: NodeJS.ProcessEnv = process.env,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return result.data;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): BaseEnv {
  return parseEnv(BaseEnvSchema, source);
}
