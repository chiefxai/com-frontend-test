import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import WorkspaceAddonPurchases from '../components/billing/WorkspaceAddonPurchases';
import type { PaymentRequest } from '../lib/billing/types';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), submit: vi.fn() }));
vi.mock('../lib/api', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('../lib/billing/client', () => ({
  billingClient: { submitPaymentWithProof: mocks.submit },
  newBillingIdempotencyKey: () => 'test-operation',
}));
const amount = (units: string) => ({ asset: 'INR', units, scale: 2 });
const workspace = {
  id: 'addon-1', name: 'Mumbai workspace', status: 'pending', workspaceId: null,
  monthlyAmount: amount('100000'), autoRenew: true, periodEndsAt: null, graceEndsAt: null,
  invoice: {
    id: 'invoice-1', status: 'open', paymentAmount: amount('100000'),
    dueAt: '2026-10-20T00:00:00Z', paymentStatus: null, paymentRequestId: null,
  },
};
const topup: PaymentRequest = {
  id: 'payment-topup', purpose: 'topup', status: 'pending_verification',
  expectedAmount: amount('50000'), receivedAmount: null,
  submittedAt: '2026-10-13T00:00:00Z', reviewedAt: null, informationRequest: null,
};
const linked: PaymentRequest = {
  ...topup, id: 'payment-linked', purpose: 'invoice', invoiceId: 'invoice-1',
  workspaceAddonName: 'Mumbai workspace',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.apiFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ rows: [workspace], purchasesAvailable: true }),
  });
});
afterEach(cleanup);

describe('single payment and invoice activity list', () => {
  it('merges receipts and actionable workspace invoices without duplicating linked receipts', async () => {
    render(<WorkspaceAddonPurchases canSubmit submittedPayments={[topup, linked]} />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
    expect(screen.getByText('Credit top-up')).toBeInTheDocument();
    expect(screen.getByText('Mumbai workspace')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit payment' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel purchase' })).toBeInTheDocument();
  });

  it('filters receipts and workspace invoices without mixing their actions', async () => {
    const { rerender } = render(<WorkspaceAddonPurchases submittedPayments={[topup]} displayFilter="submitted" />);
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalled());
    expect(screen.getByText('Credit top-up')).toBeInTheDocument();
    expect(screen.queryByText('Mumbai workspace')).not.toBeInTheDocument();

    rerender(<WorkspaceAddonPurchases canSubmit submittedPayments={[topup]} displayFilter="workspace" statusFilter="action" />);
    await waitFor(() => expect(screen.getByText('Mumbai workspace')).toBeInTheDocument());
    expect(screen.queryByText('Credit top-up')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit payment' })).toBeInTheDocument();

    rerender(<WorkspaceAddonPurchases submittedPayments={[topup]} displayFilter="all" statusFilter="review" />);
    expect(screen.getByText('Credit top-up')).toBeInTheDocument();
    expect(screen.queryByText('Mumbai workspace')).not.toBeInTheDocument();
  });
});
