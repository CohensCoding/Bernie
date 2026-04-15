import Link from 'next/link';
import { Card, CardHeader } from '@/components/ui/Card';
import { formatUsdFromCents } from '@/lib/money';
import { getDashboardData } from '@/lib/db/portfolio';
import { SpendBars } from '@/components/viz/SpendBars';
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
          <Card className="border-border/80 bg-gradient-to-b from-bg-elevated/80 to-bg-muted/30 px-6 py-8 sm:px-10 sm:py-10">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fg-muted">Total invested</div>
            <div className="mt-2 text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
              {formatUsdFromCents(data.kpis.totalSpendCents)}
            </div>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-fg-muted">
              <span className="font-medium text-fg">{data.kpis.totalCards}</span> cards · avg purchase{' '}
              <span className="font-medium text-fg">{formatUsdFromCents(data.kpis.avgPurchasePriceCents)}</span> ·{' '}
              <span className="font-medium text-fg">{data.kpis.uniquePlayers}</span> unique players
            </p>
            <div className="mt-6">
              <Link
                href="/portfolio"
                className="text-sm font-medium text-accent underline-offset-4 hover:underline"
              >
                Explore portfolio insights
              </Link>
              <span className="mx-2 text-fg-muted/50">·</span>
              <Link href="/cards" className="text-sm font-medium text-accent underline-offset-4 hover:underline">
                Manage cards
              </Link>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Purchase activity" subtitle="Spend over time" />
            <div className="mt-2 h-[340px] sm:h-[400px]">
              <ActivityChart points={data.activityByMonth} />
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
            <Card className="lg:col-span-5">
              <CardHeader title="Spend by sport" subtitle="Where your cost basis lives" />
              <div className="mt-4">
                <SpendBars rows={data.spendBySport.slice(0, 8)} />
              </div>
            </Card>

            <Card className="lg:col-span-7">
              <CardHeader title="Top positions" subtitle="By player spend" />
              <div className="mt-4 space-y-2">
                {topPositions.length === 0 ? (
                  <div className="text-sm text-fg-muted">No purchase data yet.</div>
                ) : (
                  topPositions.map((row) => (
                    <div
                      key={row.key}
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-bg-muted/35 px-4 py-3"
                    >
                      <div className="min-w-0 truncate text-sm font-medium text-fg">{row.key}</div>
                      <div className="shrink-0 pl-4 text-sm tabular-nums text-fg-muted">
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
