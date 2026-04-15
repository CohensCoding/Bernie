'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/components/ui/cn';

const TABS = [
  { href: '/', label: 'Home' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/cards', label: 'Cards' },
  { href: '/portfolio', label: 'Portfolio' },
];

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  if (href === '/dashboard') return pathname === '/dashboard';
  if (href === '/cards') return pathname === '/cards' || pathname.startsWith('/cards/');
  if (href === '/portfolio') return pathname === '/portfolio';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks() {
  const pathname = usePathname() ?? '';

  return (
    <nav className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
      <div className="flex min-w-0 flex-1 overflow-hidden rounded-2xl border border-border/70 bg-bg-muted/30 p-0.5 sm:flex-none">
        {TABS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex-1 rounded-xl px-3 py-2 text-center text-sm font-medium transition sm:flex-none sm:text-left',
                active
                  ? 'bg-bg-elevated text-fg shadow-sm ring-1 ring-border/70'
                  : 'text-fg-muted hover:bg-bg-elevated/60 hover:text-fg',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
      <Link
        href="/ingest/new"
        className={cn(
          'shrink-0 rounded-2xl border border-border/80 bg-bg-muted/30 px-3 py-2 text-sm font-medium text-fg transition hover:bg-bg-elevated/40',
          pathname.startsWith('/ingest') && 'border-accent/35 bg-accent/10 ring-1 ring-accent/20',
        )}
        aria-label="Add Card"
      >
        <span className="sm:hidden">＋</span>
        <span className="hidden sm:inline">Add Card</span>
      </Link>
    </nav>
  );
}
