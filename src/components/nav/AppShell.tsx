import Link from 'next/link';
import { NavLinks } from '@/components/nav/NavLinks';

export function AppShell({
  title = 'Bernie',
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link
            href="/dashboard"
            className="group flex items-center gap-3 rounded-xl px-2 py-1 transition hover:bg-bg-elevated/50 focus:outline-none focus:ring-2 focus:ring-accent/25"
            aria-label="Go to dashboard"
          >
            <div className="h-9 w-9 rounded-xl bg-accent/15 ring-1 ring-accent/30 transition group-hover:bg-accent/20 group-hover:ring-accent/40" />
            <div>
              <div className="text-sm font-semibold tracking-wide text-fg">{title}</div>
              <div className="text-xs text-fg-muted">Sports card portfolio</div>
            </div>
          </Link>
          <NavLinks />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

