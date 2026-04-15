'use client';

import { cn } from '@/components/ui/cn';

export function CardPackHero({ className }: { className?: string }) {
  return (
    <div className={cn('relative mx-auto w-full max-w-[340px]', className)}>
      <div className="intro-pack-float relative mx-auto h-[320px] w-[240px] [perspective:900px] sm:h-[360px] sm:w-[270px]">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute -inset-10 rounded-[36px] bg-[radial-gradient(closest-side,hsl(156_72%_42%_/0.14),transparent_70%)] blur-2xl" />

        {/* Main pack */}
        <div className="intro-pack-rotate absolute inset-0">
          <div className="absolute inset-0 rounded-[30px] border border-border/80 bg-bg-elevated/45 shadow-[0_18px_70px_rgba(0,0,0,0.65)]" />
          <div className="absolute inset-0 rounded-[30px] bg-[radial-gradient(circle_at_20%_10%,hsl(156_72%_42%_/0.14),transparent_55%)]" />
          <div className="absolute inset-x-0 top-0 h-16 rounded-t-[30px] bg-[linear-gradient(180deg,hsl(210_40%_98%_/0.05),transparent)]" />

          {/* Quiet label strip */}
          <div className="absolute left-6 right-6 top-9 h-10 rounded-2xl border border-border/55 bg-bg-muted/25" />
          <div className="absolute left-9 top-[46px] text-[10px] font-semibold uppercase tracking-[0.28em] text-fg-muted">
            Bernie vault
          </div>

          {/* Single center mark (less busy than text + emblem combo) */}
          <div className="absolute left-1/2 top-[148px] h-24 w-24 -translate-x-1/2 rounded-[26px] border border-border/55 bg-bg-muted/20 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]" />

          {/* Footer foil */}
          <div className="absolute bottom-0 left-0 right-0 h-20 rounded-b-[30px] bg-[linear-gradient(0deg,hsl(222_28%_8%_/0.75),transparent)]" />
        </div>
      </div>
    </div>
  );
}

