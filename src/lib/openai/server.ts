import OpenAI from 'openai';
import { z } from 'zod';

const OpenAiEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().min(1).optional(),
});

/** Server-only diagnostics: never log full API keys. */
export function getOpenAiRuntimeSummary() {
  const key = process.env.OPENAI_API_KEY;
  const keyPresent = typeof key === 'string' && key.length > 0;
  const keySuffix =
    keyPresent && typeof key === 'string' ? key.slice(-4) : null;

  const model = (() => {
    const parsed = OpenAiEnvSchema.safeParse({
      OPENAI_API_KEY: key,
      OPENAI_MODEL: process.env.OPENAI_MODEL,
    });
    return parsed.success ? parsed.data.OPENAI_MODEL ?? 'gpt-5.4-mini' : null;
  })();

  let baseUrlHost: string | null = null;
  try {
    const raw = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
    baseUrlHost = new URL(raw).host;
  } catch {
    baseUrlHost = null;
  }

  return {
    keyPresent,
    keySuffix,
    model,
    baseUrlHost,
    orgIdSet: Boolean(process.env.OPENAI_ORG_ID?.trim()),
    projectIdSet: Boolean(process.env.OPENAI_PROJECT_ID?.trim()),
  };
}

export function getOpenAiModel() {
  const parsed = OpenAiEnvSchema.safeParse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
  });
  if (!parsed.success) {
    throw new Error(
      `Missing required environment variables: ${parsed.error.issues
        .map((i) => i.path.join('.'))
        .join(', ')}. Add OPENAI_API_KEY to .env.local.`,
    );
  }
  return parsed.data.OPENAI_MODEL ?? 'gpt-5.4-mini';
}

/**
 * Server-only client. Uses OPENAI_API_KEY from the runtime environment (e.g. .env.local / Vercel).
 * OPENAI_ORG_ID / OPENAI_PROJECT_ID are read by the SDK from the environment when set (see OpenAI constructor).
 */
export function getOpenAiClient() {
  const parsed = OpenAiEnvSchema.safeParse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
  });
  if (!parsed.success) {
    throw new Error(
      `Missing required environment variables: ${parsed.error.issues
        .map((i) => i.path.join('.'))
        .join(', ')}. Add OPENAI_API_KEY to .env.local.`,
    );
  }
  return new OpenAI({ apiKey: parsed.data.OPENAI_API_KEY });
}

