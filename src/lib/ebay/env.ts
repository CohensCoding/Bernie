import { z } from 'zod';

/** OAuth redirect_uri must be YOUR app URL — not signin.ebay.com or eBayISAPI.dll templates. */
function looksLikeLegacyEbaySignInUrl(s: string): boolean {
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase();
    if (host === 'signin.ebay.com' || host.endsWith('.signin.ebay.com')) return true;
    if (u.pathname.toLowerCase().includes('ebayisapi.dll')) return true;
    return false;
  } catch {
    return true;
  }
}

const EbayEnvSchema = z.object({
  EBAY_CLIENT_ID: z.string().min(1),
  EBAY_CLIENT_SECRET: z.string().min(1),
  /**
   * Must be the exact OAuth redirect URL you registered with eBay (https://.../api/integrations/ebay/callback).
   * This is NOT the eBay "RuName" — that short string will fail OAuth unless used as the registered URI (rare).
   */
  EBAY_REDIRECT_URI: z
    .string()
    .trim()
    .min(1)
    .refine((s) => /^https:\/\//i.test(s), {
      message:
        'Must be a full https:// callback URL (e.g. https://YOUR_DOMAIN/api/integrations/ebay/callback). Do not put the eBay RuName here — use the same URL as in your eBay developer app OAuth redirect list.',
    })
    .refine((s) => !looksLikeLegacyEbaySignInUrl(s), {
      message:
        'Must be your app’s callback URL (e.g. https://YOUR_DOMAIN/api/integrations/ebay/callback), not signin.ebay.com or eBayISAPI.dll. In the eBay Developer Portal, add that exact https URL under OAuth redirect URIs for your keyset.',
    }),
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
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid eBay env configuration: ${detail}`);
  }
  return parsed.data;
}

