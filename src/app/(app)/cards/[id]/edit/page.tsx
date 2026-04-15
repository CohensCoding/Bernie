import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CardEditForm } from '@/components/cards/CardEditForm';
import { getCardDetail } from '@/lib/db/cards';

export const dynamic = 'force-dynamic';

export default async function CardEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let detail: Awaited<ReturnType<typeof getCardDetail>> | null = null;
  try {
    detail = await getCardDetail(id);
  } catch {
    detail = null;
  }
  if (!detail) notFound();

  const latestTx = detail.transactions[0] ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="text-xs text-fg-muted">
        <Link href="/cards" className="hover:text-fg">
          Cards
        </Link>
        <span className="mx-2">/</span>
        <Link href={`/cards/${id}`} className="hover:text-fg">
          Card
        </Link>
        <span className="mx-2">/</span>
        <span className="text-fg">Edit</span>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Edit card</h1>
        <p className="mt-1 text-sm text-fg-muted">Structured fields and the latest purchase row.</p>
      </div>
      <CardEditForm card={detail.card} latestTransaction={latestTx} />
    </div>
  );
}
