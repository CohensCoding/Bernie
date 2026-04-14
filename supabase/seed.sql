-- Bernie Layer 1 - seed data

begin;

-- Make seed re-runnable
truncate table public.card_assets restart identity;
truncate table public.card_transactions restart identity cascade;
truncate table public.cards restart identity cascade;

-- Cards
insert into public.cards (
  id, title_raw, player_name, sport, team,
  year, brand, set_name, subset, card_number, parallel,
  serial_number, print_run,
  rookie, auto, patch, card_type_tags,
  graded, grading_company, grade,
  notes
) values
  (
    '11111111-1111-1111-1111-111111111111',
    '2023 Panini Prizm Victor Wembanyama Rookie Silver PSA 10',
    'Victor Wembanyama', 'Basketball', 'San Antonio Spurs',
    2023, 'Panini', 'Prizm', null, '1', 'Silver',
    null, null,
    true, false, false, array['rookie','numbered']::text[],
    true, 'PSA', '10',
    'Seed card'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    '2018 Topps Chrome Shohei Ohtani Rookie Auto /99 BGS 9.5',
    'Shohei Ohtani', 'Baseball', 'Los Angeles Dodgers',
    2018, 'Topps', 'Chrome', null, null, 'Rookie Auto',
    23, 99,
    true, true, false, array['rookie','auto','numbered','graded']::text[],
    true, 'BGS', '9.5',
    null
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    '2020 Select Joe Burrow Rookie Patch',
    'Joe Burrow', 'Football', 'Cincinnati Bengals',
    2020, 'Panini', 'Select', null, null, null,
    null, null,
    true, false, true, array['rookie','patch']::text[],
    false, null, null,
    null
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    '2003 Upper Deck LeBron James Rookie',
    'LeBron James', 'Basketball', 'Cleveland Cavaliers',
    2003, 'Upper Deck', null, null, null, null,
    null, null,
    true, false, false, array['rookie']::text[],
    false, null, null,
    null
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    '2017 Donruss Optic Patrick Mahomes Rated Rookie Holo PSA 9',
    'Patrick Mahomes', 'Football', 'Kansas City Chiefs',
    2017, 'Panini', 'Donruss Optic', 'Rated Rookie', null, 'Holo',
    null, null,
    true, false, false, array['rookie','graded']::text[],
    true, 'PSA', '9',
    null
  ),
  (
    '66666666-6666-6666-6666-666666666666',
    '2011 Topps Update Mike Trout Rookie',
    'Mike Trout', 'Baseball', 'Los Angeles Angels',
    2011, 'Topps', 'Update', null, 'US175', null,
    null, null,
    true, false, false, array['rookie']::text[],
    false, null, null,
    null
  ),
  (
    '77777777-7777-7777-7777-777777777777',
    '2022 Bowman Chrome Elly De La Cruz 1st Bowman Refractor /499',
    'Elly De La Cruz', 'Baseball', 'Cincinnati Reds',
    2022, 'Topps', 'Bowman Chrome', '1st Bowman', null, 'Refractor',
    127, 499,
    false, false, false, array['numbered']::text[],
    false, null, null,
    null
  ),
  (
    '88888888-8888-8888-8888-888888888888',
    '2019 Panini Mosaic Luka Doncic Silver PSA 10',
    'Luka Dončić', 'Basketball', 'Dallas Mavericks',
    2019, 'Panini', 'Mosaic', null, null, 'Silver',
    null, null,
    false, false, false, array['graded']::text[],
    true, 'PSA', '10',
    null
  ),
  (
    '99999999-9999-9999-9999-999999999999',
    '2021 Topps Stadium Club Chrome Wander Franco Rookie Auto',
    'Wander Franco', 'Baseball', 'Tampa Bay Rays',
    2021, 'Topps', 'Stadium Club Chrome', null, null, 'Rookie Auto',
    null, null,
    true, true, false, array['rookie','auto']::text[],
    false, null, null,
    null
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '2020 Panini Prizm Anthony Edwards Rookie Base',
    'Anthony Edwards', 'Basketball', 'Minnesota Timberwolves',
    2020, 'Panini', 'Prizm', null, null, 'Base',
    null, null,
    true, false, false, array['rookie']::text[],
    false, null, null,
    null
  );

-- Transactions (spread across months for activity chart)
insert into public.card_transactions (
  id, card_id, platform, source_url, title_raw,
  purchase_date,
  purchase_price_cents, taxes_cents, shipping_cents, total_cost_cents,
  notes
) values
  (
    '10000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'eBay', 'https://example.com/ebay/1',
    '2023 Panini Prizm Victor Wembanyama Rookie Silver PSA 10',
    '2026-01-12',
    125000, 10250, 0, 135250,
    null
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '22222222-2222-2222-2222-222222222222',
    'eBay', 'https://example.com/ebay/2',
    '2018 Topps Chrome Shohei Ohtani Rookie Auto /99 BGS 9.5',
    '2025-11-02',
    750000, 60250, 2500, 812750,
    'Big graded purchase'
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    '33333333-3333-3333-3333-333333333333',
    'eBay', 'https://example.com/ebay/3',
    '2020 Select Joe Burrow Rookie Patch',
    '2025-10-15',
    22000, 1870, 599, 24469,
    null
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    '44444444-4444-4444-4444-444444444444',
    'eBay', 'https://example.com/ebay/4',
    '2003 Upper Deck LeBron James Rookie',
    '2025-09-08',
    18000, 1525, 750, 20275,
    null
  ),
  (
    '10000000-0000-0000-0000-000000000005',
    '55555555-5555-5555-5555-555555555555',
    'eBay', 'https://example.com/ebay/5',
    '2017 Donruss Optic Patrick Mahomes Rated Rookie Holo PSA 9',
    '2025-12-03',
    95000, 8025, 0, 103025,
    null
  ),
  (
    '10000000-0000-0000-0000-000000000006',
    '66666666-6666-6666-6666-666666666666',
    'eBay', 'https://example.com/ebay/6',
    '2011 Topps Update Mike Trout Rookie',
    '2025-08-21',
    7200, 612, 499, 8311,
    null
  ),
  (
    '10000000-0000-0000-0000-000000000007',
    '77777777-7777-7777-7777-777777777777',
    'eBay', 'https://example.com/ebay/7',
    '2022 Bowman Chrome Elly De La Cruz 1st Bowman Refractor /499',
    '2026-02-09',
    5400, 459, 399, 6258,
    null
  ),
  (
    '10000000-0000-0000-0000-000000000008',
    '88888888-8888-8888-8888-888888888888',
    'eBay', 'https://example.com/ebay/8',
    '2019 Panini Mosaic Luka Doncic Silver PSA 10',
    '2026-03-18',
    68000, 5780, 0, 73780,
    null
  ),
  (
    '10000000-0000-0000-0000-000000000009',
    '99999999-9999-9999-9999-999999999999',
    'eBay', 'https://example.com/ebay/9',
    '2021 Topps Stadium Club Chrome Wander Franco Rookie Auto',
    '2025-07-30',
    15500, 1317, 499, 17316,
    'Example: watchlist player risk'
  ),
  (
    '10000000-0000-0000-0000-000000000010',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'eBay', 'https://example.com/ebay/10',
    '2020 Panini Prizm Anthony Edwards Rookie Base',
    '2025-06-11',
    1200, 101, 399, 1700,
    null
  );

commit;

