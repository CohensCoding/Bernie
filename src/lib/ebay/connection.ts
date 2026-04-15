import { getSupabaseServerClient } from '@/lib/supabase/server';
import { maybeDecrypt, maybeEncrypt } from '@/lib/ebay/crypto';

export type EbayConnection = {
  id: string;
  access_token: string | null;
  refresh_token: string;
  scopes: string[];
  expires_at: string | null; // timestamptz
};

export async function getEbayConnection(): Promise<EbayConnection | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('integrations_ebay_connection')
    .select('id,access_token,refresh_token,scopes,expires_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id as string,
    access_token: (data.access_token as string | null) ? maybeDecrypt(data.access_token as string) : null,
    refresh_token: maybeDecrypt(data.refresh_token as string),
    scopes: (data.scopes as string[]) ?? [],
    expires_at: (data.expires_at as string | null) ?? null,
  };
}

export async function upsertEbayConnection(input: {
  access_token: string;
  refresh_token: string;
  scopes: string[];
  expires_at: string | null;
}) {
  const supabase = getSupabaseServerClient();
  // Single-user: just insert a new row; select latest by created_at.
  const { error } = await supabase.from('integrations_ebay_connection').insert({
    access_token: maybeEncrypt(input.access_token),
    refresh_token: maybeEncrypt(input.refresh_token),
    scopes: input.scopes,
    expires_at: input.expires_at,
  });
  if (error) throw new Error(error.message);
}

export async function disconnectEbay() {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('integrations_ebay_connection').delete().not('id', 'is', null);
  if (error) throw new Error(error.message);
}

