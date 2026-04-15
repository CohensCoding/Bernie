import { Card as UiCard, CardHeader } from '@/components/ui/Card';
import { EbayImportClient } from '@/components/import/ebay/EbayImportClient';

export const dynamic = 'force-dynamic';

export default function EbayImportPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-12">
      <header className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Import</p>
        <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">Import from eBay</h1>
        <p className="text-sm text-fg-muted">
          Connect, browse your last 90 days, and choose what to add. Nothing imports automatically.
        </p>
      </header>

      <UiCard className="px-6 py-6 sm:px-8 sm:py-8">
        <CardHeader title="Recent purchases" subtitle="Selectively import only what belongs in your collection." />
        <div className="mt-6">
          <EbayImportClient />
        </div>
      </UiCard>
    </div>
  );
}

