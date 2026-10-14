import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import OrganizationTopUp from '../components/billing/OrganizationTopUp';

const mocks = vi.hoisted(() => ({
  organizationOverview: vi.fn(),
  subscriptionCreditStatus: vi.fn(),
  payments: vi.fn(),
  submitPaymentWithProof: vi.fn(),
  apiFetch: vi.fn(),
}));

vi.mock('../lib/billing/client', () => ({
  billingClient: {
    organizationOverview: mocks.organizationOverview,
    subscriptionCreditStatus: mocks.subscriptionCreditStatus,
    payments: mocks.payments,
    submitPaymentWithProof: mocks.submitPaymentWithProof,
  },
  newBillingIdempotencyKey: () => 'test-idempotency-key',
}));
vi.mock('../lib/api', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('../lib/authorization', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/authorization')>()),
  useAuthorization: () => ({
    can: () => true,
    authorization: {
      organizationRole: 'Organization Admin', workspaceRole: null, platformAdmin: false,
      permissions: ['billing.organization.read', 'billing.credit.allocate'],
    },
  }),
}));
vi.mock('../components/billing/WorkspaceAddonPurchases', () => ({
  default: ({ submittedPayments, displayFilter, showWorkspace }: {
    submittedPayments: Array<{ id: string; purpose: string; status: string; workspaceAddonName?: string | null }>;
    displayFilter: string; showWorkspace: boolean;
  }) => <div data-testid="payment-activity-list">
    {displayFilter !== 'workspace' && submittedPayments.map(payment =>
      <div key={payment.id}>
        {payment.purpose === 'topup' ? 'Credit top-up' :
          payment.purpose === 'subscription' ? 'Subscription payment' :
          payment.workspaceAddonName ? 'Workspace add-on' : 'Invoice payment'}
        {payment.workspaceAddonName && <span>{payment.workspaceAddonName}</span>}
        <span>{payment.status === 'pending_verification' ? 'Waiting for approval' : payment.status}</span>
      </div>)}
    {showWorkspace && displayFilter !== 'submitted' && <span data-testid="workspace-invoices">Workspace invoices</span>}
  </div>,
}));

const cash = (units: string) => ({ asset: 'INR', scale: 2, units });
const payment = {
  id: 'payment-1', purpose: 'topup' as const, status: 'pending_verification' as const,
  expectedAmount: cash('120000'), receivedAmount: null,
  submittedAt: '2026-10-09T12:00:00.000Z', reviewedAt: null, informationRequest: null,
};
const overview = {
  orgId: 'org-1', billingMethod: 'recharge_based' as const,
  activePeriod: { id: 'period-1', startsAt: '2026-10-01', endsAt: '2026-11-01',
    status: 'active' as const, termsVersion: 1 },
  nextPeriod: null,
  balances: [
    { kind: 'subscription' as const, available: cash('300000'), held: cash('0'), expiresAt: null },
    { kind: 'topup' as const, available: cash('150000'), held: cash('0'), expiresAt: null },
  ],
  recentPayments: [payment],
  outstandingInvoices: [],
  subscriptionTerms: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.organizationOverview.mockResolvedValue(overview);
  mocks.subscriptionCreditStatus.mockResolvedValue({
    planName:'Enterprise',planId:'enterprise',
    configuredMonthlyCredits:cash('250000'),entitlementSource:'organization_plan_snapshot',
    issuedThisPeriod:null,currentPeriod:null,state:'awaiting_approved_subscription',
  });
  mocks.payments.mockResolvedValue({ rows: [payment], nextCursor: null });
  mocks.apiFetch.mockImplementation(async (path: string) => ({
    ok: true,
    json: async () => path === '/api/billing/topup-quotes'
      ? { quoteId: 'quote-1', paymentAmount: cash('100000'), topupCredits: cash('100000') }
      : { topupAvailable: true },
  }));
  mocks.submitPaymentWithProof.mockResolvedValue({ expectedAmount: cash('100000') });
});
afterEach(cleanup);

describe('organization billing views', () => {
  it('shows only available plan and top-up pool balances, not promised or issued entitlements', async () => {
    const { rerender } = render(<OrganizationTopUp view="credits" canSubmit />);
    expect(screen.getByText('Available credits')).toBeInTheDocument();
    expect(await screen.findByText('₹3,000.00')).toBeInTheDocument();
    expect(screen.getByText('₹1,500.00')).toBeInTheDocument();
    expect(screen.getByText('Subscription credits remaining')).toBeInTheDocument();
    expect(screen.getByText('Top-up credits remaining')).toBeInTheDocument();
    expect(screen.queryByText('Monthly usage credits')).not.toBeInTheDocument();
    expect(screen.queryByText('Current plan period')).not.toBeInTheDocument();
    expect(mocks.subscriptionCreditStatus).not.toHaveBeenCalled();
    rerender(<OrganizationTopUp view="plan" canSubmit />);
    expect(screen.queryByText('Monthly usage credits')).not.toBeInTheDocument();
  });

  it('explains credit types clearly and shows a payment review summary', async () => {
    const { rerender } = render(<OrganizationTopUp view="credits" canSubmit />);
    expect(screen.getByText('Available credits')).toBeInTheDocument();
    expect(await screen.findByText('Subscription credits remaining')).toBeInTheDocument();
    rerender(<OrganizationTopUp view="payments" canSubmit />);
    expect(screen.getByText('Payments and workspace invoices')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    expect(screen.getByRole('combobox', { name: 'Payment records' })).toHaveValue('all');
    expect(screen.getByRole('combobox', { name: 'Payment status' })).toHaveValue('all');
    expect(screen.getByRole('combobox', { name: 'Payment type' })).toBeInTheDocument();
  });

  it('shows the available credit sources and a recent payment status without implying approval', async () => {
    const onNavigate = vi.fn();
    render(<OrganizationTopUp view="dashboard" canSubmit onNavigate={onNavigate} />);
    expect(await screen.findByText('Available usage credits')).toBeInTheDocument();
    expect(await screen.findByText('₹3,000.00')).toBeInTheDocument();
    expect(screen.getByText('₹1,500.00')).toBeInTheDocument();
    expect(await screen.findByText('Awaiting admin verification')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View credits' }));
    expect(onNavigate).toHaveBeenCalledWith('credits');
  });

  it('keeps the credit top-up form gated and hides it after a successful receipt submission', async () => {
    const onNavigate = vi.fn();
    render(<OrganizationTopUp view="topup" canSubmit onNavigate={onNavigate} />);
    fireEvent.click(await screen.findByRole('button', { name: '₹1,000' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Bank or UPI reference' }), {
      target: { value: 'UTR-456' },
    });
    const receipt = new File(['proof'], 'receipt.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/Payment receipt/i), { target: { files: [receipt] } });
    // jsdom does not set the native file input's value after a synthetic FileList
    // change, so submit the form directly to test React's receipt validation.
    const submitButton = screen.getByRole('button', { name: 'Submit for verification' });
    const form = submitButton.closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    await waitFor(() => expect(mocks.submitPaymentWithProof).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'topup', paymentReference: 'UTR-456' }),
      receipt, expect.objectContaining({ idempotencyKey: 'test-idempotency-key' }),
    ));
    expect(await screen.findByText(/Credits are added only after approval/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit for verification' })).not.toBeInTheDocument();
  });

  it('does not offer a top-up form when payment submission is disabled', async () => {
    render(<OrganizationTopUp view="topup" canSubmit={false} />);
    expect(await screen.findByText(/Only administrators with payment-submission permission/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit for verification' })).not.toBeInTheDocument();
  });

  it('includes workspace add-on payments by default and labels unrelated invoices correctly', async () => {
    const workspacePayment = {
      ...payment, id: 'pay-addon', purpose: 'invoice' as const,
      invoiceId: 'invoice-workspace', workspaceAddonName: 'Mumbai',
      expectedAmount: cash('5000'),
    };
    const invoicePayment = {
      ...payment, id: 'pay-general', purpose: 'invoice' as const,
      invoiceId: 'invoice-other', workspaceAddonName: null,
    };
    mocks.payments.mockResolvedValue({
      rows: [workspacePayment, invoicePayment, payment], nextCursor: null,
    });
    render(<OrganizationTopUp view="payments" canSubmit />);
    expect(await screen.findByText('Workspace add-on')).toBeInTheDocument();
    expect(screen.getByText('Mumbai')).toBeInTheDocument();
    expect(screen.getByText('Invoice payment')).toBeInTheDocument();
    expect(screen.getByText('Credit top-up')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    expect(screen.getByRole('combobox', { name: 'Payment type' })).toHaveValue('all');
    expect(mocks.payments).toHaveBeenCalledWith(null, 10, 'all');
    expect(screen.getByTestId('payment-activity-list')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-invoices')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Payment records' }), { target: { value: 'submitted' } });
    expect(screen.queryByTestId('workspace-invoices')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Payment records' }), { target: { value: 'workspace' } });
    expect(screen.getByTestId('workspace-invoices')).toBeInTheDocument();
    expect(screen.queryByText('Credit top-up')).not.toBeInTheDocument();
  });

  it('filters workspace invoices on the server before pagination and preserves type on Next', async () => {
    const workspacePayment = {
      ...payment, id: 'pay-addon', purpose: 'invoice' as const,
      invoiceId: 'invoice-workspace', workspaceAddonName: 'Mumbai',
    };
    mocks.payments.mockImplementation(async (cursor: string | null, _limit: number, type: string) => ({
      rows: type === 'workspace' ? [workspacePayment] : [payment],
      nextCursor: type === 'workspace' && !cursor ? 'next-workspace-page' : null,
    }));
    render(<OrganizationTopUp view="payments" canSubmit />);
    await screen.findByText('Credit top-up');
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Payment type' }), { target: { value: 'workspace' } });
    expect(await screen.findByText('Workspace add-on')).toBeInTheDocument();
    expect(screen.queryByText('Credit top-up')).not.toBeInTheDocument();
    expect(mocks.payments).toHaveBeenCalledWith(null, 10, 'workspace');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(mocks.payments).toHaveBeenCalledWith('next-workspace-page', 10, 'workspace'));
  });

  it('keeps the payment history and workspace-renewal view together', async () => {
    render(<OrganizationTopUp view="payments" canSubmit />);
    expect(await screen.findByText('Payments and workspace invoices')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-invoices')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    expect(screen.getByRole('combobox', { name: 'Payment type' })).toBeInTheDocument();
    expect(await within(screen.getByTestId('payment-activity-list')).findByText('Waiting for approval')).toBeInTheDocument();
  });
});
