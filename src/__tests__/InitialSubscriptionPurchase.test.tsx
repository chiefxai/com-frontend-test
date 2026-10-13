import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import InitialSubscriptionPurchase from '../components/billing/InitialSubscriptionPurchase';
import { BillingApiError } from '../lib/billing/client';

const mocks = vi.hoisted(() => ({
  purchase: vi.fn(), provision: vi.fn(), submit: vi.fn(), can: vi.fn(() => true),
  nextKey: 0,
}));
vi.mock('../lib/authorization', () => ({ useAuthorization: () => ({ can: mocks.can, authorization: { organizationRole: 'Organization Admin' } }) }));
vi.mock('../lib/billing/client', () => ({
  billingClient: {
    subscriptionPurchase: mocks.purchase,
    provisionInitialSubscriptionQuote: mocks.provision,
    submitPaymentWithProof: mocks.submit,
  },
  BillingApiError: class BillingApiError extends Error { status: number; constructor(message: string, options: { status: number }) { super(message); this.status = options.status; } },
  newBillingIdempotencyKey: () => `test-key-${++mocks.nextKey}`,
}));

const amount = { asset: 'INR', units: '325000', scale: 2 };
const quote = (overrides: Record<string, unknown> = {}) => ({
  quoteId: 'quote-1', purpose: 'purchase', status: 'draft', version: 1,
  plan: { id: 'enterprise', version: 2, terms: {} }, inventory: { workspaces: 1 },
  lines: [{ code: 'base', label: 'Subscription fee', quantity: 1, unitAmount: amount, amount }],
  subtotal: amount, discounts: { asset: 'INR', units: '0', scale: 2 },
  totalTax: { asset: 'INR', units: '0', scale: 2 }, paymentAmount: amount,
  includedCredits: { asset: 'INR', units: '400000', scale: 2 },
  createdAt: '2026-10-01T00:00:00.000Z', validUntil: '2026-10-15T00:00:00.000Z', expired: false, payable: true,
  ...overrides,
});
const response = (q: ReturnType<typeof quote> | null, enabled = true) => ({
  subscription: { lifecycleStatus: 'onboarding', accessState: 'billing_recovery', planId: 'enterprise', planVersion: 2 },
  quote: q, payment: { submissionEnabled: enabled, purpose: 'subscription', submissionPath: '/api/billing/payments' },
});
const notFound = () => new BillingApiError('Initial subscription onboarding was not found.', { status: 404 });

beforeEach(() => {
  vi.clearAllMocks(); mocks.nextKey = 0; mocks.can.mockReturnValue(true);
  mocks.purchase.mockResolvedValue(response(quote()));
  mocks.provision.mockResolvedValue(response(quote()));
  mocks.submit.mockResolvedValue({ id: 'payment-1', status: 'pending_verification' });
});
afterEach(cleanup);

describe('initial subscription purchase', () => {
  it('shows fee and included credits separately and submits the exact quote using payment API only when enabled', async () => {
    render(<InitialSubscriptionPurchase canSubmit />);
    await screen.findByText('Your enterprise plan');
    expect(screen.getAllByText('₹3,250.00').length).toBeGreaterThan(0);
    expect(screen.getByText('₹4,000.00')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Bank or UPI payment reference'), { target: { value: 'UTR-123' } });
    const proof = new File(['%PDF-test'], 'receipt.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/Payment receipt/), { target: { files: [proof] } });
    fireEvent.submit(screen.getByRole('button', { name: 'Send receipt for review' }).closest('form')!);
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith({
      schemaVersion: 1, purpose: 'subscription', quoteId: 'quote-1', expectedAmount: amount, paymentReference: 'UTR-123',
    }, proof, expect.objectContaining({ idempotencyKey: expect.any(String) })));
    expect(await screen.findByText(/We received your payment receipt/)).toBeInTheDocument();
  });

  it('offers initial quote provisioning when onboarding quote is absent', async () => {
    mocks.purchase.mockRejectedValue(notFound());
    render(<InitialSubscriptionPurchase canSubmit />);
    fireEvent.click(await screen.findByRole('button', { name: 'Show my starting price' }));
    await waitFor(() => expect(mocks.provision).toHaveBeenCalledWith({ idempotencyKey: expect.any(String) }));
    expect(await screen.findByText('Your enterprise plan')).toBeInTheDocument();
  });

  it('offers requoting on expired quote and never exposes payment submission for expired terms', async () => {
    mocks.purchase.mockResolvedValue(response(quote({ expired: true, payable: false })));
    render(<InitialSubscriptionPurchase canSubmit />);
    await screen.findByText('Your enterprise plan');
    expect(screen.queryByRole('button', { name: 'Send receipt for review' })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Get a new price' }));
    await waitFor(() => expect(mocks.provision).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Send receipt for review' })).toBeInTheDocument();
  });

  it('blocks submission when the backend has not enabled payment intake', async () => {
    mocks.purchase.mockResolvedValue(response(quote(), false));
    render(<InitialSubscriptionPurchase canSubmit />);
    await screen.findByText(/Sending receipts is not available right now/);
    expect(screen.queryByRole('button', { name: 'Send receipt for review' })).not.toBeInTheDocument();
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});
