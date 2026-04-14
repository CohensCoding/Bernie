import { Card, CardHeader } from '@/components/ui/Card';
import { getPortfolioRows } from '@/lib/db/portfolio';
import { PortfolioTable } from '@/components/portfolio/PortfolioTable';

export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
  const rows = await getPortfolioRows();

  return (
    <div className="space-y-8">
      <div>
        <div className="text-2xl font-semibold tracking-tight text-fg">Portfolio</div>
        <div className="mt-2 text-sm text-fg-muted">
          Search and slice your cards. Powered by your seeded Supabase data.
        </div>
      </div>

      <Card>
        <CardHeader title="Cards" subtitle={`${rows.length} cards`} />
        <div className="mt-4">
          <PortfolioTable rows={rows} />
        </div>
      </Card>
    </div>
  );
}

