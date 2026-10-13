import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SubscriptionActionCenter from '../components/billing/SubscriptionActionCenter';

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
  it('shows only one billing task at a time and keeps the other tasks discoverable', () => {
    render(<SubscriptionActionCenter canSubmitPayment />);
    const keepGoing = screen.getByRole('button', { name: /Keep my plan going/ });
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

  it('does not turn a read-only payment workflow into an enabled one', () => {
    render(<SubscriptionActionCenter canSubmitPayment={false} />);
    expect(screen.getByTestId('renew-panel')).toHaveTextContent('Read-only');
  });
});
