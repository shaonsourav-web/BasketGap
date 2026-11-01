const MONEY = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  minimumFractionDigits: 2,
});

export function money(value: number): string {
  return MONEY.format(value);
}

/** "6:15 am" — lowercase meridiem, the way a price ticket would read it. */
export function timeOfDay(date: Date): string {
  return new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(date)
    .replace(/\s?(AM|PM)/i, (_, meridiem: string) => ` ${meridiem.toLowerCase()}`);
}

export function freshness(pricedAt: Date, now: Date = new Date()): string {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const day = pricedAt.getTime() >= startOfToday.getTime() ? 'today' : 'yesterday';
  return `Prices as of ${timeOfDay(pricedAt)} ${day}`;
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function retailerName(retailer: 'coles' | 'woolworths'): string {
  return retailer === 'coles' ? 'Coles' : 'Woolworths';
}
