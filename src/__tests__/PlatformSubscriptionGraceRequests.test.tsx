import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SubscriptionGraceRequestsPage from '../admin/SubscriptionGraceRequestsPage';

const mocks = vi.hoisted(() => ({ list: vi.fn(), decide: vi.fn(), key: 0 }));
vi.mock('../lib/billing/client', () => ({ newBillingIdempotencyKey: () => `grace-decision-${++mocks.key}` }));
vi.mock('../lib/billing/platformDecision', () => ({
  listPlatformSubscriptionGraceRequests: mocks.list,
  decidePlatformSubscriptionGraceRequest: mocks.decide,
}));

const request = {
  id: 'grace-7', orgId: 'org-1', organizationName: 'Acme', periodId: 'period-2',
  periodStartsAt: '2030-01-01T00:00:00.000Z', periodEndsAt: '2030-02-01T00:00:00.000Z',
  requestedUntil: '2030-02-05T00:00:00.000Z', justification: 'Customer transfer is pending.',
  requestedBy: 'user-org-admin', status: 'requested', grantedUntil: null, version: 4,
  createdAt: '2030-01-25T00:00:00.000Z', updatedAt: '2030-01-25T00:00:00.000Z', decisions: [],
};

beforeEach(() => {
  vi.clearAllMocks(); mocks.key = 0;
  mocks.list.mockResolvedValue({ items: [request] });
  mocks.decide.mockResolvedValue({ ...request, status: 'approved' });
});
afterEach(cleanup);

describe('platform subscription grace queue', () => {
  it('shows request details and submits an approval with the request version and idempotency key', async () => {
    render(<SubscriptionGraceRequestsPage />);
    expect(await screen.findByText('Customer transfer is pending.')).toBeInTheDocument();
    expect(screen.getByText('user-org-admin')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    fireEvent.change(screen.getByLabelText(/Decision reason/), { target: { value: 'Confirmed transfer processing with finance.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve until requested deadline' }));
    await waitFor(() => expect(mocks.decide).toHaveBeenCalledWith(request, {
      decision: 'approve', reason: 'Confirmed transfer processing with finance.', expectedVersion: 4,
      grantedUntil: request.requestedUntil,
    }, { idempotencyKey: 'grace-decision-1' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/Grace request approved/);
  });

  it('shows decision actor and reason in request audit history', async () => {
    mocks.list.mockResolvedValue({ items: [{ ...request, status: 'denied', decisions: [{ decision: 'deny', reason: 'Deadline cannot be extended.', decidedBy: 'platform-admin', decidedAt: '2030-01-26T00:00:00.000Z', grantedUntil: null }] }] });
    render(<SubscriptionGraceRequestsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Audit' }));
    expect(screen.getByText((_, element) => element?.textContent?.startsWith('deny by platform-admin ·') === true)).toBeInTheDocument();
    expect(screen.getByText('Reason: Deadline cannot be extended.')).toBeInTheDocument();
  });
});
