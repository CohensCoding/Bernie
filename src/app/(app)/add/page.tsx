import Link from 'next/link';
import { Card as UiCard, CardHeader } from '@/components/ui/Card';

export const dynamic = 'force-dynamic';

function OptionCard({
  title,
  description,
  href,
  badge,
}: {
  title: string;
  description: string;
  href: string;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-border/80 bg-bg-elevated/30 p-5 transition hover:border-border hover:bg-bg-elevated/60"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-fg">{title}</div>
          <div className="mt-1 text-sm leading-relaxed text-fg-muted">{description}</div>
        </div>
        {badge ? (
          <span className="shrink-0 rounded-full border border-border/70 bg-bg-muted/40 px-2.5 py-1 text-[11px] font-semibold text-fg">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-fg-muted/80 transition group-hover:text-fg-muted">
        Choose →
      </div>
    </Link>
  );
}

export default function AddCardPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-12">
      <header className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Add to collection</p>
        <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-[2rem]">Add a card</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-fg-muted">
          Pick the method that matches what you have. Nothing saves until you review.
        </p>
      </header>

      <UiCard className="px-6 py-6 sm:px-8 sm:py-8">
        <CardHeader title="Import method" subtitle="Fast when you have a listing. Precise when you want full control." />
        <div className="mt-6 grid gap-3">
          <OptionCard
            title="Manual add"
            description="Enter the fields yourself. Best when you already know the exact card details."
            href="/cards/new"
          />
          <OptionCard
            title="Upload screenshots"
            description="Upload 1–3 screenshots from a listing or receipt and review the extracted fields."
            href="/ingest/new"
          />
          <OptionCard
            title="Import from eBay account"
            description="Browse your recent purchases and selectively import what belongs in your collection."
            href="/import/ebay"
          />
          <OptionCard
            title="Paste eBay listing URL"
            description="Paste a listing link to fetch structured details and review before saving."
            href="/import/ebay/url"
            badge="New"
          />
        </div>
      </UiCard>
    </div>
  );
}

