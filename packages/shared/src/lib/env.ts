import { z } from 'zod';

export const BaseEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // One key enables both provider tiers (embeddings + LLM disambiguation).
  // Absent → the engine degrades to trigram-only / rank-only.
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_LLM_MODEL: z.string().min(1).default('gemini-2.5-flash'),
  GEMINI_EMBEDDING_MODEL: z.string().min(1).default('gemini-embedding-001'),
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
