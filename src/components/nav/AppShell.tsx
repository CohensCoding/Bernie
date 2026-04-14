import Link from 'next/link';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/portfolio', label: 'Portfolio' },
];

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
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-accent/15 ring-1 ring-accent/30" />
            <div>
              <div className="text-sm font-semibold tracking-wide text-fg">{title}</div>
              <div className="text-xs text-fg-muted">Sports card portfolio</div>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl px-3 py-2 text-sm text-fg-muted hover:text-fg hover:bg-bg-elevated/60"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/ingest/new"
              className="ml-2 rounded-xl bg-accent/20 px-3 py-2 text-sm text-fg ring-1 ring-accent/30 hover:bg-accent/25"
            >
              Add Card
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

