import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SubscriptionRenewal from '../components/billing/SubscriptionRenewal';

const mocks = vi.hoisted(() => ({ renewal: vi.fn(), createQuote: vi.fn(), submit: vi.fn(), can: vi.fn(() => true), nextKey: 0 }));
vi.mock('../lib/authorization', () => ({ useAuthorization: () => ({ can: mocks.can, authorization: { organizationRole: 'Organization Admin' } }) }));
vi.mock('../lib/billing/client', () => ({
  billingClient: { subscriptionRenewal: mocks.renewal, createSubscriptionRenewalQuote: mocks.createQuote, submitPaymentWithProof: mocks.submit },
  BillingApiError: class BillingApiError extends Error { status: number; constructor(message: string, options: { status: number }) { super(message); this.status = options.status; } },
  newBillingIdempotencyKey: () => `renewal-key-${++mocks.nextKey}`,
}));

const amount = { asset: 'INR', units: '100000', scale: 2 };
const quote = (overrides: Record<string, unknown> = {}) => ({ quoteId: 'renewal-1', purpose: 'renewal', status: 'draft', version: 1,
  plan: { id: 'growth', version: 1, terms: {} }, inventory: {}, lines: [{ code: 'base', label: 'Plan renewal', quantity: 1, unitAmount: amount, amount }],
  subtotal: amount, discounts: { asset: 'INR', units: '0', scale: 2 }, totalTax: { asset: 'INR', units: '0', scale: 2 },
  paymentAmount: amount, includedCredits: { asset: 'INR', units: '250000', scale: 2 }, createdAt: '2026-10-01T00:00:00Z',
  validUntil: '2026-10-10T00:00:00Z', expired: false, pendingPayment: false, payable: true, ...overrides });
const response = (options: { eligible?: boolean; overdue?: boolean; q?: ReturnType<typeof quote> | null; enabled?: boolean } = {}) => ({
  subscription: { lifecycleStatus: 'active', accessState: 'operational', planId: 'growth', planVersion: 1, version: 3, restrictionDeadline: null },
  period: { periodId: 'period-1', status: 'active', startsAt: '2026-09-01T00:00:00Z', endsAt: '2026-10-01T00:00:00Z', renewalEligible: options.eligible ?? true, overdue: options.overdue ?? false },
  quote: options.q === undefined ? null : options.q,
  payment: { submissionEnabled: options.enabled ?? true, purpose: 'subscription', submissionPath: '/api/billing/payments' },
});
beforeEach(() => { vi.clearAllMocks(); mocks.nextKey = 0; mocks.can.mockReturnValue(true); mocks.renewal.mockResolvedValue(response()); mocks.createQuote.mockResolvedValue(response({ q: quote() })); mocks.submit.mockResolvedValue({ id: 'payment-1' }); });
afterEach(cleanup);

describe('organization subscription renewal', () => {
  it('uses server renewal eligibility and keeps quote creation unavailable before the renewal window', async () => {
    mocks.renewal.mockResolvedValue(response({ eligible: false }));
    render(<SubscriptionRenewal canSubmit />);
    await screen.findByText(/Current paid period:/);
    expect(screen.queryByRole('button', { name: 'Prepare renewal quote' })).not.toBeInTheDocument();
    expect(mocks.createQuote).not.toHaveBeenCalled();
  });

  it('offers overdue renewal and submits proof with the quoted amount through existing payment API', async () => {
    mocks.renewal.mockResolvedValue(response({ eligible: true, overdue: true }));
    mocks.createQuote.mockResolvedValue(response({ eligible: true, overdue: true, q: quote() }));
    render(<SubscriptionRenewal canSubmit />);
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare renewal quote' }));
    await screen.findByText('Renewal quote · draft');
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Bank or UPI transaction reference'), { target: { value: 'UTR-RENEW-1' } });
    const proof = new File(['%PDF'], 'receipt.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/Payment receipt/), { target: { files: [proof] } });
    fireEvent.submit(screen.getByRole('button', { name: 'Submit for verification' }).closest('form')!);
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith({ schemaVersion: 1, purpose: 'subscription', quoteId: 'renewal-1', expectedAmount: amount, paymentReference: 'UTR-RENEW-1' }, proof, expect.objectContaining({ idempotencyKey: expect.any(String) })));
  });

  it('does not submit a renewal quote while an earlier payment is pending review', async () => {
    mocks.renewal.mockResolvedValue(response({ eligible: true, q: quote({ pendingPayment: true, payable: false }) }));
    render(<SubscriptionRenewal canSubmit />);
    await screen.findByText(/A renewal payment is already awaiting platform review/);
    expect(screen.queryByRole('button', { name: 'Submit for verification' })).not.toBeInTheDocument();
  });

  it('does not show payment proof form when platform payment intake is disabled', async () => {
    mocks.renewal.mockResolvedValue(response({ q: quote(), enabled: false }));
    render(<SubscriptionRenewal canSubmit />);
    await screen.findByText(/Payment submission is not enabled yet/);
    expect(screen.queryByRole('button', { name: 'Submit for verification' })).not.toBeInTheDocument();
  });
});
