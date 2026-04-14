'use client';

import { useMemo, useState } from 'react';
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

function dollarsToCents(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return 0;
  return Math.max(0, Math.round(v * 100));
}

function nullIfEmpty(v: unknown): string | null {
  const t = String(v ?? '').trim();
  return t.length ? t : null;
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
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[11px] uppercase tracking-wide text-fg-muted">{label}</div>
        {hint ? <div className="text-[11px] text-fg-muted">{hint}</div> : null}
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
        'w-full rounded-xl border border-border bg-bg-muted px-3 py-2 text-sm text-fg placeholder:text-fg-muted outline-none focus:ring-2 focus:ring-accent/40 ' +
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
        'w-full rounded-xl border border-border bg-bg-muted px-3 py-2 text-sm text-fg placeholder:text-fg-muted outline-none focus:ring-2 focus:ring-accent/40 ' +
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
        'inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm ' +
        (checked ? 'bg-accent/15 text-fg ring-1 ring-accent/25' : 'bg-bg-muted text-fg-muted hover:text-fg')
      }
    >
      <span className={'h-4 w-4 rounded border ' + (checked ? 'bg-accent/50 border-accent/60' : 'border-border')} />
      {label}
    </button>
  );
}

export function ExtractionReviewForm({
  cardId,
  assets,
  extraction,
}: {
  cardId: string;
  assets: Array<{ id: string; signed_url: string | null; label: string }>;
  extraction: ExtractionPayload;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultValues: ReviewValues = useMemo(
    () => ({
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
      rookie: extraction.rookie.value ?? false,
      auto: extraction.auto.value ?? false,
      patch: extraction.patch.value ?? false,
      graded: extraction.graded.value ?? false,
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
      asset_ids: assets.map((a) => a.id),
    }),
    [assets, extraction],
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { isDirty },
  } = useForm<ReviewValues>({
    resolver: zodResolver(ReviewSchema) as any,
    defaultValues,
  });

  const selectedAssets = watch('asset_ids');

  const onSubmit: SubmitHandler<ReviewValues> = async (values) => {
    setBusy(true);
    setError(null);
    try {
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

  return (
    <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section className="space-y-4">
            <div className="text-sm font-medium text-fg">Card identity</div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Title (raw)" hint={fmtConf(extraction.title_raw.confidence)}>
                <Input placeholder="eBay title" {...register('title_raw')} />
              </Field>
              <Field label="Player" hint={fmtConf(extraction.player_name.confidence)}>
                <Input placeholder="Player name" {...register('player_name')} />
              </Field>
              <Field label="Sport" hint={fmtConf(extraction.sport.confidence)}>
                <Input placeholder="Sport" {...register('sport')} />
              </Field>
              <Field label="Team" hint={fmtConf(extraction.team.confidence)}>
                <Input placeholder="Team" {...register('team')} />
              </Field>
              <Field label="Year" hint={fmtConf(extraction.year.confidence)}>
                <Input placeholder="Year" inputMode="numeric" {...register('year', { valueAsNumber: true })} />
              </Field>
              <Field label="Brand" hint={fmtConf(extraction.brand.confidence)}>
                <Input placeholder="Brand" {...register('brand')} />
              </Field>
              <Field label="Set name" hint={fmtConf(extraction.set_name.confidence)}>
                <Input placeholder="Set name" {...register('set_name')} />
              </Field>
              <Field label="Subset" hint={fmtConf(extraction.subset.confidence)}>
                <Input placeholder="Subset" {...register('subset')} />
              </Field>
              <Field label="Card number" hint={fmtConf(extraction.card_number.confidence)}>
                <Input placeholder="Card #" {...register('card_number')} />
              </Field>
              <Field label="Parallel" hint={fmtConf(extraction.parallel.confidence)}>
                <Input placeholder="Parallel" {...register('parallel')} />
              </Field>
              <Field label="Serial number" hint={fmtConf(extraction.serial_number.confidence)}>
                <Input placeholder="Serial # (e.g. 23)" inputMode="numeric" {...register('serial_number', { valueAsNumber: true })} />
              </Field>
              <Field label="Print run" hint={fmtConf(extraction.print_run.confidence)}>
                <Input placeholder="Print run (e.g. 99)" inputMode="numeric" {...register('print_run', { valueAsNumber: true })} />
              </Field>
            </div>

            <div className="flex flex-wrap gap-2">
              <Checkbox checked={watch('rookie')} onChange={(v) => setValue('rookie', v)} label="Rookie" />
              <Checkbox checked={watch('auto')} onChange={(v) => setValue('auto', v)} label="Auto" />
              <Checkbox checked={watch('patch')} onChange={(v) => setValue('patch', v)} label="Patch" />
            </div>
          </section>

          <section className="space-y-4">
            <div className="text-sm font-medium text-fg">Grading</div>
            <div className="flex flex-wrap gap-2">
              <Checkbox checked={watch('graded')} onChange={(v) => setValue('graded', v)} label={watch('graded') ? 'Graded' : 'Raw'} />
            </div>
            {watch('graded') ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Grading company" hint={fmtConf(extraction.grading_company.confidence)}>
                  <Input placeholder="PSA, BGS, SGC…" {...register('grading_company')} />
                </Field>
                <Field label="Grade" hint={fmtConf(extraction.grade.confidence)}>
                  <Input placeholder="10, 9.5…" {...register('grade')} />
                </Field>
              </div>
            ) : null}
          </section>

          <section className="space-y-4">
            <div className="text-sm font-medium text-fg">Purchase details</div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Platform" hint={fmtConf(extraction.platform.confidence)}>
                <Input placeholder="eBay" {...register('platform')} />
              </Field>
              <Field label="Purchase date" hint={fmtConf(extraction.purchase_date.confidence)}>
                <Input placeholder="YYYY-MM-DD" {...register('purchase_date')} />
              </Field>
              <Field label="Purchase price ($)" hint={fmtConf(extraction.purchase_price.confidence)}>
                <Input placeholder="0.00" inputMode="decimal" {...register('purchase_price', { valueAsNumber: true })} />
              </Field>
              <Field label="Taxes ($)" hint={fmtConf(extraction.taxes.confidence)}>
                <Input placeholder="0.00" inputMode="decimal" {...register('taxes', { valueAsNumber: true })} />
              </Field>
              <Field label="Shipping ($)" hint={fmtConf(extraction.shipping.confidence)}>
                <Input placeholder="0.00" inputMode="decimal" {...register('shipping', { valueAsNumber: true })} />
              </Field>
              <Field label="Total cost ($)" hint={fmtConf(extraction.total_cost.confidence)}>
                <Input placeholder="0.00" inputMode="decimal" {...register('total_cost', { valueAsNumber: true })} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Source URL" hint={fmtConf(extraction.source_url.confidence)}>
                  <Input placeholder="https://…" {...register('source_url')} />
                </Field>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="text-sm font-medium text-fg">Notes</div>
            <Field label="Notes / context" hint={fmtConf(extraction.notes.confidence)}>
              <Textarea rows={4} placeholder="Anything you want to remember…" {...register('notes')} />
            </Field>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-bg-elevated/70 p-4">
            <div className="text-sm font-medium text-fg">Screenshots</div>
            <div className="mt-1 text-xs text-fg-muted">Select which uploads to attach to this saved transaction.</div>
            <div className="mt-4 space-y-3">
              {assets.length === 0 ? (
                <div className="rounded-xl border border-border bg-bg-muted p-4 text-sm text-fg-muted">
                  No screenshots found for this card.
                </div>
              ) : (
                assets.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleAsset(a.id)}
                    className={
                      'w-full rounded-xl border p-3 text-left ' +
                      (selectedAssets.includes(a.id)
                        ? 'border-accent/50 bg-accent/10'
                        : 'border-border bg-bg-muted hover:bg-bg-elevated/60')
                    }
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-16 w-16 overflow-hidden rounded-lg border border-border bg-bg-elevated">
                        {a.signed_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.signed_url} alt="Screenshot" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-fg">{a.label}</div>
                        <div className="mt-1 text-xs text-fg-muted font-mono">{a.id}</div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-accent/20 px-4 py-3 text-sm text-fg ring-1 ring-accent/30 hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Saving…' : isDirty ? 'Save changes' : 'Save'}
          </button>

          <div className="text-xs text-fg-muted">
            This step uses a <span className="text-fg">mock extraction</span>. Next step will plug in a real extractor.
          </div>
        </aside>
      </div>
    </form>
  );
}

function fmtConf(v: number | null | undefined) {
  if (v == null) return '';
  return `conf ${Math.round(v * 100)}%`;
}

