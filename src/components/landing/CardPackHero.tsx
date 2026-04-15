'use client';

import { cn } from '@/components/ui/cn';

export function CardPackHero({ className }: { className?: string }) {
  return (
    <div className={cn('relative mx-auto w-full max-w-[340px]', className)}>
      <div className="intro-pack-float relative mx-auto h-[320px] w-[240px] [perspective:900px] sm:h-[360px] sm:w-[270px]">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute -inset-10 rounded-[36px] bg-[radial-gradient(closest-side,hsl(156_72%_42%_/0.18),transparent_65%)] blur-2xl" />

        {/* Back cards */}
        <div className="intro-pack-rotate absolute inset-0">
          <div className="absolute left-2 top-5 h-[290px] w-[220px] rotate-[-10deg] rounded-[26px] border border-border/70 bg-bg-elevated/30 shadow-[0_12px_50px_rgba(0,0,0,0.55)]" />
          <div className="absolute right-1 top-8 h-[290px] w-[220px] rotate-[8deg] rounded-[26px] border border-border/70 bg-bg-elevated/30 shadow-[0_12px_50px_rgba(0,0,0,0.55)]" />
        </div>

        {/* Main pack */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 rounded-[30px] border border-border/80 bg-bg-elevated/50 shadow-[0_18px_70px_rgba(0,0,0,0.65)]" />
          <div className="absolute inset-0 rounded-[30px] bg-[linear-gradient(135deg,hsl(156_72%_42%_/0.16),transparent_55%)]" />
          <div className="absolute inset-x-0 top-0 h-16 rounded-t-[30px] bg-[linear-gradient(180deg,hsl(210_40%_98%_/0.06),transparent)]" />

          {/* Pack stripe */}
          <div className="absolute left-5 top-8 right-5 h-12 rounded-2xl border border-border/60 bg-bg-muted/35" />
          <div className="absolute left-8 top-[46px] text-[10px] font-semibold uppercase tracking-[0.3em] text-fg-muted">
            Bernie
          </div>
          <div className="absolute left-8 top-[66px] text-xs font-medium text-fg">Personal collection</div>

          {/* Subtle emblem */}
          <div className="absolute left-1/2 top-[140px] h-28 w-28 -translate-x-1/2 rounded-[28px] border border-border/60 bg-bg-muted/25 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]" />
          <div className="absolute left-1/2 top-[162px] -translate-x-1/2 text-[11px] font-semibold uppercase tracking-[0.22em] text-fg-muted">
            Open
          </div>

          {/* Footer foil */}
          <div className="absolute bottom-0 left-0 right-0 h-24 rounded-b-[30px] bg-[linear-gradient(0deg,hsl(222_28%_8%_/0.75),transparent)]" />
          <div className="absolute bottom-6 left-8 text-xs text-fg-muted">
            Premium vault access
          </div>
          <div className="absolute bottom-6 right-8 text-xs font-medium text-accent/90">
            · · ·
          </div>
        </div>
      </div>
    </div>
  );
}

