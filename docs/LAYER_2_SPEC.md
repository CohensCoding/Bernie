# Bernie — Layer 2 Specification: Comp & FMV Intelligence

## Project context

Bernie is an existing Next.js 14 (App Router) + TypeScript + Supabase + Tailwind app
deployed on Vercel. Layer 1 (portfolio tracking) is complete and lives in `src/app/dashboard`,
`src/app/portfolio`, and a `cards` / `card_transactions` / `card_assets` Supabase schema.

**DO NOT MODIFY LAYER 1 CODE OR SCHEMA.** Layer 2 is additive only. The only existing
table you may reference (read-only) is `cards`, and only via a new join table.

## Mission

Build Layer 2: a comp-and-FMV intelligence module that answers the question
"is this card a fair price right now?" at a card show, on a phone, in under 5 seconds.
The user (Sam) makes real purchase decisions based on its output. Reliability and
transparency are more important than features.

## Hard reliability constraints (NEVER violate these)

1. **Never display a single FMV number without sample size, date range, and 
   per-comp drill-down available within one tap.**
2. **If sample_size < 3 for the queried (card, grade) pair, do NOT compute an FMV.**
   Return raw comps with a clear "INSUFFICIENT DATA" state.
3. **If most recent comp is > 30 days old, flag as STALE in the UI prominently.**
4. **Sale type matters.** A BIN at $500 with no offers is not the same signal as
   an accepted best offer at $500 or an auction close at $500. Store and display
   sale type. Weight BIN listings lower than auction/BO-accepted in FMV math.
5. **Outlier handling must be explicit and visible.** If we exclude comps from
   the FMV calculation, the UI must show them in a separate "excluded" list with
   the reason.
6. **Photo-based card identification must be confirmed by the user before comps
   are pulled.** Show the parsed identity (player, year, set, parallel, grade),
   require an explicit tap to confirm.
7. **Caching:** FMVs may be cached for max 6 hours. Raw comps may be cached for
   max 1 hour. Never serve stale data without showing the `computed_at` timestamp.
8. **All external API calls must be wrapped with timeout (5s), retry (1x with
   exponential backoff), and graceful degradation.** If eBay is down, return
   what we have from other sources with a clear "partial data" indicator.

## Non-goals for Layer 2

- Forward-facing valuation models (that's Layer 3)
- Player projections
- Alerts / notifications
- Listing automation
- Auto-purchase

---

## Phase plan

### Phase 1 — Foundation (target: 1 week)
- Schema migrations
- Source adapters (eBay first, stubs for others)
- FMV computation module with tests
- API route: `POST /api/comp/lookup` (text input only)

### Phase 2 — Mobile UI (target: 1 week)
- `/comp` route: mobile-first lookup page
- Result view with full comp transparency
- "Save to portfolio" integration with existing `cards` / `card_transactions`

### Phase 3 — Photo identification (target: 1 week)
- Ximilar integration (`POST /api/comp/identify`)
- Camera capture component on `/comp`
- Confirm-identity step before pulling comps

### Phase 4 — Additional sources (target: 1 week)
- Card Hedge AI integration (if API key available)
- 130Point scraper (with caching and rate-limiting)
- Card Ladder CSV import endpoint
- PSA Public API for pop reports

**Hard deadline: June 13, 2026 for Phases 1–3 minimum.**

---

## Schema additions

Create `supabase/migrations/0002_layer2_comps_and_fmv.sql`:

```sql
-- Canonical card identity (resolves "2018 Prizm Luka Silver" → stable id)
create table if not exists canonical_cards (
  id text primary key,                  -- e.g. 'prizm-2018-base-77-luka-doncic-silver'
  player text not null,
  year integer not null,
  set_name text not null,               -- e.g. 'Panini Prizm'
  card_number text,
  parallel text,                        -- e.g. 'Silver', 'Gold /10', null for base
  is_rookie boolean default false,
  is_autograph boolean default false,
  is_patch boolean default false,
  created_at timestamptz default now()
);

create index on canonical_cards (player, year);

-- Aliases / fuzzy matches → canonical id
create table if not exists card_aliases (
  alias text primary key,               -- normalized lowercase string
  canonical_card_id text not null references canonical_cards(id),
  confidence numeric not null default 1.0,
  source text not null,                 -- 'manual', 'ximilar', 'llm_parse', 'user_correction'
  created_at timestamptz default now()
);

-- Raw comp observations from external sources
create table if not exists card_comps (
  id uuid primary key default gen_random_uuid(),
  canonical_card_id text not null references canonical_cards(id),
  grader text not null,                 -- 'PSA' | 'BGS' | 'SGC' | 'CGC' | 'RAW'
  grade text not null,                  -- '10' | '9.5' | '9' | ... | 'RAW'
  source text not null,                 -- 'ebay_marketplace_insights' | 'ebay_browse' | 'cardhedge' | '130point' | 'card_ladder_manual' | 'psa'
  source_listing_id text,
  sale_price_cents integer not null,
  sale_date date not null,
  sale_type text,                       -- 'bin' | 'auction' | 'best_offer_accepted' | 'unknown'
  listing_url text,
  raw_payload jsonb,
  fetched_at timestamptz not null default now(),
  unique(source, source_listing_id)
);

create index on card_comps (canonical_card_id, grader, grade, sale_date desc);

-- Computed FMVs (cached for max 6 hours)
create table if not exists card_fmv (
  id uuid primary key default gen_random_uuid(),
  canonical_card_id text not null references canonical_cards(id),
  grader text not null,
  grade text not null,
  fmv_cents integer not null,
  ci_low_cents integer not null,
  ci_high_cents integer not null,
  sample_size integer not null,
  comps_used uuid[] not null,           -- references card_comps.id
  comps_excluded uuid[] not null default '{}',
  methodology_version text not null,    -- e.g. 'v1.0.0'
  date_range_start date not null,
  date_range_end date not null,
  computed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique(canonical_card_id, grader, grade, methodology_version)
);

create index on card_fmv (canonical_card_id, expires_at);

-- Link existing portfolio cards to canonical identity (additive, optional)
create table if not exists card_canonical_links (
  card_id uuid primary key references cards(id),
  canonical_card_id text not null references canonical_cards(id),
  linked_at timestamptz default now(),
  linked_by text not null               -- 'user_manual' | 'auto_match'
);
```

---

## Module structure

Create the following under `src/`:

```
src/
  lib/
    layer2/
      types.ts                  # Shared types: Comp, FMV, CardIdentity, Grade
      identity/
        parse.ts                # text → CardIdentity (uses Claude/OpenAI for hard cases)
        canonicalize.ts         # CardIdentity → canonical_card_id (DB lookup + create)
        normalize.ts            # string normalization helpers
      sources/
        types.ts                # Source interface: fetchComps(query) → RawComp[]
        ebay.ts                 # eBay Marketplace Insights + Browse fallback
        cardhedge.ts            # Stub for now; real impl Phase 4
        onethirtypoint.ts       # Stub for now; real impl Phase 4
        psa.ts                  # PSA Public API (pop reports, cert lookup)
        ximilar.ts              # Photo → CardIdentity
        cardladder_csv.ts       # CSV import parser
      fmv/
        compute.ts              # Main FMV algorithm (methodology v1.0.0)
        outliers.ts             # IQR-based exclusion
        weighting.ts            # Recency + sale-type weighting
        confidence.ts           # Bootstrap CI
        types.ts
      cache/
        comps.ts                # Read-through cache for comps (1h TTL)
        fmv.ts                  # Read-through cache for FMVs (6h TTL)
  app/
    comp/
      page.tsx                  # Mobile-first lookup UI
      result/[canonicalId]/page.tsx
      api/
        lookup/route.ts         # POST: { query, grade? } → FMV + comps
        identify/route.ts       # POST: { imageBase64 } → CardIdentity[]
        save/route.ts           # POST: { canonicalId, purchasePrice, grade, ... } → cards row
```

---

## FMV algorithm specification (methodology v1.0.0)

Pseudocode for `src/lib/layer2/fmv/compute.ts`:

```ts
function computeFmv(canonicalId: string, grader: string, grade: string): FmvResult {
  // 1. Pull comps for the exact (canonical_card_id, grader, grade)
  const allComps = await getComps({ canonicalId, grader, grade, daysBack: 90 });
  
  // 2. Insufficient data check (HARD GATE)
  if (allComps.length < 3) {
    return { status: 'INSUFFICIENT_DATA', sampleSize: allComps.length, comps: allComps };
  }
  
  // 3. Outlier rejection via IQR
  const prices = allComps.map(c => c.salePriceCents);
  const q1 = quantile(prices, 0.25);
  const q3 = quantile(prices, 0.75);
  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;
  
  const included = allComps.filter(c => 
    c.salePriceCents >= lowerFence && c.salePriceCents <= upperFence
  );
  const excluded = allComps.filter(c => 
    c.salePriceCents < lowerFence || c.salePriceCents > upperFence
  );
  
  if (included.length < 3) {
    return { status: 'INSUFFICIENT_DATA_AFTER_OUTLIERS', sampleSize: included.length, comps: allComps };
  }
  
  // 4. Weighting: recency exp decay (30-day half-life) × sale-type multiplier
  const now = Date.now();
  const HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;
  const saleTypeWeight = {
    'auction': 1.0,
    'best_offer_accepted': 1.0,
    'bin': 0.7,                // BIN may be aspirational
    'unknown': 0.5,
  };
  
  const weighted = included.map(c => {
    const ageMs = now - new Date(c.saleDate).getTime();
    const recencyWeight = Math.pow(0.5, ageMs / HALF_LIFE_MS);
    const typeWeight = saleTypeWeight[c.saleType] ?? 0.5;
    return { ...c, weight: recencyWeight * typeWeight };
  });
  
  // 5. Weighted mean (the FMV point estimate)
  const totalWeight = weighted.reduce((s, c) => s + c.weight, 0);
  const fmv = weighted.reduce((s, c) => s + c.salePriceCents * c.weight, 0) / totalWeight;
  
  // 6. Bootstrap 95% CI (1000 resamples)
  const samples = [];
  for (let i = 0; i < 1000; i++) {
    const resample = bootstrapSample(weighted);
    const tw = resample.reduce((s, c) => s + c.weight, 0);
    samples.push(resample.reduce((s, c) => s + c.salePriceCents * c.weight, 0) / tw);
  }
  samples.sort((a, b) => a - b);
  const ciLow = samples[Math.floor(samples.length * 0.025)];
  const ciHigh = samples[Math.floor(samples.length * 0.975)];
  
  // 7. Stale flag
  const mostRecent = Math.max(...included.map(c => new Date(c.saleDate).getTime()));
  const daysSinceLast = (now - mostRecent) / (1000 * 60 * 60 * 24);
  const isStale = daysSinceLast > 30;
  
  return {
    status: 'OK',
    fmvCents: Math.round(fmv),
    ciLowCents: Math.round(ciLow),
    ciHighCents: Math.round(ciHigh),
    sampleSize: included.length,
    excluded,
    isStale,
    daysSinceLastSale: daysSinceLast,
    methodologyVersion: 'v1.0.0',
  };
}
```

**Required tests (in `src/lib/layer2/fmv/__tests__/`):**
- INSUFFICIENT_DATA when n < 3
- Outlier rejection rejects obvious outliers (e.g., 10 sales at $500 + 1 at $50,000)
- Recency weighting: same prices but different dates produce different FMVs
- Sale-type weighting: BIN-heavy basket produces lower FMV than auction-heavy
- Stale flag fires when most recent sale > 30 days old

---

## Source adapter spec

Each source under `src/lib/layer2/sources/` implements:

```ts
interface CompSource {
  name: string;
  fetchComps(query: {
    canonicalId: string;
    player: string;
    year: number;
    setName: string;
    parallel?: string;
    grader: string;
    grade: string;
  }): Promise<RawComp[]>;
}
```

### eBay adapter (`ebay.ts`)

Try Marketplace Insights API first. If 401 (not approved) or 403, fall back to
Browse API for active listings only and tag results clearly as `ACTIVE_LISTING`
(NOT sold price — these don't go into FMV calc, only displayed as reference).

```ts
// env vars required:
// EBAY_APP_ID, EBAY_CERT_ID, EBAY_DEV_ID
// EBAY_OAUTH_TOKEN (or compute from client credentials)
```

Endpoint targets:
- Sold: `GET https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search`
- Active fallback: `GET https://api.ebay.com/buy/browse/v1/item_summary/search`

Query building: assemble keyword string as
`"{year} {set_name} {player} {parallel} {grader} {grade}"` and category-filter
to Sports Trading Cards (213).

Parse `saleType` from listing data:
- Has `bidCount > 0` → `'auction'`
- Has accepted best offer indicator → `'best_offer_accepted'`
- Otherwise BIN → `'bin'`

### Ximilar adapter (`ximilar.ts`)

Endpoint: `POST https://api.ximilar.com/collectibles/v2/sports_id`
Returns: detected card identity with confidence scores.

```ts
async function identifyFromImage(imageBase64: string): Promise<CardIdentity[]> {
  // Returns ARRAY because we want top-3 candidates for user to confirm.
  // NEVER auto-select the top result without user confirmation.
}
```

---

## Mobile UI requirements (`src/app/comp/page.tsx`)

This is what Sam uses on the show floor. Design principles:

1. **One-thumb operable.** Big tap targets. Camera button is primary CTA.
2. **Two input modes:** typed query (e.g., "2018 Prizm Luka Silver PSA 10") and camera capture.
3. **Camera flow:**
   - Tap camera → capture or pick image
   - Show parsed identity with top-3 candidates as cards
   - Each candidate shows: player, year, set, parallel, confidence %
   - User taps one to confirm OR types a correction
4. **Result page must show, in order:**
   - **Status badge** at top: OK / INSUFFICIENT_DATA / STALE
   - **FMV with CI**: `$X (95% CI: $Y–$Z)` — large, bold
   - **Sample size & date range**: `Based on N sales over last D days`
   - **Sale type breakdown**: chip showing count by type
   - **Recent comps list**: each row with price, date, sale type, source, link
   - **Excluded comps** (collapsed by default): with rationale
   - **"Save to portfolio" button**: opens modal to log a purchase

5. **Never** show only a single number. The CI and sample size must be at the
   same visual weight as the FMV itself.

---

## Acceptance criteria (Phase 1)

Phase 1 is "done" when ALL of these pass:

- [ ] `0002_layer2_comps_and_fmv.sql` migration applies cleanly
- [ ] `npm run test` passes for all FMV tests listed above
- [ ] `POST /api/comp/lookup` returns valid response for `{ query: "2018 Prizm Luka Silver", grade: "PSA 10" }`
- [ ] Response includes `methodologyVersion: "v1.0.0"`, `sampleSize`, `comps[]`, `excluded[]`, and either `fmv` or `status: "INSUFFICIENT_DATA"`
- [ ] eBay adapter handles auth failure gracefully (returns empty array with logged warning, does not crash)
- [ ] All external HTTP calls have 5-second timeout and 1 retry
- [ ] No modifications to existing Layer 1 files (`src/app/dashboard`, `src/app/portfolio`, original schema)

## Acceptance criteria (Phase 2)

- [ ] `/comp` page renders on mobile (iPhone 14 viewport)
- [ ] Typed query → result page works end-to-end
- [ ] Result page shows FMV, CI, sample size, date range, all comps with sale type
- [ ] "Save to portfolio" creates a `cards` + `card_transactions` row using existing Layer 1 schema
- [ ] Lighthouse mobile performance score > 80

## Acceptance criteria (Phase 3)

- [ ] Camera capture works on iOS Safari and Chrome
- [ ] Ximilar returns top-3 candidates
- [ ] User must tap to confirm before comps are pulled
- [ ] Ximilar failure → falls back to manual text entry

---

## Environment variables to add to `.env.example`

```
# Layer 2 - External APIs
EBAY_APP_ID=
EBAY_CERT_ID=
EBAY_DEV_ID=
EBAY_OAUTH_TOKEN=
EBAY_MARKETPLACE_INSIGHTS_ENABLED=false   # set true if vetted

XIMILAR_API_TOKEN=

CARDHEDGE_API_KEY=         # optional, Phase 4
PSA_API_TOKEN=             # free tier, 100 calls/day

# Layer 2 - LLM for identity parsing
ANTHROPIC_API_KEY=         # for parsing hard-to-normalize queries
```

---

## Working agreement for Cursor

- Work one phase at a time. Do not start Phase 2 until Phase 1 acceptance
  criteria all pass.
- After each phase, summarize what was built, list any deviations from this
  spec, and ask the user to verify before continuing.
- If you discover this spec is wrong or incomplete in a meaningful way, STOP
  and surface the issue. Do not silently improvise on reliability-critical
  pieces (FMV math, outlier handling, sale-type weighting).
- Prefer fewer dependencies. The existing Bernie stack covers most needs.
- Write tests as you go, not after. The FMV module especially must have full
  coverage before any UI is built on top of it.
