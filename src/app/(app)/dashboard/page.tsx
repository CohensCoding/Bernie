import { Card, CardHeader } from '@/components/ui/Card';
import { formatUsdFromCents } from '@/lib/money';
import { getDashboardData } from '@/lib/db/portfolio';
import { SpendBars } from '@/components/viz/SpendBars';
import { ActivityChart } from '@/components/viz/ActivityChart';
import { CountBars } from '@/components/viz/CountBars';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  let data: Awaited<ReturnType<typeof getDashboardData>> | null = null;
  let error: string | null = null;
  try {
    data = await getDashboardData();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error';
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="text-2xl font-semibold tracking-tight text-fg">Dashboard</div>
        <div className="mt-2 text-sm text-fg-muted">
          Collector view of your portfolio built from what you own and what you spent.
        </div>
      </div>

      {error ? (
        <Card>
          <CardHeader title="Setup needed" subtitle="Connect Supabase to load your portfolio" />
          <div className="mt-4 space-y-2 text-sm text-fg-muted">
            <div>{error}</div>
            <div>
              Create <span className="text-fg">.env.local</span> from <span className="text-fg">.env.example</span>,
              then run <span className="text-fg">supabase/schema.sql</span> and <span className="text-fg">supabase/seed.sql</span>{' '}
              in Supabase SQL editor.
            </div>
          </div>
        </Card>
      ) : null}

      {!data ? null : (
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Card>
          <CardHeader title="Total cards" subtitle="Unique cards logged" />
          <div className="mt-4 text-3xl font-semibold text-fg">{data.kpis.totalCards}</div>
        </Card>
        <Card>
          <CardHeader title="Total spend" subtitle="Total cost basis" />
          <div className="mt-4 text-3xl font-semibold text-fg">
            {formatUsdFromCents(data.kpis.totalSpendCents)}
          </div>
        </Card>
        <Card>
          <CardHeader title="Avg purchase" subtitle="Avg item price" />
          <div className="mt-4 text-3xl font-semibold text-fg">
            {formatUsdFromCents(data.kpis.avgPurchasePriceCents)}
          </div>
        </Card>
        <Card>
          <CardHeader title="Graded" subtitle="Slabbed cards" />
          <div className="mt-4 text-3xl font-semibold text-fg">{data.kpis.gradedCards}</div>
        </Card>
        <Card>
          <CardHeader title="Raw" subtitle="Ungraded cards" />
          <div className="mt-4 text-3xl font-semibold text-fg">{data.kpis.rawCards}</div>
        </Card>
        <Card>
          <CardHeader title="Unique players" subtitle="Distinct names" />
          <div className="mt-4 text-3xl font-semibold text-fg">{data.kpis.uniquePlayers}</div>
        </Card>
      </section>
      )}

      {!data ? null : (
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Purchase activity" subtitle="Spend by month (seed data)" />
          <div className="mt-4 h-[280px]">
            <ActivityChart points={data.activityByMonth} />
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Spend by sport"
            subtitle="Cost basis split"
            right={<div className="text-xs text-fg-muted">Top</div>}
          />
          <div className="mt-4">
            <SpendBars rows={data.spendBySport.slice(0, 6)} />
          </div>
        </Card>
      </section>
      )}

      {!data ? null : (
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Cards by sport" subtitle="Where you’re concentrated" />
          <div className="mt-4">
            <CountBars rows={data.countBySport.slice(0, 8)} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Cards by team" subtitle="Top teams" />
          <div className="mt-4">
            <CountBars rows={data.countByTeam.slice(0, 8)} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Cards by grading" subtitle="Raw vs graders" />
          <div className="mt-4">
            <CountBars rows={data.countByGradingCompany.slice(0, 8)} />
          </div>
        </Card>
      </section>
      )}

      {!data ? null : (
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Spend by team" subtitle="Top teams" />
          <div className="mt-4">
            <SpendBars rows={data.spendByTeam.slice(0, 6)} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Spend by player" subtitle="Top players" />
          <div className="mt-4">
            <SpendBars rows={data.spendByPlayer.slice(0, 6)} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Spend by brand/set" subtitle="Top sets" />
          <div className="mt-4">
            <SpendBars rows={data.spendByBrandSet.slice(0, 6)} />
          </div>
        </Card>
      </section>
      )}

      {!data ? null : (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader title="Recent additions" subtitle="Newest cards logged" />
            <div className="mt-4 space-y-2">
              {data.recentAdditions.length === 0 ? (
                <div className="text-sm text-fg-muted">No cards yet.</div>
              ) : (
                data.recentAdditions.map((r) => (
                  <Link
                    key={r.card_id}
                    href={`/cards/${r.card_id}`}
                    className="block rounded-xl border border-border/70 bg-bg-muted/40 px-3 py-2 text-sm text-fg transition hover:bg-bg-elevated/60"
                  >
                    <div className="truncate font-medium">{r.label}</div>
                    <div className="mt-1 text-xs text-fg-muted">
                      {new Date(r.created_at).toLocaleDateString()} · {formatUsdFromCents(r.total_cost_cents)}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Highest cost basis" subtitle="Top purchases (cost)" />
            <div className="mt-4 space-y-2">
              {data.highestCostBasis.length === 0 ? (
                <div className="text-sm text-fg-muted">No purchases yet.</div>
              ) : (
                data.highestCostBasis.map((r) => (
                  <Link
                    key={r.card_id}
                    href={`/cards/${r.card_id}`}
                    className="flex items-center justify-between rounded-xl border border-border/70 bg-bg-muted/40 px-3 py-2 text-sm text-fg transition hover:bg-bg-elevated/60"
                  >
                    <div className="min-w-0 truncate pr-3 font-medium">{r.label}</div>
                    <div className="shrink-0 text-xs text-fg-muted">{formatUsdFromCents(r.total_cost_cents)}</div>
                  </Link>
                ))
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Completeness" subtitle="What needs attention" />
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-xl border border-border/70 bg-bg-muted/40 px-3 py-2">
                <div className="text-fg">Missing images</div>
                <div className="font-semibold text-fg">{data.completeness.missingImages}</div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/70 bg-bg-muted/40 px-3 py-2">
                <div className="text-fg">Missing identity</div>
                <div className="font-semibold text-fg">{data.completeness.missingIdentity}</div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/70 bg-bg-muted/40 px-3 py-2">
                <div className="text-fg">Missing purchase info</div>
                <div className="font-semibold text-fg">{data.completeness.missingPurchaseInfo}</div>
              </div>
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}

