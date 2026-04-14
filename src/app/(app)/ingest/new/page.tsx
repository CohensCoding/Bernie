import { Card as UiCard, CardHeader } from '@/components/ui/Card';
import { NewCardIngest } from '@/components/ingest/NewCardIngest';

export const dynamic = 'force-dynamic';

export default function IngestNewPage() {
  return (
    <div className="space-y-8">
      <div>
        <div className="text-2xl font-semibold tracking-tight text-fg">Add to Collection</div>
        <div className="mt-2 text-sm text-fg-muted">
          Upload 1–3 eBay screenshots, review extracted details, then save a new card to your portfolio.
        </div>
      </div>

      <UiCard>
        <CardHeader title="New card ingestion" subtitle="Upload → extract → review → save" />
        <div className="mt-5">
          <NewCardIngest />
        </div>
      </UiCard>
    </div>
  );
}

