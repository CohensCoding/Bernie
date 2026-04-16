import { Card, CardHeader } from '@/components/ui/Card';
import { getPortfolioRows } from '@/lib/db/portfolio';
import { PortfolioTable } from '@/components/portfolio/PortfolioTable';
import Link from 'next/link';
import { RefreshAllValuesButton } from '@/components/valuation/RefreshAllValuesButton';

export const dynamic = 'force-dynamic';

export default async function CardsPage() {
  let rows: Awaited<ReturnType<typeof getPortfolioRows>> | null = null;
  let error: string | null = null;
  try {
    rows = await getPortfolioRows();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error';
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="text-2xl font-semibold tracking-tight text-fg">Cards</div>
        <div className="mt-1.5 text-sm text-fg-muted/90">Inventory — table for precision, grid for a quick visual pass.</div>
      </div>

      <Card className="border-border/60">
        <CardHeader
          title="Collection"
          subtitle={rows ? `${rows.length} cards` : '—'}
          right={
            <div className="flex items-center gap-2">
              <RefreshAllValuesButton />
              <Link
                href="/api/export/cards.csv"
                className="rounded-xl border border-border/80 bg-bg-muted/40 px-3 py-2 text-xs font-medium text-fg transition hover:bg-bg-muted/70"
              >
                Export CSV
              </Link>
            </div>
          }
        />
        <div className="mt-4">
          {error ? (
            <div className="space-y-2 text-sm text-fg-muted">
              <div className="text-fg">Setup needed</div>
              <div>{error}</div>
              <div>
                Create <span className="text-fg">.env.local</span> from <span className="text-fg">.env.example</span>,
                then run <span className="text-fg">supabase/schema.sql</span> and <span className="text-fg">supabase/seed.sql</span>{' '}
                in Supabase SQL editor.
              </div>
            </div>
          ) : rows ? (
            <PortfolioTable rows={rows} />
          ) : null}
        </div>
      </Card>
    </div>
  );
}
