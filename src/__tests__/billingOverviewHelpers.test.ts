import { describe, expect, it } from 'vitest';
import { availableCredits, daysUntil, mayAskForMoreTime, mayPreviewUpgrade, renewalNotice } from '../components/billing/billingOverviewHelpers';
import type { SubscriptionRenewalResponse } from '../lib/billing/types';

const time = Date.parse('2030-10-01T00:00:00.000Z');
function status(endsAt: string, overrides: {
  eligible?: boolean; planId?: string; restrictionDeadline?: string | null;
  accessState?: string; graceStatus?: string | null; graceUntil?: string | null;
  pending?: boolean;
} = {}): SubscriptionRenewalResponse {
  return {
    subscription: {
      lifecycleStatus: 'active', accessState: overrides.accessState ?? 'operational',
      planId: overrides.planId ?? 'starter', planVersion: 1, version: 1,
      restrictionDeadline: overrides.restrictionDeadline ?? null,
    },
    period: { periodId: 'p1', status: 'active', startsAt: '2030-09-01T00:00:00Z', endsAt,
      renewalEligible: overrides.eligible ?? true, overdue: false },
    quote: overrides.pending ? { pendingPayment: true } as SubscriptionRenewalResponse['quote'] : null,
    payment: { submissionEnabled: true, purpose: 'subscription', submissionPath: '/api/billing/payments' },
    graceRequest: overrides.graceStatus ? {
      id: 'grace', periodId: 'p1', status: overrides.graceStatus,
      requestedUntil: '2030-10-05T00:00:00Z', grantedUntil: overrides.graceUntil ?? null, version: 1,
    } : null,
  };
}

describe('billing overview lifecycle rules', () => {
  it('allows renewal only in the last seven days if the backend also allows it', () => {
    expect(renewalNotice(status('2030-10-15T00:00:00Z'), time, false).canRenew).toBe(false);
    expect(renewalNotice(status('2030-10-08T00:00:00Z'), time, false).canRenew).toBe(true);
    expect(renewalNotice(status('2030-10-03T00:00:00Z', { eligible: false }), time, false).canRenew).toBe(false);
    expect(renewalNotice(status('2030-10-03T00:00:00Z'), time, true).canRenew).toBe(false);
    expect(renewalNotice(status('2030-10-03T00:00:00Z', { pending: true }), time, false).canRenew).toBe(false);
  });

  it('counts the remaining approved grace days without inventing a grace period', () => {
    const approved = renewalNotice(status('2030-09-30T00:00:00Z', {
      graceStatus: 'approved', graceUntil: '2030-10-04T00:00:00Z',
    }), time, false);
    expect(approved.inGrace).toBe(true);
    expect(approved.graceDays).toBe(3);
    expect(approved.canRenew).toBe(true);

    const expired = renewalNotice(status('2030-09-30T00:00:00Z'), time, false);
    expect(expired.expired).toBe(true);
    expect(expired.inGrace).toBe(false);
    expect(expired.canRenew).toBe(false);
    expect(daysUntil(null, time)).toBe(null);
  });

  it('does not present manual or security suspensions as a billing grace period', () => {
    const result = renewalNotice(status('2030-09-30T00:00:00Z', {
      restrictionDeadline: '2030-10-05T00:00:00Z', accessState: 'security_suspended',
    }), time, false);
    expect(result.inGrace).toBe(false);
    expect(result.canRenew).toBe(false);
  });

  it('totals credits by kind with integer arithmetic and avoids rounding ledger amounts', () => {
    const amt = (units: string) => ({ asset: 'INR', units, scale: 2 });
    const balances = [
      { kind: 'subscription' as const, available: amt('900719925474099301'), held: amt('0'), expiresAt: null },
      { kind: 'subscription' as const, available: amt('199'), held: amt('0'), expiresAt: null },
      { kind: 'topup' as const, available: amt('5000'), held: amt('0'), expiresAt: null },
    ];
    expect(availableCredits(balances, 'subscription')).toBe('₹9,00,71,99,25,47,40,995.00');
    expect(availableCredits(balances, 'topup')).toBe('₹50.00');
    expect(availableCredits([], 'topup')).toBe('₹0.00');
  });

  it('only offers an unpaid grace request during the final seven days or existing valid grace', () => {
    const eligible = { eligibility: { requestEligible: true }, items: [] } as unknown as import('../lib/billing/types').SubscriptionGraceResponse;
    const ineligible = { eligibility: { requestEligible: false }, items: [] } as unknown as import('../lib/billing/types').SubscriptionGraceResponse;
    expect(mayAskForMoreTime(status('2030-10-11T00:00:00Z'), eligible, time, false)).toBe(false);
    expect(mayAskForMoreTime(status('2030-10-07T00:00:00Z'), eligible, time, false)).toBe(true);
    expect(mayAskForMoreTime(status('2030-10-07T00:00:00Z'), ineligible, time, false)).toBe(false);
    expect(mayAskForMoreTime(status('2030-10-07T00:00:00Z'), eligible, time, true)).toBe(false);
    expect(mayAskForMoreTime(status('2030-10-07T00:00:00Z', { pending: true }), eligible, time, false)).toBe(false);
    expect(mayAskForMoreTime(status('2030-09-30T00:00:00Z', { graceStatus: 'approved', graceUntil: '2030-10-04T00:00:00Z' }), eligible, time, false)).toBe(true);
    expect(mayAskForMoreTime(status('2030-09-30T00:00:00Z'), eligible, time, false)).toBe(false);
    expect(mayAskForMoreTime(status('2030-10-07T00:00:00Z', { accessState: 'manual_suspended' }), eligible, time, false)).toBe(false);
  });

  it('offers upgrade preview only for recognizable lower tiers', () => {
    expect(mayPreviewUpgrade('starter')).toBe(true);
    expect(mayPreviewUpgrade('growth')).toBe(true);
    expect(mayPreviewUpgrade('enterprise')).toBe(false);
    expect(mayPreviewUpgrade('premium')).toBe(false);
    expect(mayPreviewUpgrade(null)).toBe(false);
  });
});
