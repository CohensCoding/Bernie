import OpenAI from 'openai';
import { z } from 'zod';

const OpenAiEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().min(1).optional(),
});

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

