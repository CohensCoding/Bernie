# Bernie

Bernie is a **sports card portfolio management app**. The goal is to help you quickly log cards you buy (especially from eBay) and analyze your collection like an investment portfolio.

## Layer 1 (current scope)

This repo currently implements **Layer 1 only**:

- **Portfolio dashboard**
  - Total cards, total spend, average purchase price
  - Graded vs raw counts
  - Spend breakdowns (sport/team/player/brand-set) and purchase activity over time
- **Portfolio table**
  - Search/sort/filter and card detail navigation (as it’s built out)
- **Clean data model**
  - `cards`
  - `card_transactions`
  - `card_assets`

### Not in Layer 1

Bernie **does not** include any of the following yet:

- Live pricing integrations
- Comp scraping
- Alerts
- Player projections
- Scoring models / advanced investing logic
- Underpriced listing detection

## Future phases (not implemented yet)

- **Screenshot ingestion** (upload eBay screenshots → extract fields → review → save)
- Any “advanced intelligence” features (pricing, comps, alerts, investing logic)

## Local setup

### Prerequisites

- Node.js (recent LTS recommended)
- A Supabase project (Postgres + Storage)

### 1) Install dependencies

```bash
npm install
```

### 2) Create the database schema + seed data (Supabase)

In your Supabase project:

1. Open **SQL Editor**
2. Run:
   - `supabase/schema.sql`
   - `supabase/seed.sql`

This will create the tables and insert seed portfolio data used by the dashboard and portfolio pages.

### 3) Environment variables

Create `.env.local` from the template:

```bash
cp .env.example .env.local
```

Required variables:

- **`SUPABASE_URL`**: Supabase Project Settings → API → Project URL
- **`SUPABASE_SERVICE_ROLE_KEY`**: Supabase Project Settings → API → Service role key

Example:

```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxxxx
```

Important notes:

- The **service role key is server-only**. Do not expose it to the browser.
- `.env.local` is gitignored by default.

### 4) Run the app locally

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Repo notes

- SQL is in `supabase/`
- App code is in `src/` (Next.js App Router)

