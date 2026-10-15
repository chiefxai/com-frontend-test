import type { BillingAmount, CreditBalance, SubscriptionGraceResponse, SubscriptionRenewalResponse } from '../../lib/billing/types';

const dayMs = 24 * 60 * 60 * 1000;

export function daysUntil(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const end = Date.parse(iso);
  return Number.isFinite(end) ? Math.max(0, Math.ceil((end - nowMs) / dayMs)) : null;
}

export function displayDate(iso: string | null | undefined): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) return 'Not available';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
}

/** Sum only like-for-like ledger amounts, never converting monetary ledger integers to Number. */
export function availableCredits(balances: CreditBalance[], kind: CreditBalance['kind']): string {
  const relevant = balances.filter(row => row.kind === kind);
  if (!relevant.length) return '₹0.00';
  const groups = new Map<string, { asset: string; scale: number; units: bigint }>();
  for (const row of relevant) {
    const { asset, scale, units } = row.available;
    if (!Number.isSafeInteger(scale) || scale < 0 || scale > 18 || !/^-?\d+$/.test(units)) return 'Unavailable';
    const key = `${asset}:${scale}`;
    const group = groups.get(key) || { asset, scale, units: 0n };
    group.units += BigInt(units);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ asset, scale, units }) => {
    const divisor = 10n ** BigInt(scale);
    const abs = units < 0n ? -units : units;
    const integer = (abs / divisor).toLocaleString('en-IN');
    return `${units < 0n ? '-' : ''}${asset === 'INR' ? '₹' : asset + ' '}${integer}${scale ? '.' + (abs % divisor).toString().padStart(scale, '0') : ''}`;
  }).join(' + ');
}

export function displayBillingAmount(amount: BillingAmount | null | undefined): string {
  return amount ? availableCredits([{ kind: 'subscription', available: amount, held: amount, expiresAt: null }], 'subscription') : '—';
}

/** The API controls renewal eligibility; dates only narrow down when we advertise it. */
export function renewalNotice(
  response: SubscriptionRenewalResponse | null,
  nowMs: number,
  nextPeriodScheduled: boolean,
) {
  const period = response?.period;
  const endsAt = period?.endsAt || null;
  const until = daysUntil(endsAt, nowMs);
  const expired = Boolean(endsAt && Date.parse(endsAt) <= nowMs);
  const access = response?.subscription.accessState || '';
  const permittedBillingAccess = !['security_suspended', 'manual_suspended'].includes(access);
  const approvedGrace = response?.graceRequest?.status === 'approved'
    ? response.graceRequest.grantedUntil : null;
  const restrictionDeadline = response?.subscription.restrictionDeadline;
  // The billing restriction deadline can contain an automatically provided grace
  // window; never label security or manually suspended access as billing grace.
  const graceEnd = approvedGrace || (permittedBillingAccess && restrictionDeadline
    && (!endsAt || Date.parse(restrictionDeadline) > Date.parse(endsAt))
    ? restrictionDeadline : null);
  const inGrace = expired && permittedBillingAccess && Boolean(graceEnd && Date.parse(graceEnd) > nowMs);
  const graceDays = inGrace ? daysUntil(graceEnd, nowMs) : null;
  const canRenew = Boolean(response && period?.renewalEligible && !nextPeriodScheduled
    && !response.quote?.pendingPayment
    && permittedBillingAccess
    && (inGrace || (!expired && until !== null && until <= 7)));
  return { expired, daysLeft: until, inGrace, graceDays, graceEnd, canRenew,
    pendingPayment: Boolean(response?.quote?.pendingPayment), nextPeriodScheduled };
}

/** Only advertise a possible preview when a known entry plan is identifiable.
 *  Plan changes are never fulfilled by the current upgrade preview endpoint. */
export function mayPreviewUpgrade(planId: string | null | undefined): boolean {
  return /^(free|trial|starter|basic|standard|growth|professional|pro)(?:[-_].*)?$/i.test((planId || '').trim());
}

/** Offer a grace *request* only when payment is still due near the current
 * period deadline and the backend explicitly permits creating a request.
 * Approved, scheduled, paid, or already-pending renewals must not be prompted. */
export function mayAskForMoreTime(
  response: SubscriptionRenewalResponse | null,
  grace: SubscriptionGraceResponse | null,
  nowMs: number,
  nextPeriodScheduled: boolean,
): boolean {
  if (!response?.period || !grace?.eligibility?.requestEligible || nextPeriodScheduled) return false;
  const notice = renewalNotice(response, nowMs, nextPeriodScheduled);
  if (notice.pendingPayment || ['paid', 'scheduled', 'fulfilled'].includes((response.quote?.status || '').toLowerCase())) return false;
  if (['security_suspended', 'manual_suspended'].includes(response.subscription.accessState)) return false;
  return notice.inGrace || (!notice.expired && notice.daysLeft !== null && notice.daysLeft <= 7);
}
