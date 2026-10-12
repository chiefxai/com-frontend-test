import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import ReviewCenterPage, { resolveReviewType } from '../admin/ReviewCenterPage';
import AdminShell from '../admin/AdminShell';

const mocks = vi.hoisted(() => ({
  listPayments: vi.fn(),
  listGrace: vi.fn(),
  decidePayment: vi.fn(),
  decideGrace: vi.fn(),
  receipt: vi.fn(),
  nextKey: 0,
}));
vi.mock('../lib/billing/client', () => ({
  newBillingIdempotencyKey: () => `review-key-${++mocks.nextKey}`,
}));
vi.mock('../lib/billing/platformDecision', () => ({
  listPlatformPaymentReviews: mocks.listPayments,
  listPlatformSubscriptionGraceRequests: mocks.listGrace,
  decidePlatformPayment: mocks.decidePayment,
  decidePlatformSubscriptionGraceRequest: mocks.decideGrace,
  platformPaymentReceipt: mocks.receipt,
}));
vi.mock('../components/ProfileMenu', () => ({ default: () => <div>Platform account menu</div> }));
vi.mock('../components/ui/PageHeaderBar', () => ({ default: () => <div>Platform header</div> }));

const payment = {
  id: 'pay-7', orgId: 'org-a', purpose: 'topup', status: 'pending_verification', version: 3,
  expectedAmount: { asset: 'INR', units: '50000', scale: 2 },
  receivedAmount: null, paymentReference: 'PAY-500', proofAvailable: true,
  submittedAt: '2026-10-10T00:00:00Z', reviewedAt: null,
};
const grace = {
  id: 'grace-7', orgId: 'org-b', organizationName: 'Beta Corp', periodId: 'period-7',
  periodStartsAt: '2026-10-01T00:00:00Z', periodEndsAt: '2026-11-01T00:00:00Z',
  requestedUntil: '2026-11-05T00:00:00Z', justification: 'Bank transfer pending approval.',
  requestedBy: 'billing-admin', status: 'requested', grantedUntil: null, version: 2,
  createdAt: '2026-10-11T00:00:00Z', updatedAt: '2026-10-11T00:00:00Z', decisions: [],
};

function RouterInfo() {
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <output data-testid="review-location">{location.pathname}{location.search}</output>
    <button type="button" onClick={() => navigate(-1)}>Go back</button>
  </>;
}

function mount(initial = '/admin/reviews') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <RouterInfo />
      <Routes>
        <Route path="/admin/reviews" element={<ReviewCenterPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.nextKey = 0;
  mocks.listPayments.mockResolvedValue({ rows: [payment], nextCursor: null });
  mocks.listGrace.mockResolvedValue({ items: [grace] });
  mocks.decidePayment.mockResolvedValue({ funding: { status: 'active' } });
  mocks.decideGrace.mockResolvedValue({ ...grace, status: 'approved' });
  mocks.receipt.mockResolvedValue({ url: 'https://example.invalid/proof', expiresIn: 90 });
});
afterEach(cleanup);

describe('Platform Admin shared reviews page', () => {
  it('defaults to payment reviews and only requests the active queue', async () => {
    expect(resolveReviewType(null)).toBe('payments');
    expect(resolveReviewType('unknown')).toBe('payments');
    mount();
    expect(screen.getByRole('combobox', { name: 'Review type' })).toHaveValue('payments');
    expect(await screen.findByText('PAY-500')).toBeInTheDocument();
    expect(mocks.listPayments).toHaveBeenCalledWith(undefined, 'pending_verification');
    expect(mocks.listGrace).not.toHaveBeenCalled();
    expect(screen.getByText(/Verify payment evidence/)).toBeInTheDocument();
  });

  it('filters between payments and grace requests, preserving URL state and browser Back', async () => {
    mount('/admin/reviews?from=dashboard&type=payments');
    await screen.findByText('PAY-500');
    fireEvent.change(screen.getByRole('combobox', { name: 'Review type' }), { target: { value: 'grace' } });
    expect(screen.getByTestId('review-location')).toHaveTextContent('/admin/reviews?from=dashboard&type=grace');
    expect(await screen.findByText('Bank transfer pending approval.')).toBeInTheDocument();
    expect(mocks.listGrace).toHaveBeenCalledWith('requested');
    expect(screen.queryByText('PAY-500')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Review type' })).toHaveValue('payments'));
    expect(await screen.findByText('PAY-500')).toBeInTheDocument();
    expect(screen.queryByText('Bank transfer pending approval.')).not.toBeInTheDocument();
  });

  it('opens a bookmarked grace review directly without requesting payments', async () => {
    mount('/admin/reviews?type=grace');
    expect(screen.getByRole('combobox', { name: 'Review type' })).toHaveValue('grace');
    expect(await screen.findByText('Bank transfer pending approval.')).toBeInTheDocument();
    expect(mocks.listPayments).not.toHaveBeenCalled();
  });

  it('keeps payment approval evidence checks and idempotency key intact', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Review payment PAY-500' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve verified payment' }));
    expect(mocks.decidePayment).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/inspect the receipt/i);
    fireEvent.click(screen.getByRole('checkbox', { name: /independently verified the payment/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve verified payment' }));
    await waitFor(() => expect(mocks.decidePayment).toHaveBeenCalledWith(
      'org-a', 'pay-7',
      { decision: 'approve', expectedVersion: 3,
        receivedAmount: { asset: 'INR', units: '50000', scale: 2 } },
      { idempotencyKey: 'review-key-1' },
    ));
    expect(await screen.findByText(/top-up approved/i)).toBeInTheDocument();
  });

  it('keeps grace decisions reason-gated and records the selected request version', async () => {
    mount('/admin/reviews?type=grace');
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }));
    const approve = screen.getByRole('button', { name: 'Approve until requested deadline' });
    expect(approve).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Decision reason/), {
      target: { value: 'Verified incoming bank settlement.' },
    });
    fireEvent.click(approve);
    await waitFor(() => expect(mocks.decideGrace).toHaveBeenCalledWith(
      grace,
      { decision: 'approve', reason: 'Verified incoming bank settlement.',
        expectedVersion: 2, grantedUntil: grace.requestedUntil },
      { idempotencyKey: 'review-key-1' },
    ));
    expect(await screen.findByText(/Grace request approved/i)).toBeInTheDocument();
  });

  it('retains the workflow-specific status filter for each review type', async () => {
    mount();
    await screen.findByText('PAY-500');
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    let filter = screen.getByRole('menu');
    fireEvent.change(within(filter).getByRole('combobox'), { target: { value: 'all' } });
    await waitFor(() => expect(mocks.listPayments).toHaveBeenCalledWith(undefined, 'all'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Review type' }), { target: { value: 'grace' } });
    await screen.findByText('Bank transfer pending approval.');
    // The old filter popover may close when its source queue is unmounted.
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    filter = screen.getByRole('menu');
    fireEvent.change(within(filter).getByRole('combobox'), { target: { value: 'all' } });
    await waitFor(() => expect(mocks.listGrace).toHaveBeenCalledWith('all'));
  });
});

describe('Platform Admin review navigation compatibility', () => {
  it('has one sidebar entry and redirects the old grace route to the new filtered view', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/grace-requests']}>
        <RouterInfo />
        <Routes><Route path="/admin/*" element={<AdminShell email="admin@example.com" onLogout={vi.fn()} />} /></Routes>
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'Platform Admin navigation' });
    expect(within(nav).getAllByRole('link', { name: 'Reviews & Requests' })).toHaveLength(1);
    expect(within(nav).queryByRole('link', { name: 'Payment Reviews' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Grace Requests' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('review-location')).toHaveTextContent('/admin/reviews?type=grace'));
    expect(screen.getByRole('combobox', { name: 'Review type' })).toHaveValue('grace');
  });

  it('redirects an older payment link without losing payment review access', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/payment-reviews']}>
        <RouterInfo />
        <Routes><Route path="/admin/*" element={<AdminShell email="admin@example.com" onLogout={vi.fn()} />} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('review-location')).toHaveTextContent('/admin/reviews?type=payments'));
    expect(await screen.findByText('PAY-500')).toBeInTheDocument();
  });
});
