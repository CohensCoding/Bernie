export type ValuationStatus = 'ok' | 'unavailable' | 'error';

export type CardIdentity = {
  id: string;
  title_raw: string | null;
  player_name: string | null;
  sport: string | null;
  team: string | null;
  year: number | null;
  brand: string | null;
  set_name: string | null;
  subset: string | null;
  card_number: string | null;
  parallel: string | null;
  serial_number: number | null;
  print_run: number | null;
  rookie: boolean;
  auto: boolean;
  patch: boolean;
  graded: boolean;
  grading_company: string | null;
  grade: string | null;
};

export type ValuationEstimate = {
  provider: string;
  status: ValuationStatus;
  confidence: number | null; // 0..1
  match_notes: string | null;
  low_cents: number | null;
  mid_cents: number | null;
  high_cents: number | null;
  last_comp_price_cents: number | null;
  last_comp_date: string | null; // YYYY-MM-DD
  comp_count: number | null;
};

