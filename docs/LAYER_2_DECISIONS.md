# Layer 2 — Decision Log

Running ledger of clarifications and methodology choices made on top of
`docs/LAYER_2_SPEC.md`. The spec stays canonical for what was originally
asked; this file captures every deviation, with a date and a rationale. Any
change to FMV math here MUST also bump `methodologyVersion`.

---

## 2026-05-13 — Pre-Phase-1 decisions

### D1. Existing valuation module: **coexist**
- `card_valuations_current`, `card_valuation_snapshots`, `valuation_runs`,
  `src/lib/valuation/`, and `src/app/api/valuations/*` are LEFT UNTOUCHED.
- Layer 2 builds alongside in `src/lib/layer2/`, with new tables
  (`canonical_cards`, `card_aliases`, `card_comps`, `card_fmv`,
  `card_canonical_links`).
- Consolidation of the two valuation paths is **out of scope for Phases 1–4**.

### D2. LLM provider: **OpenAI**
- `identity/parse.ts` and any other Layer 2 LLM call uses the existing
  `src/lib/openai/server.ts` client.
- The project rule has been updated to say "OpenAI API for LLM tasks."
- `ANTHROPIC_API_KEY` is NOT added to `.env.example`.

### D3. Migration convention: **append to `supabase/schema.sql`**
- No `supabase/migrations/` directory is created.
- Layer 2 tables are appended inside the existing
  `begin; ... commit;` block in `supabase/schema.sql`.
- Spec's `0002_layer2_comps_and_fmv.sql` filename is NOT used; the SQL
  itself is unchanged.

### D4. eBay strategy: **three sources, only Marketplace Insights feeds FMV**
- `card_comps.source` accepts these eBay values:
  - `ebay_marketplace_insights` — completed sales via official API. **FMV-eligible.**
  - `ebay_browse` — active listings via official API. NOT FMV-eligible
    (listings ≠ sales). Displayed in result UI as reference, never math input.
  - `ebay_scrape` — HTML scrape of `ebay.com/sch?LH_Sold=1` via wrapped
    existing provider. NOT FMV-eligible. Displayed in result UI as
    "Reference sales (unverified)" with a tooltip explaining exclusion.
- Priority order for *display*: Marketplace Insights → Browse → Scrape.
  Marketplace Insights gates on
  `EBAY_MARKETPLACE_INSIGHTS_ENABLED=true` and a valid token.
- `src/lib/layer2/fmv/compute.ts` MUST filter to FMV-eligible sources before
  running the IQR / weighting / bootstrap pipeline. A constant
  `FMV_ELIGIBLE_SOURCES` lives in `src/lib/layer2/types.ts`.
- `src/lib/layer2/sources/ebayScrape.ts` **wraps** (does not rewrite or port)
  `src/lib/valuation/providers/ebaySoldProvider.ts`. The existing valuation
  module continues to use it directly; Layer 2 calls into it via the
  `CompSource` adapter interface.

### D5. Bootstrap procedure (locks into methodology v1.0.0): **uniform resample with replacement**
- For each of 1,000 iterations: draw `n` comps from the included basket
  uniformly with replacement (`i = Math.floor(Math.random() * n)` per slot).
- Each drawn comp retains its original `weight = recencyWeight × saleTypeWeight`.
- Compute the weighted mean of the resample. 95% CI is the 2.5th and 97.5th
  percentile of the 1,000 means.
- Rationale: standard weighted bootstrap. CI reflects sample-size
  uncertainty given the existing weights, not weight-driven concentration.
- Bumping to weight-proportional resampling would require
  `methodologyVersion` → `v1.1.0`.

### D6. Test runner: **Vitest**
- Added as a dev dependency.
- `npm test` runs the suite. `npm run test:watch` for watch mode.
- Test files live in `src/lib/layer2/**/__tests__/*.test.ts`.

### D7. `POST /api/comp/save`: **shared server function in `src/lib/db/`**
- The existing portfolio write path is extracted into a shared function
  in `src/lib/db/` (probably `src/lib/db/cards.ts` already has the right
  shape — to be verified during Phase 2).
- `/api/comp/save` calls that shared function. The existing portfolio
  route also calls it. No HTTP self-call.
- Rule constraint "writes to Layer 1 tables happen only through existing
  portfolio routes" is satisfied because the actual SQL write lives in
  one place and both routes share it.

---

## 2026-05-13 — Post-Phase-1 decision

### D8. `ebay_scrape` wiring: **single additive export from Layer 1 (Option A)**
- `src/lib/valuation/providers/ebaySoldProvider.ts` gains one new export
  `fetchSoldRowsRaw(query: string)` that returns the individual parsed
  sold-search rows (title + price + sold caption + list index). It is a
  thin delegation to the existing internal `fetchSoldRows`.
- NO existing export, internal function, or behavior in that file is
  modified. The existing aggregation path
  `ebaySoldValuationProvider.valueCard()` is untouched.
- `src/lib/valuation/__tests__/engine.test.ts` locks the existing
  behavior with a snapshot-style test against mocked `fetch` HTML: it
  asserts the exact `ValuationEstimate` shape (provider id, status,
  low/mid/high cents, last-comp price + date, comp count, confidence,
  match-notes text) for a deterministic 5-row fixture. This test is the
  regression guard for any future edits to the file.
- `src/lib/layer2/sources/ebayScrape.ts` imports `fetchSoldRowsRaw`,
  reshapes its result into `RawComp[]` tagged `source: 'ebay_scrape'`,
  parses the sold-date caption to ISO, and degrades to `{ ok: false }`
  on Cloudflare interstitials / fetch errors.
- These rows are excluded from FMV math by `FMV_ELIGIBLE_SOURCES`. The
  exclusion is reconfirmed by the existing `compute.test.ts` test
  `"excludes ebay_scrape rows from FMV math (unverified backstop)"`.
- This is the only carve-out from the "DO NOT MODIFY Layer 1" rule and
  is bounded to:
    a) one additive export in `ebaySoldProvider.ts`, and
    b) one additive test file colocated with the Layer 1 module
       (`src/lib/valuation/__tests__/engine.test.ts`).
  Any further Layer 1 changes still require explicit user approval.

## 2026-05-13 — Pre-Phase-1-signoff decision

### D9. eBay application token: **mint on demand via `client_credentials`**

Context. The pre-Phase-1 spec required `EBAY_OAUTH_TOKEN` as a static
env var. Bernie's existing eBay integration uses a *user* access token
(PKCE redirect flow in `src/lib/ebay/oauth.ts`) to read the connected
seller's order history — that is a different auth pattern from what the
Layer 2 Browse / Marketplace Insights adapter needs (a public-catalog
bearer token). The Phase 1 live-call attempt revealed the gap.

Decision. The Layer 2 eBay adapter now mints an *application* token on
demand using `EBAY_CLIENT_ID` + `EBAY_CLIENT_SECRET` via the
`client_credentials` grant. The static `EBAY_OAUTH_TOKEN` env var
remains supported as a fast-path override (set it to skip minting).
Sandbox vs production is honored via `EBAY_ENV` (matches Layer 1).
Scope is `https://api.ebay.com/oauth/api_scope` by default;
`...buy.marketplace.insights` is added when
`EBAY_MARKETPLACE_INSIGHTS_ENABLED=true`. Token is cached in module
memory until 60s before expiry.

Implementation. New file `src/lib/layer2/sources/ebayAuth.ts` (Layer 2
only — does NOT import from `src/lib/ebay/`). Five new tests in
`src/lib/layer2/sources/__tests__/ebay.test.ts` verify the mint call,
cache reuse, sandbox routing, scope inclusion, and graceful failure on
401 credentials.

Effect. With only `EBAY_CLIENT_ID`/`SECRET`/`ENV` in `.env.local` (which
Bernie already requires for Layer 1), Layer 2's eBay adapter is now
self-sufficient for Browse calls. Marketplace Insights still requires
eBay to approve the app for the additional scope — when not approved,
the adapter falls through to Browse and tags rows as `active_listing`
(not FMV-eligible), which is the documented graceful-degradation path.

---

## 2026-05-16 — Phase 2 decision

### D11. Revised interpretation of D7 (**comp-save** scoped)

Context. Decision **D7** assumed the Layer 1 portfolio write path could be **extracted** into one shared helper and
shared with `POST /api/comp/save`. Bernie Layer 1 currently ships **four** distinct “Add Card” flows (`/add` picker &
manual paths, ingest, eBay integrations) that are **not unified** — and unifying them is **not** a Phase 2
deliverable.

Decision (**does not rewrite D7** — it annotates intent for this codebase state). Implement a **new** shared helper
for the comp-save use case — `createCardWithPurchase` in `src/lib/db/cards.ts` — and call it from **`POST /api/comp/save`**
only. Existing Layer 1 flows remain untouched. If Layer 1 is ever consolidated, refactoring those paths onto the same
helper is optional follow-up **once** parity is verified.

Rollback / atomicity notes for consumers live in that function’s **JSDoc** (sequential Supabase calls + manual
`cards.delete` cleanup — **not** a Postgres transaction).

---

## Open methodology notes (not changes, just locked-in spec choices)

- **IQR outlier fences are computed on raw `salePriceCents`**, not on
  weighted prices. Spec is explicit. Locked at v1.0.0.
- **Comp lookback window: 90 days.** Older comps are not fetched / stored
  for FMV purposes. Locked at v1.0.0.
- **`canonical_cards.id` slug template:**
  `{set-slug}-{year}-{card-number}-{player-slug}-{parallel-slug or 'base'}`.
  Lowercase, ASCII, hyphen-separated. Spec's example
  `prizm-2018-base-77-luka-doncic-silver` conflates "base" and "silver"
  and is interpreted as a typo. Documented in `identity/canonicalize.ts`.
