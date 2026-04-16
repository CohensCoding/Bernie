import { Card as UiCard, CardHeader } from '@/components/ui/Card';
import { EbayUrlImportClient } from '@/components/import/ebay/EbayUrlImportClient';

export const dynamic = 'force-dynamic';

export default function EbayUrlImportPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-12">
      <header className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Import</p>
        <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">Paste eBay listing URL</h1>
        <p className="text-sm text-fg-muted">Paste a listing link, review the details, then save to your collection.</p>
      </header>

      <UiCard className="px-6 py-6 sm:px-8 sm:py-8">
        <CardHeader title="Listing URL" subtitle="We’ll fetch structured details when possible." />
        <div className="mt-6">
          <EbayUrlImportClient />
        </div>
      </UiCard>
    </div>
  );
}

