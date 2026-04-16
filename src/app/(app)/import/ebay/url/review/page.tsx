import { Card as UiCard, CardHeader } from '@/components/ui/Card';
import { EbayUrlImportReviewClient } from '@/components/import/ebay/EbayUrlImportReviewClient';

export const dynamic = 'force-dynamic';

export default function EbayUrlImportReviewPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-12">
      <header className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Import</p>
        <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">Review before saving</h1>
        <p className="text-sm text-fg-muted">We’ll prefill from the listing and let you correct anything.</p>
      </header>

      <UiCard className="px-6 py-6 sm:px-8 sm:py-8">
        <CardHeader title="Details" subtitle="Raw listing + editable collection fields." />
        <div className="mt-6">
          <EbayUrlImportReviewClient />
        </div>
      </UiCard>
    </div>
  );
}

