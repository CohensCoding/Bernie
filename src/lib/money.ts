export function formatUsdFromCents(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(dollars);
}

