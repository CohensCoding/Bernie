import { cn } from '@/components/ui/cn';

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-bg-elevated/70 backdrop-blur px-5 py-4 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-medium text-fg">{title}</div>
        {subtitle ? <div className="mt-1 text-xs text-fg-muted">{subtitle}</div> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

