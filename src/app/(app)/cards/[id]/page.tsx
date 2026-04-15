import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card as UiCard, CardHeader } from '@/components/ui/Card';
import { getCardDetail } from '@/lib/db/cards';
import { formatUsdFromCents } from '@/lib/money';
import { UploadScreenshots } from '@/components/assets/UploadScreenshots';
import { CardActions } from '@/components/cards/CardActions';

export const dynamic = 'force-dynamic';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] uppercase tracking-wide text-fg-muted">{label}</div>
      <div className="text-sm text-fg">{value}</div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-bg-muted px-2.5 py-1 text-xs text-fg ring-1 ring-border">
      {children}
    </span>
  );
}

export default async function CardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let detail: Awaited<ReturnType<typeof getCardDetail>> | null = null;
  let error: string | null = null;
  try {
    detail = await getCardDetail(id);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error';
  }

  if (!error && !detail) notFound();

  const card = detail?.card ?? null;
  const latestTx = detail?.transactions?.[0] ?? null;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-xs text-fg-muted">
            <Link href="/portfolio" className="hover:text-fg">
              Portfolio
            </Link>
            <span className="mx-2">/</span>
            <span className="text-fg">Card</span>
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-fg">{card?.player_name ?? 'Card'}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <span>{card?.year ?? '—'}</span>
            <span className="text-fg-muted/40">·</span>
            <span>{card?.brand ?? '—'}</span>
            <span className="text-fg-muted/40">·</span>
            <span>{card?.set_name ?? '—'}</span>
            {card?.parallel ? (
              <>
                <span className="text-fg-muted/40">·</span>
                <span className="text-fg">{card.parallel}</span>
              </>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {card?.rookie ? <Pill>Rookie</Pill> : null}
            {card?.auto ? <Pill>Auto</Pill> : null}
            {card?.patch ? <Pill>Patch</Pill> : null}
            {card?.serial_number ? <Pill>#{card.serial_number}</Pill> : null}
            {card?.graded ? (
              <Pill>
                {card.grading_company ?? 'Graded'} {card.grade ?? ''}
              </Pill>
            ) : (
              <Pill>Raw</Pill>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/portfolio"
            className="rounded-xl border border-border bg-bg-muted px-3 py-2 text-sm text-fg hover:bg-bg-elevated/60"
          >
            Back
          </Link>
          {card ? <CardActions cardId={card.id} /> : null}
        </div>
      </div>

      {error ? (
        <UiCard>
          <CardHeader title="Unable to load card" subtitle="Check Supabase connection and seed/schema" />
          <div className="mt-4 text-sm text-fg-muted">{error}</div>
        </UiCard>
      ) : null}

      {detail ? (
        <>
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <UiCard className="lg:col-span-2">
              <CardHeader title="Purchase details" subtitle="Latest recorded purchase (cost basis)" />
              <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label="Platform" value={latestTx?.platform ?? '—'} />
                <Field label="Date" value={latestTx?.purchase_date ?? '—'} />
                <Field label="Purchase" value={latestTx ? formatUsdFromCents(latestTx.purchase_price_cents) : '—'} />
                <Field label="Total cost" value={latestTx ? formatUsdFromCents(latestTx.total_cost_cents) : '—'} />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label="Taxes" value={latestTx ? formatUsdFromCents(latestTx.taxes_cents) : '—'} />
                <Field label="Shipping" value={latestTx ? formatUsdFromCents(latestTx.shipping_cents) : '—'} />
                <Field label="Source URL" value={latestTx?.source_url ? (
                  <a href={latestTx.source_url} target="_blank" rel="noreferrer" className="text-accent hover:underline underline-offset-4">
                    Open
                  </a>
                ) : '—'} />
                <Field label="Title (raw)" value={latestTx?.title_raw ?? '—'} />
              </div>
            </UiCard>

            <UiCard>
              <CardHeader title="Collection" subtitle="Organization" />
              <div className="mt-5 space-y-4">
                <Field label="Sport" value={detail.card.sport ?? '—'} />
                <Field label="Team" value={detail.card.team ?? '—'} />
                <Field label="Set" value={`${detail.card.brand ?? '—'} · ${detail.card.set_name ?? '—'}`} />
              </div>
            </UiCard>
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <UiCard className="lg:col-span-2">
              <CardHeader title="Card identity" subtitle="Structured identity fields" />
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Player" value={detail.card.player_name ?? '—'} />
                <Field label="Year" value={detail.card.year ?? '—'} />
                <Field label="Brand" value={detail.card.brand ?? '—'} />
                <Field label="Set name" value={detail.card.set_name ?? '—'} />
                <Field label="Subset" value={detail.card.subset ?? '—'} />
                <Field label="Card number" value={detail.card.card_number ?? '—'} />
                <Field label="Parallel" value={detail.card.parallel ?? '—'} />
                <Field label="Serial number" value={detail.card.serial_number ?? '—'} />
                <Field label="Print run" value={detail.card.print_run ?? '—'} />
              </div>

              {detail.card.graded ? (
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Grading company" value={detail.card.grading_company ?? '—'} />
                  <Field label="Grade" value={detail.card.grade ?? '—'} />
                </div>
              ) : null}

              {detail.card.notes ? (
                <div className="mt-6 border-t border-border pt-5">
                  <div className="text-[11px] uppercase tracking-wide text-fg-muted">Notes</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-fg">{detail.card.notes}</div>
                </div>
              ) : null}
            </UiCard>

            <UiCard>
              <CardHeader title="Metadata" subtitle="System timestamps" />
              <div className="mt-5 space-y-4">
                <Field label="Card ID" value={<span className="font-mono text-xs">{detail.card.id}</span>} />
                <Field label="Created at" value={new Date(detail.card.created_at).toLocaleString()} />
                <Field label="Updated at" value={new Date(detail.card.updated_at).toLocaleString()} />
              </div>
            </UiCard>
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <UiCard className="lg:col-span-2">
              <CardHeader
                title="Transactions"
                subtitle={
                  detail.transactions.length === 1
                    ? '1 transaction'
                    : `${detail.transactions.length} transactions`
                }
              />

              <div className="mt-4 space-y-3">
                {detail.transactions.length === 0 ? (
                  <div className="rounded-xl border border-border bg-bg-muted p-4 text-sm text-fg-muted">
                    No transactions recorded for this card yet.
                  </div>
                ) : (
                  detail.transactions.map((t) => (
                    <div key={t.id} className="rounded-xl border border-border bg-bg-muted p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-fg">
                            {t.platform ?? 'Platform'} · {t.purchase_date ?? '—'}
                          </div>
                          {t.title_raw ? <div className="text-xs text-fg-muted">{t.title_raw}</div> : null}
                          {t.source_url ? (
                            <a
                              href={t.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-accent hover:underline underline-offset-4"
                            >
                              View source
                            </a>
                          ) : null}
                        </div>

                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                          <div>
                            <div className="text-[11px] uppercase tracking-wide text-fg-muted">Purchase</div>
                            <div className="mt-1 text-sm text-fg">{formatUsdFromCents(t.purchase_price_cents)}</div>
                          </div>
                          <div>
                            <div className="text-[11px] uppercase tracking-wide text-fg-muted">Taxes</div>
                            <div className="mt-1 text-sm text-fg">{formatUsdFromCents(t.taxes_cents)}</div>
                          </div>
                          <div>
                            <div className="text-[11px] uppercase tracking-wide text-fg-muted">Shipping</div>
                            <div className="mt-1 text-sm text-fg">{formatUsdFromCents(t.shipping_cents)}</div>
                          </div>
                          <div>
                            <div className="text-[11px] uppercase tracking-wide text-fg-muted">Total</div>
                            <div className="mt-1 text-sm font-medium text-fg">
                              {formatUsdFromCents(t.total_cost_cents)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {t.notes ? (
                        <div className="mt-3 border-t border-border pt-3 text-sm text-fg">
                          <div className="text-[11px] uppercase tracking-wide text-fg-muted">Notes</div>
                          <div className="mt-1 whitespace-pre-wrap">{t.notes}</div>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </UiCard>

            <UiCard>
              <CardHeader title="Assets" subtitle="Linked screenshots and source files" />
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-border bg-bg-muted p-4">
                  <div className="text-sm font-medium text-fg">Add screenshots (secondary)</div>
                  <div className="mt-1 text-xs text-fg-muted">
                    Attach additional screenshots to an existing card, optionally linking them to a transaction.
                  </div>
                  <div className="mt-4">
                    <UploadScreenshots
                      cardId={detail.card.id}
                      transactions={detail.transactions.map((t) => ({
                        id: t.id,
                        label: `${t.platform ?? 'Platform'} · ${t.purchase_date ?? '—'} · ${formatUsdFromCents(
                          t.total_cost_cents,
                        )}`,
                      }))}
                    />
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                    <div className="text-xs text-fg-muted">Re-run extraction and review updates when needed.</div>
                    <Link
                      href={`/ingest/review?cardId=${detail.card.id}`}
                      className="rounded-xl bg-accent/20 px-3 py-2 text-sm text-fg ring-1 ring-accent/30 hover:bg-accent/25"
                    >
                      Review extracted details
                    </Link>
                  </div>
                </div>

                {detail.assets.length === 0 ? (
                  <div className="rounded-xl border border-border bg-bg-muted p-4 text-sm text-fg-muted">
                    No assets linked yet.
                  </div>
                ) : (
                  detail.assets.map((a) => (
                    <div key={a.id} className="rounded-xl border border-border bg-bg-muted p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-fg">Screenshot</div>
                          <div className="mt-1 truncate font-mono text-xs text-fg-muted">
                            {a.bucket}/{a.path}
                          </div>
                          <div className="mt-2 text-xs text-fg-muted">
                            {a.mime_type ?? '—'}
                            {a.size_bytes ? ` · ${Math.round(a.size_bytes / 1024)} KB` : ''}
                          </div>
                          {a.signed_url ? (
                            <a
                              href={a.signed_url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-block text-xs text-accent hover:underline underline-offset-4"
                            >
                              Open image
                            </a>
                          ) : null}
                        </div>
                      </div>
                      {a.signed_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={a.signed_url}
                          alt="Screenshot"
                          className="mt-3 w-full rounded-xl border border-border object-cover"
                        />
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </UiCard>
          </section>
        </>
      ) : null}
    </div>
  );
}

