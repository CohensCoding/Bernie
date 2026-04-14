import { Card, CardHeader } from '@/components/ui/Card';
import { getPortfolioRows } from '@/lib/db/portfolio';
import { PortfolioTable } from '@/components/portfolio/PortfolioTable';

export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
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
        <div className="text-2xl font-semibold tracking-tight text-fg">Portfolio</div>
        <div className="mt-2 text-sm text-fg-muted">
          Search and slice your cards. Powered by your seeded Supabase data.
        </div>
      </div>

      <Card>
        <CardHeader title="Cards" subtitle={rows ? `${rows.length} cards` : '—'} />
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

