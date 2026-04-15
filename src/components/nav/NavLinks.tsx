'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/components/ui/cn';

const TABS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/cards', label: 'Cards' },
  { href: '/portfolio', label: 'Portfolio' },
];

function isActive(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/';
  if (href === '/cards') return pathname === '/cards' || pathname.startsWith('/cards/');
  if (href === '/portfolio') return pathname === '/portfolio';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks() {
  const pathname = usePathname() ?? '';

  return (
    <nav className="flex items-center gap-1">
      {TABS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'rounded-xl px-3 py-2 text-sm font-medium transition',
              active
                ? 'bg-bg-elevated text-fg ring-1 ring-border shadow-sm'
                : 'text-fg-muted hover:bg-bg-elevated/60 hover:text-fg',
            )}
          >
            {item.label}
          </Link>
        );
      })}
      <Link
        href="/ingest/new"
        className={cn(
          'ml-2 rounded-xl border border-border/90 bg-transparent px-3 py-2 text-sm font-medium text-fg-muted transition hover:border-accent/30 hover:bg-bg-elevated/40 hover:text-fg',
          pathname.startsWith('/ingest') && 'border-accent/35 bg-accent/10 text-fg ring-1 ring-accent/20',
        )}
      >
        Add Card
      </Link>
    </nav>
  );
}
