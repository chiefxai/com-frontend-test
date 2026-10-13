import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SubscriptionGraceRequest from '../components/billing/SubscriptionGraceRequest';
import { BillingApiError } from '../lib/billing/client';

const mocks = vi.hoisted(() => ({ list: vi.fn(), submit: vi.fn(), can: vi.fn(() => true), nextKey: 0 }));
vi.mock('../lib/authorization', () => ({ useAuthorization: () => ({ can: mocks.can, authorization: { organizationRole: 'Organization Admin' } }) }));
vi.mock('../lib/billing/client', () => ({
  billingClient: { subscriptionGraceRequests: mocks.list, submitSubscriptionGraceRequest: mocks.submit },
  BillingApiError: class BillingApiError extends Error { status: number; constructor(message: string, options: { status: number }) { super(message); this.status = options.status; } },
  newBillingIdempotencyKey: () => `grace-key-${++mocks.nextKey}`,
}));

const graceStatus = (eligible = true) => ({ items: [], eligibility: {
  subscriptionVersion: 7, currentPeriodId: 'period-current', billingAccessState: 'operational', billingSuspensionCause: null,
  currentPeriodEndsAt: '2030-01-04T00:00:00.000Z', currentRestrictionDeadline: '2030-01-04T00:00:00.000Z',
  maxDaysPerPeriod: 5, maximumUntil: '2030-01-09T00:00:00.000Z', requestEligible: eligible, currentRequest: null,
} });
beforeEach(() => { vi.clearAllMocks(); mocks.nextKey = 0; mocks.can.mockReturnValue(true); mocks.list.mockResolvedValue(graceStatus()); mocks.submit.mockResolvedValue({ id: 'grace-1', status: 'requested' }); });
afterEach(cleanup);

describe('subscription grace request', () => {
  it('shows the server deadline bound and submits the current period/version with a reason', async () => {
    render(<SubscriptionGraceRequest />);
    const deadline = await screen.findByLabelText(/New deadline you are asking for/);
    const maxDate = new Date('2030-01-09T00:00:00.000Z');
    const pad = (value: number) => String(value).padStart(2, '0');
    expect(deadline).toHaveAttribute('max', `${maxDate.getFullYear()}-${pad(maxDate.getMonth() + 1)}-${pad(maxDate.getDate())}T${pad(maxDate.getHours())}:${pad(maxDate.getMinutes())}`);
    fireEvent.change(deadline, { target: { value: '2030-01-05T12:30' } });
    fireEvent.change(screen.getByLabelText('Why do you need more time?'), { target: { value: 'Bank transfer is being processed.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request for more time' }));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith({
      periodId: 'period-current', requestedUntil: new Date('2030-01-05T12:30').toISOString(),
      justification: 'Bank transfer is being processed.', expectedVersion: 7,
    }, expect.objectContaining({ idempotencyKey: expect.any(String) })));
    expect(await screen.findByText(/Your deadline stays the same unless/)).toBeInTheDocument();
  });

  it('does not offer a grace request when the server says it is ineligible', async () => {
    mocks.list.mockResolvedValue(graceStatus(false));
    render(<SubscriptionGraceRequest />);
    await screen.findByText(/You cannot ask for more time with this plan right now/);
    expect(screen.queryByRole('button', { name: 'Send request for more time' })).not.toBeInTheDocument();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('shows the pending decision without treating the request as an extension', async () => {
    const result = graceStatus(false);
    result.eligibility.currentRequest = { id: 'grace-1', requestedUntil: '2030-01-05T00:00:00.000Z', justification: 'Need time', status: 'requested', grantedUntil: null, version: 1 };
    mocks.list.mockResolvedValue(result);
    render(<SubscriptionGraceRequest />);
    await screen.findByText('Your request: requested');
    expect(screen.getByText(/Your request: requested/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send request for more time' })).not.toBeInTheDocument();
  });

  it('explains that grace UI is unavailable while the server feature is disabled', async () => {
    mocks.list.mockRejectedValue(new BillingApiError('Subscription grace requests are not enabled.', { status: 503 }));
    render(<SubscriptionGraceRequest />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable until platform operations enables it/);
  });
});
