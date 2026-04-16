import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function NewCardManualRedirect() {
  // Manual add creates a draft card server-side then sends you to the existing edit form.
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('cards')
    .insert({
      rookie: false,
      auto: false,
      patch: false,
      graded: false,
      card_type_tags: [],
    })
    .select('id')
    .single();

  if (error || !data?.id) redirect('/cards?error=manual_create_failed');
  redirect(`/cards/${data.id}/edit`);
}

