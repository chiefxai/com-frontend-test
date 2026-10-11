import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SubscriptionUpgradePreview from '../components/billing/SubscriptionUpgradePreview';

const mocks = vi.hoisted(() => ({ create: vi.fn(), can: vi.fn(() => true), key: 0, ApiError: class extends Error { code: string; constructor(message: string, options: { code?: string }) { super(message); this.code = options.code || ''; } } }));
vi.mock('../lib/authorization', () => ({ useAuthorization: () => ({ can: mocks.can, authorization: { organizationRole: 'Organization Admin' } }) }));
vi.mock('../lib/billing/client', () => ({
  billingClient: { createSubscriptionUpgradeQuote: mocks.create },
  BillingApiError: mocks.ApiError,
  newBillingIdempotencyKey: () => `upgrade-key-${++mocks.key}`,
}));

const money = { asset: 'INR', units: '123450', scale: 2 };
const response = (overrides: Record<string, unknown> = {}) => ({
  subscription: { lifecycleStatus: 'active', accessState: 'operational', planId: 'starter', planVersion: 2, version: 5 },
  quote: { quoteId: 'upgrade-q1', purpose: 'adjustment', status: 'draft', version: 1,
    plan: { id: 'enterprise', version: 3, terms: {} }, lines: [], subtotal: money, totalTax: { ...money, units: '1000' }, total: money,
    paymentAmount: money, includedCredits: money, validUntil: '2026-10-20T00:00:00Z', expired: false, payable: false,
    adjustment: { incrementalIncludedCredits: { ...money, units: '4000' }, prorationAmount: money, targetRecurringPrice: money,
      effectiveAt: '2026-10-11T00:00:00Z', renewalAnchorAt: '2026-11-01T00:00:00Z' } },
  payment: { submissionEnabled: false, submissionPath: null, payable: false, reason: 'UPGRADE_APPROVAL_FULFILLMENT_NOT_IMPLEMENTED' },
  ...overrides,
});
beforeEach(() => { vi.clearAllMocks(); mocks.key = 0; mocks.can.mockReturnValue(true); mocks.create.mockResolvedValue(response()); });
afterEach(cleanup);

describe('organization subscription upgrade preview', () => {
  it('requests the explicit target plan/version and displays the non-payable quote', async () => {
    render(<SubscriptionUpgradePreview />);
    fireEvent.change(screen.getByLabelText('Target plan ID'), { target: { value: 'enterprise' } });
    fireEvent.change(screen.getByLabelText('Published version'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview upgrade' }));
    await screen.findByText('enterprise · version 3');
    expect(mocks.create).toHaveBeenCalledWith({ targetPlanId: 'enterprise', targetPlanVersion: 3 }, { idempotencyKey: 'upgrade-key-1' });
    expect(screen.getByText(/Preview only · not payable/)).toBeInTheDocument();
    expect(screen.getByText(/Incremental credits for remaining period/)).toBeInTheDocument();
    expect(screen.getByText(/Amount due now/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pay|Submit payment/i })).not.toBeInTheDocument();
  });

  it('surfaces when preview is disabled and does not present a payment action', async () => {
    mocks.create.mockRejectedValue(new mocks.ApiError('disabled', { code: 'SUBSCRIPTION_UPGRADE_PREVIEW_DISABLED' }));
    render(<SubscriptionUpgradePreview />);
    fireEvent.change(screen.getByLabelText('Target plan ID'), { target: { value: 'enterprise' } });
    fireEvent.change(screen.getByLabelText('Published version'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview upgrade' }));
    await screen.findByRole('alert');
    expect(screen.getByText(/Upgrade previews are not enabled/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pay|Submit payment/i })).not.toBeInTheDocument();
  });

  it('is hidden from users without billing administration permission', () => {
    mocks.can.mockReturnValue(false);
    render(<SubscriptionUpgradePreview />);
    expect(screen.queryByText('Upgrade subscription plan')).not.toBeInTheDocument();
  });
});
