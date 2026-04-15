import Link from 'next/link';
import { NavLinks } from '@/components/nav/NavLinks';
import { BernieLogoMark } from '@/components/brand/BernieLogo';

export function AppShell({
  title = 'Bernie',
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen overflow-x-clip">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-4">
          <Link
            href="/dashboard"
            className="group flex items-center gap-3 self-start rounded-xl px-2 py-1 transition hover:bg-bg-elevated/50 focus:outline-none focus:ring-2 focus:ring-accent/25 sm:self-auto"
            aria-label="Go to dashboard"
          >
            <div className="relative">
              <BernieLogoMark className="h-9 w-9" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-wide text-fg">{title}</div>
              <div className="hidden text-xs text-fg-muted sm:block">Sports card portfolio</div>
            </div>
          </Link>
          <NavLinks />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}

