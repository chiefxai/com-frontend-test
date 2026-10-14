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
  it('includes workspace fees and billing links in the current-plan card without a separate charges card', async () => {
    const onNavigate = vi.fn();
    render(<BillingOverviewHome
      onNavigate={onNavigate} onOpenSubscriptionTask={vi.fn()}
      pricing={null} usage={null} callCount={0} phoneChargesBillable
      canManageSubscription canAllocate canSubmitPayment loadingUsage={false}
    />);
    expect(screen.getByText('Your plan right now')).toBeInTheDocument();
    expect(await screen.findByText('North workspace')).toBeInTheDocument();
    expect(screen.getByText('Plan and extra workspace charges')).toBeInTheDocument();
    expect(screen.queryByText('Extra workspace charges')).not.toBeInTheDocument();
    expect(screen.getByText('1 awaiting payment approval')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Allocate credits to a workspace' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add more credits' }));
    fireEvent.click(screen.getByRole('button', { name: 'View workspace invoices' }));
    expect(onNavigate.mock.calls.map(([destination]) => destination)).toEqual(['allocation', 'topup', 'payments']);
  });
});
