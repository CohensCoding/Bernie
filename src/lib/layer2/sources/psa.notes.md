# PSA APR source — Phase A reconnaissance

**Date:** 2026-05-18  
**Budget:** 5 HTTP requests (curl/subagent) + browser validation (no extra PSA HTTP from agent)  
**Reference:** [ChrisMuir/psa-scrape](https://github.com/ChrisMuir/psa-scrape) (`auction_prices_realized/scrape_auction_prices.py`)

---

## Pre-flight (this repo)

| Check | Result |
|-------|--------|
| Repo path | `/Users/cohen/Projects/Bernie` (Cursor workspace may show `/Users/cohen/Bernie`; shell only sees Projects path) |
| `git status` | Clean |
| `npm test` | **141 passed (141)** |
| `psa` in `CompSourceId` | Yes (`src/lib/layer2/types.ts`) |
| `psa` in `FMV_ELIGIBLE_SOURCES` | Yes |
| `src/lib/layer2/sources/psa.ts` | **Stub exists** — `isAvailable() → false`, returns empty comps |

---

## A1 — APR / sales data

### URL patterns (2026 site)

| Form | Example | Notes |
|------|---------|-------|
| **Legacy APR** | `https://www.psacard.com/auctionprices/{sport}-cards/{year}-{set}/{player-slug}/values/{specId}` | e.g. Clemente `.../roberto-clemente/values/190786` |
| **Canonical (current)** | `https://www.psacard.com/spec/psa/{specId}` | Legacy URLs **301/redirect** here (browser-confirmed for `190786`) |

`specId` is the numeric PSA spec ID (same as trailing segment of legacy APR URLs).

### Live curl (requests 1 & 3) — server-side fetch

| Request | Status | Body |
|---------|--------|------|
| GET legacy Clemente APR HTML | **403** | Cloudflare managed challenge HTML (~6 KB), not PSA app |
| POST `GetItemLots` (`specID=190786`, `length=5`) | **403** | Same Cloudflare challenge |

**Implication:** Plain `fetch`/`curl` from datacenter/server IPs without a solved CF session is **blocked**. The open-source scraper predates aggressive CF on these routes; it may still work from residential IPs or may also need cookies now — **must re-verify with CF cookies before Phase B prod traffic**.

### Where sales data actually lives

**Not in the APR HTML page.** Sales are loaded via a **DataTables-style JSON POST** (confirmed by psa-scrape, still the documented integration path):

| Item | Value |
|------|-------|
| **Endpoint** | `POST https://www.psacard.com/auctionprices/GetItemLots` |
| **Content-Type** | `application/x-www-form-urlencoded` |
| **Body (pagination)** | `specID={specId}&draw={n}&start={offset}&length={pageSize}` |
| **Response** | JSON: `recordsTotal`, `recordsFiltered`, `draw`, `data[]` |

**Browser (2026 spec UI):** New Next.js spec page at `/spec/psa/{specId}` shows “Sales History” but grade filter was disabled in automation (“Select a grade to see pricing trends”); no `GetItemLots` XHR was observed without grade selection. **Phase B should still target `GetItemLots`** until a newer internal API is confirmed in network HAR.

### Per-sale JSON fields (`data[]` row)

From psa-scrape + README sample rows:

| JSON field | Maps to Bernie `RawComp` |
|------------|---------------------------|
| `SalePrice` | `salePriceCents` — strip `$` and `,`, parse float, × 100, round |
| `EndDate` | `saleDate` — format `M/D/YYYY` → ISO `YYYY-MM-DD` |
| `GradeString` | `grade` — normalize (e.g. `"8"`, `"GEM MT 10"` → adapter normalizer) |
| `URL` | `listingUrl` |
| `Name` | auction house → `rawPayload.auctionHouse` |
| `AuctionName` | seller / auction title → `rawPayload.seller` |
| `AuctionType` | `saleType` — map `"Auction"` → `auction`, BIN variants → `bin`, else `unknown` |
| `LotNo` | `rawPayload.lotNo` |
| `CertNo` | `rawPayload.certNo` |
| `Qualifier` / `HasQualifier` | `rawPayload.qualifier` |
| `ImageURL` | `rawPayload.imageUrl` |

Always set `source: 'psa'`, `grader: 'PSA'`.

### Fixture

See `__tests__/fixtures/psa.apr.sample.json` — truncated `GetItemLots` response (5 rows), structure aligned with reference impl.

---

## A2 — Search-resolve

### Endpoint (verified in browser)

| Item | Value |
|------|-------|
| **URL** | `GET https://www.psacard.com/search?q={urlencoded_query}` |
| **Not used** | `/search/results?q=` (from older docs) — site search form uses `/search?q=` |
| **Response** | **HTML** (Google Custom Search wrapper; page title “Google Search Results”) |
| **APR URLs in HTML?** | **Yes** — result links include spec pages and “Auction Prices Realized …” entries |

**Example query:** `2018 panini prizm luka doncic` → ~252 results; top hits include “Luka Doncic #280”, parallels, and APR category links.

### Parsing strategy (proposed for Phase B)

1. `GET /search?q=` + browser-like headers (see below).
2. Extract first matching link:
   - Prefer: `href` matching `/spec/psa/(\d+)`
   - Fallback: `/auctionprices/.+/values/(\d+)` (legacy; redirects to spec)
3. Persist **`psaApprUrl`** as canonical `https://www.psacard.com/spec/psa/{specId}` (or legacy URL if you only store full URL — spec ID is the stable key).
4. Extract `specId` from URL for `GetItemLots`.

**Caveat:** Search returns **many parallels** for one query; first hit may not match `parallel` / `cardNumber` in Bernie identity. Phase B should rank/score results (exact set + player + card #) or require cached URL.

### Alternatives if search-resolve is too noisy

| Option | Notes |
|--------|-------|
| **Manual `psaApprUrl` on canonical card** | Best accuracy; needs additive Layer 2 field (do not touch `src/lib/db/cards.ts` write paths without approval) |
| **POP browse** | `POST https://www.psacard.com/Pop/GetSetItems` with `headingID` — set-level, not full-text search; same CF risk |
| **PSA Public API** | `psacard.com/publicapi` — pop/cert focused; unlikely to expose APR sales grid |

### Fixture

See `__tests__/fixtures/psa.search.sample.html` — truncated HTML illustrating result link patterns.

---

## Headers & politeness

### Working User-Agent (curl + browser)

```
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
```

### Recommended request headers

```
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
Accept-Language: en-US,en;q=0.9
Accept-Encoding: gzip, deflate, br
Referer: https://www.psacard.com/spec/psa/{specId}   # for GetItemLots POST
Origin: https://www.psacard.com
X-Requested-With: XMLHttpRequest                      # for GetItemLots POST
```

**Cloudflare:** May require `cf_clearance` + `__cf_bm` cookies copied from a real browser session for server-side requests. Without them: **403** + challenge HTML.

### Rate limit

- **Default: 1 request per 2 seconds** (module-scope queue), per project spec.
- psa-scrape uses **3s sleep** after each `GetItemLots` page — align Bernie with **≥2s** between any PSA HTTP calls.

---

## Failure modes observed

| Condition | HTTP / symptom | Adapter `reason` |
|-----------|----------------|------------------|
| CF challenge (no cookies) | 403, HTML “Just a moment…” | `rate_limited_or_blocked` |
| Too many requests | 429 | `rate_limited_or_blocked` |
| Network / abort | timeout | `timeout` |
| Empty/malformed JSON, missing `data` | parse error | `parse_error` |
| Search has no spec link | — | `card_not_found_in_psa` |
| Wrong card / ambiguous search | — | resolve logic should fail closed → `card_not_found_in_psa` |

**Never throw** from adapter.

---

## Phase B implementation notes (pending sign-off)

1. **Resolve:** cached `psaApprUrl` → else `GET /search?q=`.
2. **Fetch comps:** `POST GetItemLots` with `specID`, paginate `length=250` until `recordsTotal` satisfied (respect rate limit).
3. **Register** in existing orchestrator next to `ebaySource` (no parallel registry).
4. **URL cache:** in-process `Map` by `canonicalId` unless additive canonical-field helper is approved.
5. **CF:** consider documenting env var for optional cookie jar (`PSA_CF_COOKIE`) for production — **ask before adding** if non-obvious.

---

## HTTP log (Phase A budget)

| # | Method | URL | Status |
|---|--------|-----|--------|
| 1 | GET | Clemente legacy APR HTML | 403 CF |
| 2 | GET | `/search/results?q=…` (legacy path test) | 403 CF |
| 3 | POST | `/auctionprices/GetItemLots` | 403 CF |
| 4 | GET | `/auctionprices/Search/GetSearchResults?query=…` | 403 CF |
| 5 | GET | `/auctionprices/Search?query=…` | 403 CF |

Browser validation (user session): `/spec/psa/190786` **200**, `/search?q=2018+panini+prizm+luka+doncic` **200** with result links.
