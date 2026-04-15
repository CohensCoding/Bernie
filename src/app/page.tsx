'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BernieLogoMark } from '@/components/brand/BernieLogo';
import { CardPackHero } from '@/components/landing/CardPackHero';

export default function Home() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <div className="min-h-screen overflow-x-clip bg-bg">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 pb-10 pt-10 sm:px-6 sm:pt-14">
        <div className="flex items-center gap-3">
          <BernieLogoMark className="h-10 w-10" />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-wide text-fg">Bernie</div>
            <div className="text-xs text-fg-muted">Personal vault</div>
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
          <div className="space-y-3">
            <div className="text-xs font-medium uppercase tracking-[0.25em] text-fg-muted">Hey Jake</div>
            <div className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
              Welcome to your card collection
            </div>
            <div className="mx-auto max-w-sm text-sm leading-relaxed text-fg-muted">
              Let’s see how things are doing today.
            </div>
          </div>

          <CardPackHero />

          <div className="flex w-full max-w-sm flex-col gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                router.push('/dashboard');
              }}
              className="h-12 w-full rounded-2xl bg-accent px-5 text-sm font-semibold text-accent-fg shadow-[0_10px_40px_rgba(0,0,0,0.45)] transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-accent/35 disabled:opacity-70"
            >
              {busy ? 'Opening…' : 'Let’s dive in'}
            </button>
            <div className="text-xs text-fg-muted">This is your private beta vault.</div>
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

