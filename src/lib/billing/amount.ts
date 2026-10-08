import type { BillingAmount } from './types';

/** Format integer-unit amounts without converting financial values to Number. */
export function formatBillingAmount(amount: BillingAmount, locale = 'en-IN'): string {
  if (!amount || !/^[A-Z]{3}$/.test(amount.asset) || !/^-?\d+$/.test(amount.units)
    || !Number.isInteger(amount.scale) || amount.scale < 0 || amount.scale > 9) {
    throw new TypeError('Billing amount must contain an ISO currency, integer units and a scale from 0 to 9.');
  }
  const units = BigInt(amount.units);
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const factor = 10n ** BigInt(amount.scale);
  const whole = absolute / factor;
  const fraction = amount.scale ? (absolute % factor).toString().padStart(amount.scale, '0') : '';
  const grouped = new Intl.NumberFormat(locale, { useGrouping: true, maximumFractionDigits: 0 }).format(whole);
  const decimal = amount.scale ? new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === 'decimal')?.value || '.' : '';
  const sign = negative ? '-' : '';
  return `${amount.asset} ${sign}${grouped}${fraction ? `${decimal}${fraction}` : ''}`;
}
