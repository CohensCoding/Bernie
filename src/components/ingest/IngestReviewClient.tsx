'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExtractionFailurePanel, ExtractionProgressView } from '@/components/ingest/IngestPhaseViews';
import { ExtractionReviewForm } from '@/components/ingest/ExtractionReviewForm';
import { emptyExtractionPayload, type ExtractionPayload } from '@/types/extraction';

type Phase = 'extracting' | 'parsed' | 'failed' | 'manual_entry';

export function IngestReviewClient({
  cardId,
  assets,
}: {
  cardId: string;
  assets: Array<{ id: string; signed_url: string | null; label: string }>;
}) {
  const [phase, setPhase] = useState<Phase>('extracting');
  const [error, setError] = useState<string | null>(null);
  const [failureKind, setFailureKind] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ExtractionPayload>(emptyExtractionPayload());
  const [runId, setRunId] = useState(0);
  const [retryBusy, setRetryBusy] = useState(false);

  const assetIds = useMemo(() => assets.map((a) => a.id).slice(0, 3), [assets]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setPhase('extracting');
      setError(null);
      setFailureKind(null);

      try {
        if (assetIds.length === 0) {
          if (cancelled) return;
          setFailureKind('no_screenshots');
          setError('No screenshots found. Upload 1–3 screenshots before running extraction.');
          setExtraction(emptyExtractionPayload());
          setPhase('failed');
          return;
        }

        const res = await fetch(`/api/ingest/extract?cardId=${cardId}&assetIds=${assetIds.join(',')}`, {
          method: 'GET',
          headers: { accept: 'application/json' },
        });
        const json = (await res.json()) as {
          error?: string;
          errorKind?: string;
          extraction?: ExtractionPayload;
        };

        if (cancelled) return;

        if (!res.ok) {
          const kind = json.errorKind ?? null;
          const message =
            json.error ??
            (kind === 'openai_quota_billing'
              ? 'Extraction could not run because the OpenAI API project has no available quota or billing is not active.'
              : 'Extraction could not run.');
          setFailureKind(kind);
          setError(message);
          setExtraction(emptyExtractionPayload());
          setPhase('failed');
          return;
        }

        if (!json?.extraction) throw new Error('Extractor returned no data.');

        setExtraction(json.extraction as ExtractionPayload);
        setFailureKind(null);
        setPhase('parsed');
      } catch (e) {
        if (cancelled) return;
        setFailureKind('client_error');
        setError(e instanceof Error ? e.message : 'Extraction failed.');
        setExtraction(emptyExtractionPayload());
        setPhase('failed');
      } finally {
        if (!cancelled) setRetryBusy(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [assetIds, cardId, runId]);

  return (
    <div className="min-h-[200px]">
      {phase === 'extracting' ? <ExtractionProgressView assets={assets} /> : null}

      {phase === 'failed' && error ? (
        <ExtractionFailurePanel
          error={error}
          failureKind={failureKind}
          cardId={cardId}
          retrying={retryBusy}
          onRetry={() => {
            setRetryBusy(true);
            setRunId((n) => n + 1);
          }}
          onManualEntry={() => setPhase('manual_entry')}
        />
      ) : null}

      {(phase === 'parsed' || phase === 'manual_entry') && (
        <div className="ingest-fade-in pt-2">
          <ExtractionReviewForm
            cardId={cardId}
            assets={assets}
            extraction={extraction}
            extractionStatus={phase === 'parsed' ? 'parsed' : 'failed'}
            extractionFailureKind={failureKind}
            entryMode={phase === 'manual_entry' ? 'manual' : 'normal'}
          />
        </div>
      )}
    </div>
  );
}
