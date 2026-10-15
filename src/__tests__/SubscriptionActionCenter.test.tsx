import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SubscriptionActionCenter from '../components/billing/SubscriptionActionCenter';

const mocks = vi.hoisted(() => ({ renewal: vi.fn(), overview: vi.fn(), grace: vi.fn() }));
vi.mock('../lib/billing/client', () => ({
  billingClient: { subscriptionRenewal: mocks.renewal, organizationOverview: mocks.overview, subscriptionGraceRequests: mocks.grace }, 
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.renewal.mockImplementation(async () => ({
    subscription: { planId: 'starter', accessState: 'operational' },
    period: { endsAt: new Date(Date.now() + 3 * 86400000).toISOString(), renewalEligible: true },
    quote: null,
  }));
  mocks.overview.mockResolvedValue({ nextPeriod: null });
  mocks.grace.mockResolvedValue({ eligibility: { requestEligible: true }, items: [] });
});

vi.mock('../components/billing/SubscriptionRenewal', () => ({
  default: ({ canSubmit }: { canSubmit: boolean }) => <p data-testid="renew-panel">{canSubmit ? 'Can send receipt' : 'Read-only'}</p>,
}));
vi.mock('../components/billing/InitialSubscriptionPurchase', () => ({
  default: ({ canSubmit }: { canSubmit: boolean }) => <p data-testid="start-panel">{canSubmit ? 'Can send receipt' : 'Read-only'}</p>,
}));
vi.mock('../components/billing/SubscriptionUpgradePreview', () => ({
  default: () => <p data-testid="upgrade-panel">Price preview only</p>,
}));
vi.mock('../components/billing/SubscriptionGraceRequest', () => ({
  default: () => <p data-testid="grace-panel">Ask for a new deadline</p>,
}));

afterEach(cleanup);

describe('simple subscription action chooser', () => {
  it('shows only one billing task at a time and keeps the other tasks discoverable', async () => {
    render(<SubscriptionActionCenter canSubmitPayment />);
    const keepGoing = await screen.findByRole('button', { name: /Keep my plan going/ });
    expect(keepGoing).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('renew-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('start-panel')).not.toBeInTheDocument();
    fireEvent.click(keepGoing);
    expect(keepGoing).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('renew-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('start-panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Start a new plan/ }));
    expect(screen.getByTestId('start-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('renew-panel')).not.toBeInTheDocument();
    expect(keepGoing).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: /Look at a bigger plan/ }));
    expect(screen.getByTestId('upgrade-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('start-panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Ask for more time/ }));
    expect(screen.getByTestId('grace-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-panel')).not.toBeInTheDocument();
  });

  it('hides renewal outside the final seven days and does not promote enterprise upgrades', async () => {
    mocks.renewal.mockResolvedValue({
      subscription: { planId: 'enterprise', accessState: 'operational' },
      period: { endsAt: new Date(Date.now() + 30 * 86400000).toISOString(), renewalEligible: false },
      quote: null,
    });
    render(<SubscriptionActionCenter canSubmitPayment />);
    expect(await screen.findByRole('button', { name: /Start a new plan/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Keep my plan going/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Look at a bigger plan/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ask for more time/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start a new plan/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('start-panel')).not.toBeInTheDocument();
    expect(screen.getByText('Other plan choices')).toBeInTheDocument();
  });

  it('hides Ask for more time after payment is submitted or the next period is scheduled', async () => {
    mocks.renewal.mockResolvedValue({
      subscription: { planId: 'starter', accessState: 'operational' },
      period: { endsAt: new Date(Date.now() + 3 * 86400000).toISOString(), renewalEligible: true },
      quote: { status: 'pending_verification', pendingPayment: true },
    });
    render(<SubscriptionActionCenter canSubmitPayment />);
    expect(await screen.findByRole('button', { name: /Start a new plan/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ask for more time/ })).not.toBeInTheDocument();
  });

  it('does not show the grace action when the backend says a request is not eligible', async () => {
    mocks.grace.mockResolvedValue({ eligibility: { requestEligible: false }, items: [] });
    render(<SubscriptionActionCenter canSubmitPayment />);
    expect(await screen.findByRole('button', { name: /Start a new plan/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ask for more time/ })).not.toBeInTheDocument();
  });

  it('does not turn a read-only payment workflow into an enabled one', async () => {
    render(<SubscriptionActionCenter canSubmitPayment={false} />);
    fireEvent.click(await screen.findByRole('button', { name: /Keep my plan going/ }));
    expect(screen.getByTestId('renew-panel')).toHaveTextContent('Read-only');
  });
});
