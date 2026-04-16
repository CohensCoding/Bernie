import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { Card, CardTransaction } from '@/types/db';

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();

    const [{ data: cards, error: cardsError }, { data: txs, error: txError }, { data: imports, error: impError }] =
      await Promise.all([
        supabase.from('cards').select('*').order('created_at', { ascending: false }),
        supabase
          .from('card_transactions')
          .select('*')
          .order('purchase_date', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false }),
        supabase.from('card_imports').select('*').order('created_at', { ascending: false }),
      ]);

    if (cardsError) throw new Error(cardsError.message);
    if (txError) throw new Error(txError.message);
    if (impError) throw new Error(impError.message);

    const latestTxByCard = new Map<string, CardTransaction>();
    for (const tx of (txs ?? []) as CardTransaction[]) {
      if (!latestTxByCard.has(tx.card_id)) latestTxByCard.set(tx.card_id, tx);
    }

    const latestImportByCard = new Map<string, any>();
    for (const imp of (imports ?? []) as any[]) {
      if (!latestImportByCard.has(String(imp.card_id))) latestImportByCard.set(String(imp.card_id), imp);
    }

    const header = [
      'card_id',
      'player',
      'team',
      'sport',
      'year',
      'brand',
      'set',
      'subset',
      'card_number',
      'parallel',
      'serial_number',
      'print_run',
      'graded',
      'grading_company',
      'grade',
      'rookie',
      'auto',
      'patch',
      'purchase_price',
      'taxes',
      'shipping',
      'total_cost',
      'purchase_date',
      'platform',
      'source_url',
      'source_item_id',
      'notes',
      'created_at',
      'updated_at',
      // market placeholders (Phase 2+)
      'current_value',
      'gain_loss',
      'gain_loss_pct',
      'valuation_confidence',
      'last_comp_price',
      'last_comp_date',
    ];

    const rows: string[][] = [];
    rows.push(header);

    for (const c0 of (cards ?? []) as Card[]) {
      const c = c0 as Card;
      const tx = latestTxByCard.get(c.id) ?? null;
      const imp = latestImportByCard.get(c.id) ?? null;
      const sourceUrl = tx?.source_url ?? imp?.external_url ?? null;
      const sourceItemId = extractEbayItemIdFromUrl(sourceUrl);

      rows.push([
        c.id,
        c.player_name ?? '',
        c.team ?? '',
        c.sport ?? '',
        c.year != null ? String(c.year) : '',
        c.brand ?? '',
        c.set_name ?? '',
        c.subset ?? '',
        c.card_number ?? '',
        c.parallel ?? '',
        c.serial_number != null ? String(c.serial_number) : '',
        c.print_run != null ? String(c.print_run) : '',
        c.graded ? 'true' : 'false',
        c.grading_company ?? '',
        c.grade ?? '',
        c.rookie ? 'true' : 'false',
        c.auto ? 'true' : 'false',
        c.patch ? 'true' : 'false',
        tx ? dollars(tx.purchase_price_cents) : '',
        tx ? dollars(tx.taxes_cents) : '',
        tx ? dollars(tx.shipping_cents) : '',
        tx ? dollars(tx.total_cost_cents) : '',
        tx?.purchase_date ?? '',
        tx?.platform ?? '',
        sourceUrl ?? '',
        sourceItemId ?? '',
        c.notes ?? '',
        c.created_at ?? '',
        c.updated_at ?? '',
        '',
        '',
        '',
        '',
        '',
        '',
      ]);
    }

    const csv = toCsv(rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="bernie-cards-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function dollars(cents: number) {
  return (cents / 100).toFixed(2);
}

function toCsv(rows: string[][]) {
  const escape = (v: string) => {
    const s = v ?? '';
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return rows.map((r) => r.map(escape).join(',')).join('\n') + '\n';
}

function extractEbayItemIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /\/itm\/(\d{9,15})(?:[/?]|$)/i.exec(url);
  return m ? m[1] : null;
}

