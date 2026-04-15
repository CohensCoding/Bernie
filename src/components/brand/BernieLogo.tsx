import { cn } from '@/components/ui/cn';

export function BernieLogoMark({
  className,
  title = 'Bernie',
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      className={cn('h-9 w-9', className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="bernieShield" x1="14" y1="10" x2="50" y2="54" gradientUnits="userSpaceOnUse">
          <stop stopColor="hsl(156 72% 42% / 0.9)" />
          <stop offset="1" stopColor="hsl(156 72% 42% / 0.15)" />
        </linearGradient>
        <linearGradient id="bernieGlow" x1="10" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="hsl(156 72% 50% / 0.55)" />
          <stop offset="1" stopColor="hsl(156 72% 50% / 0)" />
        </linearGradient>
      </defs>

      {/* Outer glow */}
      <path
        d="M32 6c9.8 0 18 3.3 22 6.3v19.1c0 12.5-7.4 22.8-22 28.9C17.4 54.2 10 43.9 10 31.4V12.3C14 9.3 22.2 6 32 6Z"
        fill="url(#bernieGlow)"
      />

      {/* Shield */}
      <path
        d="M32 8c9.1 0 16.7 3 20.2 5.6v17.8c0 11.6-6.8 21-20.2 26.7C18.6 52.4 11.8 43 11.8 31.4V13.6C15.3 11 22.9 8 32 8Z"
        fill="hsl(222 28% 10%)"
        stroke="hsl(217 19% 24% / 0.9)"
        strokeWidth="1.2"
      />
      <path
        d="M32 10.5c8.3 0 15.1 2.6 18.1 4.9v16c0 10.4-6.1 18.8-18.1 24c-12-5.2-18.1-13.6-18.1-24v-16c3-2.3 9.8-4.9 18.1-4.9Z"
        fill="url(#bernieShield)"
        opacity="0.9"
      />

      {/* Card stack hint */}
      <g opacity="0.95" stroke="hsl(210 40% 98% / 0.75)" strokeWidth="1.2" strokeLinejoin="round">
        <path d="M21.5 26.5h21v17h-21z" />
        <path d="M24.5 23.8h21v17h-2.6" opacity="0.55" />
      </g>

      {/* Ball seams (subtle multi-sport cue) */}
      <g opacity="0.55" stroke="hsl(210 40% 98% / 0.55)" strokeWidth="1.1" strokeLinecap="round">
        <path d="M28 30c2.2 1.7 5 1.7 7.9 0" />
        <path d="M28 39c2.2 1.7 5 1.7 7.9 0" />
      </g>
    </svg>
  );
}

