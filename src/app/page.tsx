'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BernieLogoMark } from '@/components/brand/BernieLogo';
import { CardPackHero } from '@/components/landing/CardPackHero';

const ENTERED_KEY = 'bernie.entered.v1';

export default function Home() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [reset, setReset] = useState(false);

  const entered = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(ENTERED_KEY) === '1';
  }, [ready]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const r = new URLSearchParams(window.location.search).get('reset') === '1';
    setReset(r);
    if (r) window.localStorage.removeItem(ENTERED_KEY);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!reset && entered) router.replace('/dashboard');
  }, [entered, ready, reset, router]);

  return (
    <div className="min-h-screen overflow-x-clip bg-bg">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 pb-10 pt-10 sm:px-6 sm:pt-14">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BernieLogoMark className="h-10 w-10" />
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-wide text-fg">Bernie</div>
              <div className="text-xs text-fg-muted">Personal card portfolio</div>
            </div>
          </div>
          <Link href="/dashboard" className="text-sm text-fg-muted transition hover:text-fg">
            Skip
          </Link>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
          <div className="space-y-3">
            <div className="text-xs font-medium uppercase tracking-[0.25em] text-fg-muted">Welcome Jake</div>
            <div className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Jake’s Card Collection</div>
            <div className="mx-auto max-w-sm text-sm leading-relaxed text-fg-muted">
              A calm, premium space to track what you own and what you’ve invested.
            </div>
          </div>

          <CardPackHero />

          <div className="flex w-full max-w-sm flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') window.localStorage.setItem(ENTERED_KEY, '1');
                router.push('/dashboard');
              }}
              className="h-12 w-full rounded-2xl bg-accent px-5 text-sm font-semibold text-accent-fg shadow-[0_10px_40px_rgba(0,0,0,0.45)] transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-accent/35"
            >
              Enter collection
            </button>
            <div className="text-xs text-fg-muted">
              Tip: add <span className="text-fg">`?reset=1`</span> to see this screen again.
            </div>
          </div>
        </div>

        <div className="mt-10 flex items-center justify-between text-xs text-fg-muted">
          <div>© {new Date().getFullYear()} Bernie</div>
          <div className="hidden sm:block">Vault mode</div>
        </div>
      </div>
    </div>
  );
}

