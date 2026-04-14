import { z } from 'zod';

const EnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export type Env = z.infer<typeof EnvSchema>;

export function getEnv(): Env {
  const parsed = EnvSchema.safeParse({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!parsed.success) {
    // Don’t crash at build time unless a route actually needs DB.
    // The calling code will throw a readable message when invoked.
    throw new Error(
      `Missing required environment variables: ${parsed.error.issues
        .map((i) => i.path.join('.'))
        .join(', ')}. Copy .env.example -> .env.local and fill values.`,
    );
  }

  return parsed.data;
}

