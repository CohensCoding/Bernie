'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExtractionReviewForm } from '@/components/ingest/ExtractionReviewForm';
import { emptyExtractionPayload, type ExtractionPayload } from '@/types/extraction';

type Status = 'extracting' | 'parsed' | 'failed';

export function IngestReviewClient({
  cardId,
  assets,
}: {
  cardId: string;
  assets: Array<{ id: string; signed_url: string | null; label: string }>;
}) {
  const [status, setStatus] = useState<Status>('extracting');
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ExtractionPayload>(emptyExtractionPayload());

  const assetIds = useMemo(() => assets.map((a) => a.id).slice(0, 3), [assets]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setStatus('extracting');
      setError(null);
      try {
        if (assetIds.length === 0) {
          setStatus('failed');
          setError('No screenshots found. Upload 1–3 screenshots before running extraction.');
          return;
        }

        const res = await fetch(`/api/ingest/extract?cardId=${cardId}&assetIds=${assetIds.join(',')}`, {
          method: 'GET',
          headers: { 'accept': 'application/json' },
        });
        const json = (await res.json()) as any;
        if (!res.ok) throw new Error(json?.error ?? 'Extraction failed.');
        if (!json?.extraction) throw new Error('Extractor returned no data.');

        if (cancelled) return;
        setExtraction(json.extraction as ExtractionPayload);
        setStatus('parsed');
      } catch (e) {
        if (cancelled) return;
        setStatus('failed');
        setError(e instanceof Error ? e.message : 'Extraction failed.');
        setExtraction(emptyExtractionPayload());
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [assetIds, cardId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-fg">
          Status:{' '}
          {status === 'extracting' ? (
            <span className="text-fg-muted">Extracting…</span>
          ) : status === 'parsed' ? (
            <span className="text-accent">Parsed</span>
          ) : (
            <span className="text-red-300">Failed</span>
          )}
        </div>
        <div className="text-xs text-fg-muted">
          Using <span className="text-fg">{Math.min(assetIds.length, 3)}</span> screenshot(s)
        </div>
      </div>

      {status === 'failed' && error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <ExtractionReviewForm
        cardId={cardId}
        assets={assets}
        extraction={extraction}
        extractionStatus={status}
        extractionError={error}
      />
    </div>
  );
}

