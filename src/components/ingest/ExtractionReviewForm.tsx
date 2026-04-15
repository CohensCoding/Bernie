'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ExtractionPayload } from '@/types/extraction';

function nullableNumber() {
  return z.preprocess((v) => {
    if (v === '' || v === undefined) return null;
    return v;
  }, z.coerce.number().nullable());
}

function nullableInt() {
  return z.preprocess((v) => {
    if (v === '' || v === undefined) return null;
    return v;
  }, z.coerce.number().int().nullable());
}

const ReviewSchema = z.object({
  // card
  title_raw: z.string().nullable(),
  player_name: z.string().nullable(),
  sport: z.string().nullable(),
  team: z.string().nullable(),
  year: nullableInt(),
  brand: z.string().nullable(),
  set_name: z.string().nullable(),
  subset: z.string().nullable(),
  card_number: z.string().nullable(),
  parallel: z.string().nullable(),
  serial_number: nullableInt(),
  print_run: nullableInt(),
  rookie: z.boolean(),
  auto: z.boolean(),
  patch: z.boolean(),
  graded: z.boolean(),
  grading_company: z.string().nullable(),
  grade: z.string().nullable(),
  // purchase
  platform: z.string().nullable(),
  source_url: z.string().nullable(),
  purchase_date: z.string().nullable(),
  purchase_price: nullableNumber(),
  taxes: nullableNumber(),
  shipping: nullableNumber(),
  total_cost: nullableNumber(),
  // notes
  notes: z.string().nullable(),

  asset_ids: z.array(z.string().uuid()),
}).strict();

type ReviewValues = z.infer<typeof ReviewSchema>;

function buildReviewDefaults(
  extraction: ExtractionPayload,
  assets: Array<{ id: string }>,
  extractionStatus: 'parsed' | 'failed',
): ReviewValues {
  const asset_ids = assets.map((a) => a.id);
  if (extractionStatus !== 'parsed') {
    return {
      title_raw: null,
      player_name: null,
      sport: null,
      team: null,
      year: null,
      brand: null,
      set_name: null,
      subset: null,
      card_number: null,
      parallel: null,
      serial_number: null,
      print_run: null,
      rookie: false,
      auto: false,
      patch: false,
      graded: false,
      grading_company: null,
      grade: null,
      platform: null,
      source_url: null,
      purchase_date: null,
      purchase_price: null,
      taxes: null,
      shipping: null,
      total_cost: null,
      notes: null,
      asset_ids,
    };
  }

  return {
    title_raw: extraction.title_raw.value ?? null,
    player_name: extraction.player_name.value ?? null,
    sport: extraction.sport.value ?? null,
    team: extraction.team.value ?? null,
    year: extraction.year.value ?? null,
    brand: extraction.brand.value ?? null,
    set_name: extraction.set_name.value ?? null,
    subset: extraction.subset.value ?? null,
    card_number: extraction.card_number.value ?? null,
    parallel: extraction.parallel.value ?? null,
    serial_number: extraction.serial_number.value ?? null,
    print_run: extraction.print_run.value ?? null,
    rookie: extraction.rookie.value === true,
    auto: extraction.auto.value === true,
    patch: extraction.patch.value === true,
    graded: extraction.graded.value === true,
    grading_company: extraction.grading_company.value ?? null,
    grade: extraction.grade.value ?? null,
    platform: extraction.platform.value ?? null,
    source_url: extraction.source_url.value ?? null,
    purchase_date: extraction.purchase_date.value ?? null,
    purchase_price: extraction.purchase_price.value ?? null,
    taxes: extraction.taxes.value ?? null,
    shipping: extraction.shipping.value ?? null,
    total_cost: extraction.total_cost.value ?? null,
    notes: extraction.notes.value ?? null,
    asset_ids,
  };
}

function dollarsToCents(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return 0;
  return Math.max(0, Math.round(v * 100));
}

function nullIfEmpty(v: unknown): string | null {
  const t = String(v ?? '').trim();
  return t.length ? t : null;
}

function SectionTitle({ kicker, children }: { kicker?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 border-b border-border/50 pb-3">
      {kicker ? (
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-fg-muted">{kicker}</div>
      ) : null}
      <h3 className="mt-1 text-[15px] font-semibold tracking-tight text-fg">{children}</h3>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">{label}</div>
        {hint ? (
          <span className="shrink-0 rounded-md bg-accent/12 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-accent">
            {hint}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        'w-full rounded-xl border border-border/90 bg-bg-muted/80 px-3.5 py-2.5 text-sm text-fg shadow-sm placeholder:text-fg-muted/70 outline-none transition focus:border-accent/40 focus:ring-2 focus:ring-accent/25 ' +
        (props.className ?? '')
      }
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={
        'w-full rounded-xl border border-border/90 bg-bg-muted/80 px-3.5 py-2.5 text-sm text-fg shadow-sm placeholder:text-fg-muted/70 outline-none transition focus:border-accent/40 focus:ring-2 focus:ring-accent/25 ' +
        (props.className ?? '')
      }
    />
  );
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={
        'inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition ' +
        (checked
          ? 'border-accent/35 bg-accent/12 text-fg ring-1 ring-accent/20'
          : 'border-border/90 bg-bg-muted/60 text-fg-muted hover:border-border hover:text-fg')
      }
    >
      <span
        className={
          'flex h-4 w-4 items-center justify-center rounded border text-[10px] leading-none ' +
          (checked ? 'border-accent/50 bg-accent/35 text-white' : 'border-border bg-bg-elevated/50')
        }
      >
        {checked ? '✓' : null}
      </span>
      {label}
    </button>
  );
}

export function ExtractionReviewForm({
  cardId,
  assets,
  extraction,
  extractionStatus,
  extractionFailureKind = null,
  entryMode = 'normal',
}: {
  cardId: string;
  assets: Array<{ id: string; signed_url: string | null; label: string }>;
  extraction: ExtractionPayload;
  extractionStatus: 'parsed' | 'failed';
  extractionFailureKind?: string | null;
  /** After a failed extraction, user chose to fill the form without retrying. */
  entryMode?: 'normal' | 'manual';
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ackEmptyWarning, setAckEmptyWarning] = useState(false);

  const defaultValues: ReviewValues = useMemo(
    () => buildReviewDefaults(extraction, assets, extractionStatus),
    [assets, extraction, extractionStatus],
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { isDirty },
  } = useForm<ReviewValues>({
    resolver: zodResolver(ReviewSchema) as any,
    defaultValues,
  });

  useEffect(() => {
    reset(buildReviewDefaults(extraction, assets, extractionStatus));
  }, [extraction, assets, extractionStatus, reset]);

  const confHint = (c: number | null | undefined) => (extractionStatus === 'parsed' ? fmtConf(c) : '');

  const selectedAssets = watch('asset_ids');
  const wTitle = watch('title_raw');
  const wPlayer = watch('player_name');
  const wTotal = watch('total_cost');
  const wPurchase = watch('purchase_price');
  const wPlatform = watch('platform');
  const wDate = watch('purchase_date');

  const hasIdentity = Boolean((wTitle ?? '').trim().length || (wPlayer ?? '').trim().length);
  const hasMoney = (wTotal ?? 0) > 0 || (wPurchase ?? 0) > 0;
  const hasAnyPurchaseMeta = Boolean((wPlatform ?? '').trim().length || (wDate ?? '').trim().length);

  const saveWouldBeEmpty = !hasIdentity && !hasMoney && !hasAnyPurchaseMeta;
  const extractionFailed = extractionStatus === 'failed';
  const savingBlocked =
    busy || (extractionFailed && saveWouldBeEmpty) || (saveWouldBeEmpty && !ackEmptyWarning);

  const onSubmit: SubmitHandler<ReviewValues> = async (values) => {
    setBusy(true);
    setError(null);
    try {
      const identity = Boolean(nullIfEmpty(values.title_raw) || nullIfEmpty(values.player_name));
      const money =
        dollarsToCents(values.total_cost) > 0 ||
        dollarsToCents(values.purchase_price) > 0 ||
        dollarsToCents(values.taxes) > 0 ||
        dollarsToCents(values.shipping) > 0;
      const meta = Boolean(nullIfEmpty(values.platform) || nullIfEmpty(values.purchase_date) || nullIfEmpty(values.source_url));

      if (extractionStatus === 'failed' && !identity && !money && !meta) {
        const apiIssue = Boolean(extractionFailureKind?.startsWith('openai_'));
        throw new Error(
          apiIssue
            ? 'Extraction did not run. Add at least a title or player and purchase details before saving (or acknowledge an empty save below).'
            : 'Extraction failed. Fill in at least a title/player and purchase total before saving.',
        );
      }

      const body = {
        card_id: cardId,
        card: {
          title_raw: nullIfEmpty(values.title_raw),
          player_name: nullIfEmpty(values.player_name),
          sport: nullIfEmpty(values.sport),
          team: nullIfEmpty(values.team),
          year: values.year ?? null,
          brand: nullIfEmpty(values.brand),
          set_name: nullIfEmpty(values.set_name),
          subset: nullIfEmpty(values.subset),
          card_number: nullIfEmpty(values.card_number),
          parallel: nullIfEmpty(values.parallel),
          serial_number: values.serial_number ?? null,
          print_run: values.print_run ?? null,
          rookie: values.rookie,
          auto: values.auto,
          patch: values.patch,
          graded: values.graded,
          grading_company: values.graded ? nullIfEmpty(values.grading_company) : null,
          grade: values.graded ? nullIfEmpty(values.grade) : null,
          notes: nullIfEmpty(values.notes),
        },
        transaction: {
          platform: nullIfEmpty(values.platform),
          source_url: nullIfEmpty(values.source_url),
          title_raw: nullIfEmpty(values.title_raw),
          purchase_date: nullIfEmpty(values.purchase_date),
          purchase_price_cents: dollarsToCents(values.purchase_price),
          taxes_cents: dollarsToCents(values.taxes),
          shipping_cents: dollarsToCents(values.shipping),
          total_cost_cents: dollarsToCents(values.total_cost),
          notes: nullIfEmpty(values.notes),
        },
        asset_ids: values.asset_ids,
      };

      const res = await fetch('/api/ingest/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as any;
      if (!res.ok) throw new Error(json?.error ?? 'Save failed.');

      router.push(`/cards/${json.card_id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  function toggleAsset(id: string) {
    const set = new Set(selectedAssets);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    setValue('asset_ids', Array.from(set));
  }

  const showApiContext =
    extractionStatus === 'failed' &&
    extractionFailureKind?.startsWith('openai_') &&
    entryMode === 'normal';

  return (
    <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-8">
      {entryMode === 'manual' ? (
        <div className="rounded-2xl border border-border/80 bg-bg-muted/40 px-4 py-3 text-sm text-fg-muted">
          <span className="font-medium text-fg">Manual entry</span>
          <span className="mx-1.5 text-fg-muted">·</span>
          Fields start empty so you can type what you know. Nothing here was inferred from your screenshots.
        </div>
      ) : null}

      {showApiContext ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-100/90">
          <span className="font-medium text-amber-100">API did not return extracted text.</span>{' '}
          This is usually billing, quota, or project settings—not missing information in your images. You can still edit
          and save below.
        </div>
      ) : null}

      {saveWouldBeEmpty ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-4 text-sm text-amber-100">
          <div className="text-[13px] font-semibold text-amber-100">Almost nothing to save</div>
          <div className="mt-1.5 text-sm leading-relaxed text-amber-100/85">
            This save would create a blank-looking card and a $0 transaction. Add a title or player and a purchase total,
            or confirm below.
          </div>
          <div className="mt-4 flex items-center gap-3">
            <input
              id="ackEmpty"
              type="checkbox"
              checked={ackEmptyWarning}
              onChange={(e) => setAckEmptyWarning(e.target.checked)}
              className="h-4 w-4 rounded border-amber-400/40 text-accent focus:ring-accent/40"
            />
            <label htmlFor="ackEmpty" className="text-sm text-amber-100/95">
              I understand — save anyway
            </label>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
        <div className="space-y-10 lg:col-span-8">
          <section className="space-y-5">
            <SectionTitle kicker="Card">Identity</SectionTitle>
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
              <Field label="Title (raw)" hint={confHint(extraction.title_raw.confidence)}>
                <Input placeholder="eBay title" {...register('title_raw')} />
              </Field>
              <Field label="Player" hint={confHint(extraction.player_name.confidence)}>
                <Input placeholder="Player name" {...register('player_name')} />
              </Field>
              <Field label="Sport" hint={confHint(extraction.sport.confidence)}>
                <Input placeholder="Sport" {...register('sport')} />
              </Field>
              <Field label="Team" hint={confHint(extraction.team.confidence)}>
                <Input placeholder="Team" {...register('team')} />
              </Field>
              <Field label="Year" hint={confHint(extraction.year.confidence)}>
                <Input placeholder="Year" inputMode="numeric" {...register('year', { valueAsNumber: true })} />
              </Field>
              <Field label="Brand" hint={confHint(extraction.brand.confidence)}>
                <Input placeholder="Brand" {...register('brand')} />
              </Field>
              <Field label="Set name" hint={confHint(extraction.set_name.confidence)}>
                <Input placeholder="Set name" {...register('set_name')} />
              </Field>
              <Field label="Subset" hint={confHint(extraction.subset.confidence)}>
                <Input placeholder="Subset" {...register('subset')} />
              </Field>
              <Field label="Card number" hint={confHint(extraction.card_number.confidence)}>
                <Input placeholder="Card #" {...register('card_number')} />
              </Field>
              <Field label="Parallel" hint={confHint(extraction.parallel.confidence)}>
                <Input placeholder="Parallel" {...register('parallel')} />
              </Field>
              <Field label="Serial number" hint={confHint(extraction.serial_number.confidence)}>
                <Input placeholder="Serial # (e.g. 23)" inputMode="numeric" {...register('serial_number', { valueAsNumber: true })} />
              </Field>
              <Field label="Print run" hint={confHint(extraction.print_run.confidence)}>
                <Input placeholder="Print run (e.g. 99)" inputMode="numeric" {...register('print_run', { valueAsNumber: true })} />
              </Field>
            </div>

            <div className="flex flex-wrap gap-2">
              <Checkbox checked={watch('rookie')} onChange={(v) => setValue('rookie', v)} label="Rookie" />
              <Checkbox checked={watch('auto')} onChange={(v) => setValue('auto', v)} label="Auto" />
              <Checkbox checked={watch('patch')} onChange={(v) => setValue('patch', v)} label="Patch" />
            </div>
          </section>

          <section className="space-y-5">
            <SectionTitle kicker="Condition">Grading</SectionTitle>
            <div className="flex flex-wrap gap-2">
              <Checkbox checked={watch('graded')} onChange={(v) => setValue('graded', v)} label={watch('graded') ? 'Graded' : 'Raw'} />
            </div>
            {watch('graded') ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Grading company" hint={confHint(extraction.grading_company.confidence)}>
                  <Input placeholder="PSA, BGS, SGC…" {...register('grading_company')} />
                </Field>
                <Field label="Grade" hint={confHint(extraction.grade.confidence)}>
                  <Input placeholder="10, 9.5…" {...register('grade')} />
                </Field>
              </div>
            ) : null}
          </section>

          <section className="space-y-5">
            <SectionTitle kicker="Transaction">Purchase</SectionTitle>
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
              <Field label="Platform" hint={confHint(extraction.platform.confidence)}>
                <Input placeholder="eBay" {...register('platform')} />
              </Field>
              <Field label="Purchase date" hint={confHint(extraction.purchase_date.confidence)}>
                <Input placeholder="YYYY-MM-DD" {...register('purchase_date')} />
              </Field>
              <Field label="Purchase price ($)" hint={confHint(extraction.purchase_price.confidence)}>
                <Input placeholder="0.00" inputMode="decimal" {...register('purchase_price', { valueAsNumber: true })} />
              </Field>
              <Field label="Taxes ($)" hint={confHint(extraction.taxes.confidence)}>
                <Input placeholder="0.00" inputMode="decimal" {...register('taxes', { valueAsNumber: true })} />
              </Field>
              <Field label="Shipping ($)" hint={confHint(extraction.shipping.confidence)}>
                <Input placeholder="0.00" inputMode="decimal" {...register('shipping', { valueAsNumber: true })} />
              </Field>
              <Field label="Total cost ($)" hint={confHint(extraction.total_cost.confidence)}>
                <Input placeholder="0.00" inputMode="decimal" {...register('total_cost', { valueAsNumber: true })} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Source URL" hint={confHint(extraction.source_url.confidence)}>
                  <Input placeholder="https://…" {...register('source_url')} />
                </Field>
              </div>
            </div>
          </section>

          <section className="space-y-5">
            <SectionTitle kicker="Optional">Notes</SectionTitle>
            <Field label="Notes / context" hint={confHint(extraction.notes.confidence)}>
              <Textarea rows={4} placeholder="Anything you want to remember…" {...register('notes')} />
            </Field>
          </section>
        </div>

        <aside className="space-y-5 lg:col-span-4 lg:pt-1">
          <div className="rounded-2xl border border-border/90 bg-bg-elevated/50 p-5 shadow-sm lg:sticky lg:top-24">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-muted">Attachments</div>
            <div className="mt-1 text-sm font-medium text-fg">Screenshots</div>
            <p className="mt-2 text-xs leading-relaxed text-fg-muted">
              Choose which files to link to this save. Thumbnails reflect your uploads.
            </p>
            <div className="mt-5 space-y-2.5">
              {assets.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-bg-muted/50 p-5 text-center text-sm text-fg-muted">
                  No screenshots on this card.
                </div>
              ) : (
                assets.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleAsset(a.id)}
                    className={
                      'w-full rounded-xl border p-3 text-left transition ' +
                      (selectedAssets.includes(a.id)
                        ? 'border-accent/45 bg-accent/[0.09] ring-1 ring-accent/15'
                        : 'border-border/80 bg-bg-muted/50 hover:border-border hover:bg-bg-muted/80')
                    }
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border/80 bg-bg-elevated">
                        {a.signed_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.signed_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] text-fg-muted">—</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-fg">{a.label}</div>
                        <div className="mt-0.5 text-[10px] text-fg-muted/70">tap to toggle</div>
                      </div>
                      <div
                        className={
                          'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold ' +
                          (selectedAssets.includes(a.id)
                            ? 'border-accent/40 bg-accent/25 text-bg'
                            : 'border-border/60 text-fg-muted')
                        }
                      >
                        {selectedAssets.includes(a.id) ? '✓' : ''}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-500/25 bg-red-500/[0.07] p-3 text-sm text-red-200">{error}</div>
          ) : null}

          <button
            type="submit"
            disabled={savingBlocked}
            className="flex w-full min-h-[48px] items-center justify-center rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-bg shadow-md transition hover:bg-accent-muted disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy ? 'Saving…' : isDirty ? 'Save changes' : 'Save to portfolio'}
          </button>
          <p className="text-center text-[11px] text-fg-muted/80">Updates this card and creates the purchase record.</p>
        </aside>
      </div>
    </form>
  );
}

function fmtConf(v: number | null | undefined) {
  if (v == null) return '';
  return `${Math.round(v * 100)}%`;
}

