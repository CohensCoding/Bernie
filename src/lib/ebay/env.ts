import { z } from 'zod';

const EbayEnvSchema = z.object({
  EBAY_CLIENT_ID: z.string().min(1),
  EBAY_CLIENT_SECRET: z.string().min(1),
  EBAY_REDIRECT_URI: z.string().url(),
  EBAY_ENV: z.enum(['production', 'sandbox']).default('production'),
  // Optional: if provided, tokens are encrypted at rest using AES-256-GCM.
  EBAY_TOKEN_ENCRYPTION_KEY: z.string().optional(),
  // Optional override scopes (space-separated). Defaults to basic api_scope.
  EBAY_SCOPES: z.string().optional(),
});

export type EbayEnv = z.infer<typeof EbayEnvSchema>;

export function getEbayEnv(): EbayEnv {
  const parsed = EbayEnvSchema.safeParse({
    EBAY_CLIENT_ID: process.env.EBAY_CLIENT_ID,
    EBAY_CLIENT_SECRET: process.env.EBAY_CLIENT_SECRET,
    EBAY_REDIRECT_URI: process.env.EBAY_REDIRECT_URI,
    EBAY_ENV: process.env.EBAY_ENV ?? 'production',
    EBAY_TOKEN_ENCRYPTION_KEY: process.env.EBAY_TOKEN_ENCRYPTION_KEY,
    EBAY_SCOPES: process.env.EBAY_SCOPES,
  });
  if (!parsed.success) {
    throw new Error(
      `Missing required eBay env vars: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  }
  return parsed.data;
}

