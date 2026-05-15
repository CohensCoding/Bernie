-- Bernie Layer 1 - Supabase SQL schema
-- Single-user/no-auth for now. Includes nullable owner_id for future multi-user.

begin;

-- Extensions
create extension if not exists pgcrypto;

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'card_asset_type') then
    create type card_asset_type as enum ('screenshot');
  end if;
end $$;

-- Tables
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),

  -- future-proofing (Layer 1 does not enforce auth)
  owner_id uuid null,

  -- identity (best-effort)
  title_raw text null,
  player_name text null,
  sport text null,
  team text null,

  year int null,
  brand text null,
  set_name text null,
  subset text null,
  card_number text null,
  parallel text null,

  -- numbered / print run
  serial_number int null,
  print_run int null,

  -- attributes
  rookie boolean not null default false,
  auto boolean not null default false,
  patch boolean not null default false,
  card_type_tags text[] not null default '{}'::text[],

  -- grading
  graded boolean not null default false,
  grading_company text null,
  grade text null,

  notes text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'cards_set_updated_at') then
    create trigger cards_set_updated_at
    before update on public.cards
    for each row execute function public.set_updated_at();
  end if;
end $$;

create table if not exists public.card_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid null,

  card_id uuid not null references public.cards(id) on delete cascade,

  platform text null,
  source_url text null,

  -- raw listing/purchase title as seen on platform
  title_raw text null,

  purchase_date date null,

  -- money stored as cents (integers)
  purchase_price_cents int not null default 0,
  taxes_cents int not null default 0,
  shipping_cents int not null default 0,
  total_cost_cents int not null default 0,

  notes text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint card_transactions_money_nonnegative check (
    purchase_price_cents >= 0 and
    taxes_cents >= 0 and
    shipping_cents >= 0 and
    total_cost_cents >= 0
  )
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'card_transactions_set_updated_at') then
    create trigger card_transactions_set_updated_at
    before update on public.card_transactions
    for each row execute function public.set_updated_at();
  end if;
end $$;

create table if not exists public.card_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid null,

  card_id uuid null references public.cards(id) on delete cascade,
  transaction_id uuid null references public.card_transactions(id) on delete cascade,

  asset_type card_asset_type not null default 'screenshot',

  -- Supabase Storage location
  bucket text not null default 'card-assets',
  path text not null,

  mime_type text null,
  size_bytes bigint null,
  width int null,
  height int null,

  -- extraction provenance (Layer 1: LLM vision)
  extraction_model text null,
  extraction_confidence numeric null,
  extraction_raw jsonb null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint card_assets_card_or_transaction_present check (
    card_id is not null or transaction_id is not null
  )
);

-- Integrations: eBay connection (single-user, server-side tokens)
create table if not exists public.integrations_ebay_connection (
  id uuid primary key default gen_random_uuid(),
  -- access token can be null if we only retain refresh_token (but MVP stores both)
  access_token text null,
  refresh_token text not null,
  scopes text[] not null default '{}'::text[],
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'integrations_ebay_connection_set_updated_at') then
    create trigger integrations_ebay_connection_set_updated_at
    before update on public.integrations_ebay_connection
    for each row execute function public.set_updated_at();
  end if;
end $$;

-- External imports traceability + dedupe
create table if not exists public.card_imports (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  transaction_id uuid null references public.card_transactions(id) on delete set null,

  source text not null, -- e.g. 'ebay'
  external_id text not null, -- e.g. 'OrderID:TransactionID' or similar
  external_url text null,
  external_title text null,
  image_url text null,

  purchased_at date null,
  total_cost_cents int not null default 0,
  currency text null,

  raw jsonb null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'card_imports_set_updated_at') then
    create trigger card_imports_set_updated_at
    before update on public.card_imports
    for each row execute function public.set_updated_at();
  end if;
end $$;

create unique index if not exists card_imports_source_external_id_uq on public.card_imports (source, external_id);
create index if not exists card_imports_card_id_idx on public.card_imports (card_id);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'card_assets_set_updated_at') then
    create trigger card_assets_set_updated_at
    before update on public.card_assets
    for each row execute function public.set_updated_at();
  end if;
end $$;

-- Indexes for dashboard/table filtering
create index if not exists cards_player_name_idx on public.cards (player_name);
create index if not exists cards_sport_idx on public.cards (sport);
create index if not exists cards_team_idx on public.cards (team);
create index if not exists cards_year_idx on public.cards (year);
create index if not exists cards_brand_idx on public.cards (brand);
create index if not exists cards_set_name_idx on public.cards (set_name);
create index if not exists cards_graded_idx on public.cards (graded);

create index if not exists card_transactions_card_id_idx on public.card_transactions (card_id);
create index if not exists card_transactions_purchase_date_idx on public.card_transactions (purchase_date);
create index if not exists card_transactions_platform_idx on public.card_transactions (platform);

create index if not exists card_assets_card_id_idx on public.card_assets (card_id);
create index if not exists card_assets_transaction_id_idx on public.card_assets (transaction_id);
create unique index if not exists card_assets_bucket_path_uq on public.card_assets (bucket, path);

-- ==========================================================
-- Layer 2 foundation: valuations (stubbed, provider-ready)
-- ==========================================================

create table if not exists public.valuation_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid null,
  scope text not null default 'single', -- 'single' | 'bulk'
  status text not null default 'running', -- 'running' | 'ok' | 'failed'
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'valuation_runs_set_updated_at') then
    create trigger valuation_runs_set_updated_at
    before update on public.valuation_runs
    for each row execute function public.set_updated_at();
  end if;
end $$;

create table if not exists public.card_valuations_current (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid null,
  card_id uuid not null references public.cards(id) on delete cascade,

  provider text not null default 'stub',
  confidence numeric null, -- 0..1
  status text not null default 'unavailable', -- 'ok' | 'unavailable' | 'error'
  match_notes text null,

  low_cents int null,
  mid_cents int null,
  high_cents int null,

  last_comp_price_cents int null,
  last_comp_date date null,
  comp_count int null,

  last_valued_at timestamptz null,
  last_run_id uuid null references public.valuation_runs(id) on delete set null,
  last_error text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'card_valuations_current_set_updated_at') then
    create trigger card_valuations_current_set_updated_at
    before update on public.card_valuations_current
    for each row execute function public.set_updated_at();
  end if;
end $$;

create unique index if not exists card_valuations_current_card_id_uq on public.card_valuations_current (card_id);
create index if not exists card_valuations_current_last_valued_idx on public.card_valuations_current (last_valued_at);
create index if not exists card_valuations_current_status_idx on public.card_valuations_current (status);

create table if not exists public.card_valuation_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid null,
  card_id uuid not null references public.cards(id) on delete cascade,
  run_id uuid null references public.valuation_runs(id) on delete set null,

  provider text not null default 'stub',
  confidence numeric null,
  status text not null default 'unavailable',
  match_notes text null,

  low_cents int null,
  mid_cents int null,
  high_cents int null,

  last_comp_price_cents int null,
  last_comp_date date null,
  comp_count int null,

  valued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'card_valuation_snapshots_set_updated_at') then
    create trigger card_valuation_snapshots_set_updated_at
    before update on public.card_valuation_snapshots
    for each row execute function public.set_updated_at();
  end if;
end $$;

create index if not exists card_valuation_snapshots_card_id_idx on public.card_valuation_snapshots (card_id, valued_at desc);
create index if not exists card_valuation_snapshots_run_id_idx on public.card_valuation_snapshots (run_id);

-- ==========================================================
-- Layer 2: Comp & FMV intelligence
-- Spec: docs/LAYER_2_SPEC.md
-- Pre-flight decisions: docs/LAYER_2_DECISIONS.md
-- Additive only. Layer 1 tables above are not modified.
-- ==========================================================

-- Canonical card identity. Slug template:
--   {set-slug}-{year}-{card-number}-{player-slug}-{parallel-slug or 'base'}
-- See src/lib/layer2/identity/canonicalize.ts for the canonical algorithm.
create table if not exists public.canonical_cards (
  id text primary key,
  player text not null,
  year integer not null,
  set_name text not null,
  card_number text null,
  parallel text null,
  is_rookie boolean not null default false,
  is_autograph boolean not null default false,
  is_patch boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists canonical_cards_player_year_idx on public.canonical_cards (player, year);

-- Aliases / fuzzy matches → canonical id. Alias is the normalized lowercase
-- query string (see identity/normalize.ts).
create table if not exists public.card_aliases (
  alias text primary key,
  canonical_card_id text not null references public.canonical_cards(id) on delete cascade,
  confidence numeric not null default 1.0,
  source text not null,
  created_at timestamptz not null default now(),
  constraint card_aliases_source_known check (
    source in ('manual', 'ximilar', 'llm_parse', 'user_correction')
  )
);

create index if not exists card_aliases_canonical_idx on public.card_aliases (canonical_card_id);

-- Raw comp observations from external sources. Some sources (ebay_browse,
-- ebay_scrape) are stored here but NOT used by FMV math; the FMV compute
-- module filters to FMV-eligible sources (see src/lib/layer2/types.ts).
create table if not exists public.card_comps (
  id uuid primary key default gen_random_uuid(),
  canonical_card_id text not null references public.canonical_cards(id) on delete cascade,
  grader text not null,
  grade text not null,
  source text not null,
  source_listing_id text null,
  sale_price_cents integer not null,
  sale_date date not null,
  sale_type text null,
  listing_url text null,
  raw_payload jsonb null,
  fetched_at timestamptz not null default now(),
  constraint card_comps_price_nonneg check (sale_price_cents >= 0),
  constraint card_comps_source_known check (
    source in (
      'ebay_marketplace_insights',
      'ebay_browse',
      'ebay_scrape',
      'cardhedge',
      '130point',
      'card_ladder_manual',
      'psa'
    )
  ),
  constraint card_comps_sale_type_known check (
    sale_type is null or sale_type in (
      'bin',
      'auction',
      'best_offer_accepted',
      'active_listing',
      'unknown'
    )
  )
);

-- Dedupe on (source, source_listing_id) for rows with a stable listing id.
-- Full (non-partial) unique index is required so PostgREST
-- upsert(onConflict: 'source,source_listing_id') works. PostgreSQL treats
-- each NULL in source_listing_id as distinct, so multiple rows with NULL
-- ids are allowed (scraped data without stable keys).
drop index if exists public.card_comps_source_listing_uq;
create unique index if not exists card_comps_source_listing_uq
  on public.card_comps (source, source_listing_id);

create index if not exists card_comps_canonical_grade_date_idx
  on public.card_comps (canonical_card_id, grader, grade, sale_date desc);

create index if not exists card_comps_fetched_idx
  on public.card_comps (canonical_card_id, fetched_at desc);

-- Computed FMVs. One row per (canonical_card_id, grader, grade,
-- methodology_version). Cache invalidation is driven by expires_at; the
-- methodology_version dimension ensures v1.0.0 rows are never overwritten
-- by later methodology revisions.
create table if not exists public.card_fmv (
  id uuid primary key default gen_random_uuid(),
  canonical_card_id text not null references public.canonical_cards(id) on delete cascade,
  grader text not null,
  grade text not null,
  fmv_cents integer not null,
  ci_low_cents integer not null,
  ci_high_cents integer not null,
  sample_size integer not null,
  comps_used uuid[] not null,
  comps_excluded uuid[] not null default '{}'::uuid[],
  methodology_version text not null,
  date_range_start date not null,
  date_range_end date not null,
  is_stale boolean not null default false,
  computed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint card_fmv_ci_ordered check (ci_low_cents <= fmv_cents and fmv_cents <= ci_high_cents),
  constraint card_fmv_sample_size_min check (sample_size >= 3)
);

create unique index if not exists card_fmv_card_grade_method_uq
  on public.card_fmv (canonical_card_id, grader, grade, methodology_version);

create index if not exists card_fmv_expires_idx
  on public.card_fmv (canonical_card_id, expires_at);

-- Link existing portfolio cards to canonical identity. Additive and
-- optional: a portfolio card without a link still works for Layer 1.
create table if not exists public.card_canonical_links (
  card_id uuid primary key references public.cards(id) on delete cascade,
  canonical_card_id text not null references public.canonical_cards(id) on delete cascade,
  linked_at timestamptz not null default now(),
  linked_by text not null,
  constraint card_canonical_links_linked_by_known check (
    linked_by in ('user_manual', 'auto_match')
  )
);

create index if not exists card_canonical_links_canonical_idx
  on public.card_canonical_links (canonical_card_id);

commit;

