import Link from 'next/link';
import { Card, CardHeader } from '@/components/ui/Card';
import { formatUsdFromCents } from '@/lib/money';
import { getDashboardData } from '@/lib/db/portfolio';
import { SpendBars } from '@/components/viz/SpendBars';
import { CountBars } from '@/components/viz/CountBars';

export const dynamic = 'force-dynamic';

function Section({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-6">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted">{kicker}</div>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-fg">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default async function PortfolioAnalyticsPage() {
  let data: Awaited<ReturnType<typeof getDashboardData>> | null = null;
  let error: string | null = null;
  try {
    data = await getDashboardData();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error';
  }

  return (
    <div className="space-y-14 pb-8">
      <div>
        <div className="text-2xl font-semibold tracking-tight text-fg">Portfolio</div>
        <div className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-muted">
          Deeper breakdowns of spend and inventory—concentration, grading mix, and gaps. For day-to-day management, use{' '}
          <Link href="/cards" className="text-accent underline-offset-4 hover:underline">
            Cards
          </Link>
          .
        </div>
      </div>

      {error ? (
        <Card>
          <CardHeader title="Setup needed" subtitle="Connect Supabase to load analytics" />
          <div className="mt-4 space-y-2 text-sm text-fg-muted">
            <div>{error}</div>
          </div>
        </Card>
      ) : null}

      {!data ? null : (
        <>
          <Section kicker="Section 1" title="Overview">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title="Spend by sport" subtitle="Cost basis" />
                <div className="mt-4">
                  <SpendBars rows={data.spendBySport.slice(0, 10)} />
                </div>
              </Card>
              <Card>
                <CardHeader title="Cards by sport" subtitle="Inventory count" />
                <div className="mt-4">
                  <CountBars rows={data.countBySport.slice(0, 10)} />
                </div>
              </Card>
            </div>
          </Section>

          <Section kicker="Section 2" title="Concentration">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Card>
                <CardHeader title="Spend by player" subtitle="Top holdings" />
                <div className="mt-4">
                  <SpendBars rows={data.spendByPlayer.slice(0, 10)} />
                </div>
              </Card>
              <Card>
                <CardHeader title="Spend by team" subtitle="Where dollars sit" />
                <div className="mt-4">
                  <SpendBars rows={data.spendByTeam.slice(0, 10)} />
                </div>
              </Card>
              <Card>
                <CardHeader title="Spend by brand / set" subtitle="Product concentration" />
                <div className="mt-4">
                  <SpendBars rows={data.spendByBrandSet.slice(0, 10)} />
                </div>
              </Card>
            </div>
          </Section>

          <Section kicker="Section 3" title="Card characteristics">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title="Cards by grading" subtitle="Raw vs slabbed" />
                <div className="mt-4">
                  <CountBars rows={data.countByGradingCompany.slice(0, 12)} />
                </div>
              </Card>
              <Card>
                <CardHeader title="Collection health" subtitle="Records that may need attention" />
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between rounded-xl border border-border/70 bg-bg-muted/40 px-3 py-2">
                    <span className="text-fg">Missing images</span>
                    <span className="font-semibold text-fg">{data.completeness.missingImages}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border/70 bg-bg-muted/40 px-3 py-2">
                    <span className="text-fg">Missing identity</span>
                    <span className="font-semibold text-fg">{data.completeness.missingIdentity}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border/70 bg-bg-muted/40 px-3 py-2">
                    <span className="text-fg">Missing purchase info</span>
                    <span className="font-semibold text-fg">{data.completeness.missingPurchaseInfo}</span>
                  </div>
                </div>
              </Card>
            </div>
          </Section>

          <Section kicker="Reference" title="Cost basis leaders">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title="Highest total cost" subtitle="Per card (latest context)" />
                <div className="mt-4 space-y-2">
                  {data.highestCostBasis.slice(0, 8).map((r) => (
                    <Link
                      key={r.card_id}
                      href={`/cards/${r.card_id}`}
                      className="flex items-center justify-between rounded-xl border border-border/70 bg-bg-muted/40 px-3 py-2 text-sm transition hover:bg-bg-elevated/60"
                    >
                      <span className="min-w-0 truncate pr-3 font-medium text-fg">{r.label}</span>
                      <span className="shrink-0 text-xs text-fg-muted">{formatUsdFromCents(r.total_cost_cents)}</span>
                    </Link>
                  ))}
                </div>
              </Card>
              <Card>
                <CardHeader title="Recent additions" subtitle="Newest logged cards" />
                <div className="mt-4 space-y-2">
                  {data.recentAdditions.slice(0, 8).map((r) => (
                    <Link
                      key={r.card_id}
                      href={`/cards/${r.card_id}`}
                      className="block rounded-xl border border-border/70 bg-bg-muted/40 px-3 py-2 text-sm transition hover:bg-bg-elevated/60"
                    >
                      <div className="truncate font-medium text-fg">{r.label}</div>
                      <div className="mt-1 text-xs text-fg-muted">
                        {new Date(r.created_at).toLocaleDateString()} · {formatUsdFromCents(r.total_cost_cents)}
                      </div>
                    </Link>
                  ))}
                </div>
              </Card>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
