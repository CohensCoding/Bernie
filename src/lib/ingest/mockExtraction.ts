import type { CardDetail } from '@/lib/db/cards';
import { emptyExtractionPayload, type ExtractionPayload } from '@/types/extraction';

function withVal<T>(
  value: T | null,
  confidence: number | null = 0.72,
  evidence?: string[],
): { value: T | null; confidence: number | null; evidence: string[] | null } {
  return { value, confidence, evidence: evidence?.length ? evidence : null };
}

export function buildMockExtraction(detail: CardDetail): ExtractionPayload {
  const latest = detail.transactions[0] ?? null;

  const p: ExtractionPayload = emptyExtractionPayload();
  p.title_raw = withVal(detail.card.title_raw);
  p.player_name = withVal(detail.card.player_name);
  p.sport = withVal(detail.card.sport);
  p.team = withVal(detail.card.team);
  p.year = withVal(detail.card.year);
  p.brand = withVal(detail.card.brand);
  p.set_name = withVal(detail.card.set_name);
  p.subset = withVal(detail.card.subset);
  p.card_number = withVal(detail.card.card_number);
  p.parallel = withVal(detail.card.parallel);
  p.serial_number = withVal(detail.card.serial_number);
  p.print_run = withVal(detail.card.print_run);
  p.rookie = withVal(detail.card.rookie, 0.9, ['Seeded from card record']);
  p.auto = withVal(detail.card.auto, 0.9, ['Seeded from card record']);
  p.patch = withVal(detail.card.patch, 0.9, ['Seeded from card record']);
  p.graded = withVal(detail.card.graded, 0.9, ['Seeded from card record']);
  p.grading_company = withVal(detail.card.grading_company);
  p.grade = withVal(detail.card.grade);
  p.notes = withVal(detail.card.notes, 0.55);

  if (latest) {
    p.platform = withVal(latest.platform, 0.8);
    p.source_url = withVal(latest.source_url, 0.7);
    p.purchase_date = withVal(latest.purchase_date, 0.75);
    p.purchase_price = withVal(latest.purchase_price_cents / 100, 0.8);
    p.taxes = withVal(latest.taxes_cents / 100, 0.8);
    p.shipping = withVal(latest.shipping_cents / 100, 0.8);
    p.total_cost = withVal(latest.total_cost_cents / 100, 0.85);
    p.title_raw = withVal(latest.title_raw ?? detail.card.title_raw, 0.75);
  } else {
    p.platform = withVal('eBay', 0.4, ['Mocked default']);
  }

  return p;
}

