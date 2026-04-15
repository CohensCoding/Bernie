import { Card as UiCard, CardHeader } from '@/components/ui/Card';
import { NewCardIngest } from '@/components/ingest/NewCardIngest';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function IngestNewPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10 pb-12">
      <header className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Add to collection</p>
        <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-[2rem]">New card from screenshots</h1>
        <p className="max-w-xl text-sm leading-relaxed text-fg-muted">
          Turn listing or receipt captures into a structured portfolio entry. You stay in control—nothing saves until you
          confirm.
        </p>
      </header>

      <UiCard className="px-6 py-6 sm:px-8 sm:py-8">
        <CardHeader
          title="Workflow"
          subtitle="Three short steps: start a draft, upload images, then review extracted fields."
          right={
            <Link
              href="/import/ebay"
              className="rounded-xl border border-border/80 bg-bg-muted/40 px-3 py-2 text-xs font-medium text-fg transition hover:bg-bg-muted/70"
            >
              Import from eBay
            </Link>
          }
        />
        <div className="mt-8">
          <NewCardIngest />
        </div>
      </UiCard>
    </div>
  );
}
