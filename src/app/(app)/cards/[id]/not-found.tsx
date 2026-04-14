import Link from 'next/link';
import { Card, CardHeader } from '@/components/ui/Card';

export default function NotFound() {
  return (
    <div className="space-y-8">
      <div>
        <div className="text-2xl font-semibold tracking-tight text-fg">Card not found</div>
        <div className="mt-2 text-sm text-fg-muted">This card ID doesn’t exist in your portfolio.</div>
      </div>

      <Card>
        <CardHeader title="Try again" subtitle="Go back to your portfolio" />
        <div className="mt-4">
          <Link
            href="/portfolio"
            className="inline-flex items-center rounded-xl border border-border bg-bg-muted px-3 py-2 text-sm text-fg hover:bg-bg-elevated/60"
          >
            Back to Portfolio
          </Link>
        </div>
      </Card>
    </div>
  );
}

