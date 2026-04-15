import Link from 'next/link';
import { Card, CardHeader } from '@/components/ui/Card';
import { formatUsdFromCents } from '@/lib/money';
import { getDashboardData } from '@/lib/db/portfolio';
import { SpendSportDonut } from '@/components/viz/SpendSportDonut';
import { ActivityChart } from '@/components/viz/ActivityChart';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  let data: Awaited<ReturnType<typeof getDashboardData>> | null = null;
  let error: string | null = null;
  try {
    data = await getDashboardData();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error';
  }

  const topPositions = data?.spendByPlayer.slice(0, 8) ?? [];
  const recent = data?.recentAdditions.slice(0, 5) ?? [];

  return (
    <div className="space-y-10 pb-8">
      <div>
        <div className="text-2xl font-semibold tracking-tight text-fg">Dashboard</div>
        <div className="mt-2 text-sm text-fg-muted">A quick read on what you own and what you have invested.</div>
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
        <>
          <div className="rounded-2xl border border-border/70 bg-bg-elevated/50 px-6 py-8 sm:px-8 sm:py-9">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-fg-muted/90">Total invested</div>
            <div className="mt-3 text-4xl font-semibold tracking-tight text-fg sm:text-[2.75rem] sm:leading-none">
              {formatUsdFromCents(data.kpis.totalSpendCents)}
            </div>
            <p className="mt-5 text-sm text-fg-muted/95">
              <span className="text-fg/90">{data.kpis.totalCards}</span> cards
              <span className="mx-2 text-fg-muted/40">·</span>
              avg <span className="text-fg/90">{formatUsdFromCents(data.kpis.avgPurchasePriceCents)}</span>
              <span className="mx-2 text-fg-muted/40">·</span>
              <span className="text-fg/90">{data.kpis.uniquePlayers}</span> players
            </p>
            <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <Link href="/portfolio" className="text-fg-muted transition hover:text-accent">
                Portfolio insights
              </Link>
              <Link href="/cards" className="text-fg-muted transition hover:text-accent">
                Cards
              </Link>
            </div>
          </div>

          <Card className="overflow-hidden border-border/60">
            <CardHeader title="Purchase activity" subtitle="Spend over time" />
            <div className="mt-4 h-[300px] px-2 pb-2 sm:h-[360px] sm:px-4 sm:pb-4">
              <ActivityChart points={data.activityByMonth} />
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
            <Card className="border-border/60 lg:col-span-5">
              <CardHeader title="Spend by sport" subtitle="Share of cost basis" />
              <div className="mt-2">
                <SpendSportDonut rows={data.spendBySport.slice(0, 8)} drilldown={data.spendBySportPlayers} />
              </div>
            </Card>

            <Card className="border-border/60 lg:col-span-7">
              <CardHeader title="Top positions" subtitle="By player spend" />
              <div className="mt-4 space-y-1.5">
                {topPositions.length === 0 ? (
                  <div className="text-sm text-fg-muted">No purchase data yet.</div>
                ) : (
                  topPositions.map((row) => (
                    <div
                      key={row.key}
                      className="flex items-center justify-between rounded-lg border border-border/40 bg-bg-muted/20 px-3 py-2.5"
                    >
                      <div className="min-w-0 truncate text-sm text-fg">{row.key}</div>
                      <div className="shrink-0 pl-3 text-sm tabular-nums text-fg-muted">
                        {formatUsdFromCents(row.spendCents)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>

          {recent.length > 0 ? (
            <Card>
              <CardHeader title="Recent cards" subtitle="Latest additions" />
              <div className="mt-4 flex flex-wrap gap-3">
                {recent.map((r) => (
                  <Link
                    key={r.card_id}
                    href={`/cards/${r.card_id}`}
                    className="min-w-[200px] flex-1 rounded-xl border border-border/70 bg-bg-muted/40 px-4 py-3 text-sm transition hover:bg-bg-elevated/60"
                  >
                    <div className="truncate font-medium text-fg">{r.label}</div>
                    <div className="mt-1 text-xs text-fg-muted">{new Date(r.created_at).toLocaleDateString()}</div>
                  </Link>
                ))}
              </div>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
