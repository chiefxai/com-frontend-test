import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import PaymentReviewsPage from '../admin/PaymentReviewsPage';

const mocks = vi.hoisted(() => ({ list: vi.fn(), decide: vi.fn(), receipt: vi.fn() }));
vi.mock('../lib/billing/platformDecision', () => ({
  listPlatformPaymentReviews: mocks.list,
  decidePlatformPayment: mocks.decide,
  platformPaymentReceipt: mocks.receipt,
  newBillingIdempotencyKey: () => 'payment-review-key',
}));
vi.mock('../lib/billing/client', () => ({ newBillingIdempotencyKey: () => 'payment-review-key' }));

const amount = { asset: 'INR', units: '150000', scale: 2 };
const payment = (subscriptionUpgrade?: Record<string, unknown>) => ({
  id: 'pay-1', orgId: 'org-1', purpose: 'subscription', status: 'pending_verification', version: 1,
  expectedAmount: amount, receivedAmount: null, paymentReference: 'UPGRADE-REF', proofAvailable: true,
  submittedAt: '2026-10-11T00:00:00.000Z', reviewedAt: null,
  ...(subscriptionUpgrade ? { subscriptionUpgrade } : {}),
});
beforeEach(() => { vi.clearAllMocks(); mocks.list.mockResolvedValue({ rows: [payment({
  currentPlan: { id: 'starter', version: 2 }, targetPlan: { id: 'enterprise', version: 4 },
  prorationAmount: amount, incrementalIncludedCredits: { ...amount, units: '25000' }, renewalAnchorAt: '2026-11-01T00:00:00Z',
})], nextCursor: null }); });
afterEach(cleanup);

describe('platform subscription upgrade payment review details', () => {
  it('labels adjustment payment as an upgrade and shows immutable quote terms', async () => {
    render(<PaymentReviewsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Review payment UPGRADE-REF' }));
    expect(screen.getByText('Subscription upgrade: starter → enterprise')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Subscription upgrade quote details' })).toBeInTheDocument();
    expect(screen.getByText('starter · version 2')).toBeInTheDocument();
    expect(screen.getByText('enterprise · version 4')).toBeInTheDocument();
    expect(screen.getByText('Incremental included credits')).toBeInTheDocument();
    expect(screen.getByText('Renewal anchor')).toBeInTheDocument();
  });

  it('keeps the generic subscription label when no upgrade quote details are included', async () => {
    mocks.list.mockResolvedValue({ rows: [payment()], nextCursor: null });
    render(<PaymentReviewsPage />);
    expect(await screen.findByText('Subscription')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review payment UPGRADE-REF' }));
    expect(screen.queryByRole('region', { name: 'Subscription upgrade quote details' })).not.toBeInTheDocument();
  });
});
