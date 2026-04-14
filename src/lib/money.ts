export function formatUsdFromCents(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(dollars);
}

export function formatUsdCompactFromCents(cents: number): string {
  return formatUsdCompact(cents / 100);
}

// Deterministic compact USD formatting (SSR/client stable).
// Examples:
//  - 950  -> "$950"
//  - 1000 -> "$1K"
//  - 1250 -> "$1.3K"
//  - 12031 -> "$12K"
export function formatUsdCompact(dollars: number): string {
  if (!Number.isFinite(dollars)) return '$0';

  const sign = dollars < 0 ? '-' : '';
  const abs = Math.abs(dollars);

  const roundTo = (n: number, digits: number) => {
    const p = 10 ** digits;
    return Math.round(n * p) / p;
  };

  const withSuffix = (value: number, suffix: string) => {
    // Use 0 decimals when >= 10, else 1 decimal. Trim trailing .0
    const digits = value >= 10 ? 0 : 1;
    const v = roundTo(value, digits);
    const s = digits === 0 ? String(Math.round(v)) : String(v);
    const trimmed = s.endsWith('.0') ? s.slice(0, -2) : s;
    return `${sign}$${trimmed}${suffix}`;
  };

  if (abs < 1000) {
    // Show whole dollars for compact labels
    return `${sign}$${Math.round(abs)}`;
  }
  if (abs < 1_000_000) return withSuffix(abs / 1000, 'K');
  if (abs < 1_000_000_000) return withSuffix(abs / 1_000_000, 'M');
  return withSuffix(abs / 1_000_000_000, 'B');
}

