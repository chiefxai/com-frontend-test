import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import BillingOverviewHome from '../components/billing/BillingOverviewHome';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(), organizationOverview: vi.fn(), subscriptionCreditStatus: vi.fn(),
  subscriptionRenewal: vi.fn(),
}));
vi.mock('../lib/api', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('../lib/billing/client', () => ({
  billingClient: {
    organizationOverview: mocks.organizationOverview,
    subscriptionCreditStatus: mocks.subscriptionCreditStatus,
    subscriptionRenewal: mocks.subscriptionRenewal,
  },
}));

const cash = (units: string) => ({ asset: 'INR', units, scale: 2 });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.organizationOverview.mockResolvedValue({ activePeriod: null, nextPeriod: null, balances: [] });
  mocks.subscriptionCreditStatus.mockResolvedValue({ planName: 'Starter', planId: 'starter' });
  mocks.subscriptionRenewal.mockResolvedValue({
    subscription: { planId: 'starter', lifecycleStatus: 'active', accessState: 'operational' },
    period: { endsAt: new Date(Date.now() + 15 * 86400000).toISOString(), renewalEligible: false },
    quote: null,
  });
  mocks.apiFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ rows: [
      { id: 'addon-paid', name: 'North workspace', status: 'active', monthlyAmount: cash('30000'), workspaceId: 'ws-north' },
      { id: 'addon-pending', name: 'East workspace', status: 'pending', monthlyAmount: cash('30000'), workspaceId: null },
    ] }),
  });
});
afterEach(cleanup);

describe('Billing Overview current plan card', () => {
  it('shows balances beside the current plan and defaults to View my plan', async () => {
    const onNavigate = vi.fn();
    render(<BillingOverviewHome
      onNavigate={onNavigate} onOpenSubscriptionTask={vi.fn()}
      pricing={null} usage={null} callCount={0} phoneChargesBillable
      canManageSubscription canAllocate canSubmitPayment loadingUsage={false}
    />);
    expect(screen.getByText('Your plan right now')).toBeInTheDocument();
    expect(await screen.findByText('Starter')).toBeInTheDocument();
    for (const label of ['Plan credits remaining','Extra credits remaining','AI usage cost','Call usage'])
      expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText('Plan and extra workspace charges')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pay to continue' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View my plan' }));
    expect(onNavigate).toHaveBeenCalledWith('plan');
  });

});
