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

commit;

