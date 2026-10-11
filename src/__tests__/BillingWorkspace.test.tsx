import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import BillingWorkspace, { formatCallTime, type BillingWorkspaceProps } from '../components/billing/BillingWorkspace';

vi.mock('../components/billing/OrganizationTopUp', () => ({
  default: () => <div data-testid="organization-credit-ledger">Credit ledger</div>,
}));

const billing: BillingWorkspaceProps['workspaceBilling'] = {
  workspaceId: 'workspace-1',
  workspaceName: 'Main office',
  monthlyBudgetInr: 3000,
  periodSpendInr: 1250,
  aiMinutesUsed: 62,
  aiSpendInr: 1000,
  phoneSpendInr: 250,
  remainingBudgetInr: 750,
  budgetPeriod: { label: 'October 2026' },
};

const defaults: BillingWorkspaceProps = {
  view: 'dashboard',
  onNavigate: vi.fn(),
  workspaceBilling: billing,
  organizationPricing: { totalMonthlyInr: 4999, workspaceCount: 2, additionalIndustries: 1 },
  callCount: 43,
  loading: false,
  error: '',
  onRetry: vi.fn(),
  phoneChargesBillable: true,
  canSubmitPayment: true,
  canManageBudget: true,
  rechargeBased: false,
  rechargeBalanceInr: 0,
  rechargeReservedInr: 0,
  budgetDraft: '3000',
  onBudgetDraftChange: vi.fn(),
  onSaveBudget: vi.fn(),
  budgetSaving: false,
  budgetError: '',
};

describe('organization billing interface', () => {
  it('keeps recurring subscription, organization usage, and credit ledger conceptually separate', () => {
    render(<BillingWorkspace {...defaults} />);
    expect(screen.getByText('Subscription / month')).toBeTruthy();
    expect(screen.getByText('Recorded usage')).toBeTruthy();
    expect(screen.getByText('Calls recorded')).toBeTruthy();
    expect(screen.getByText('43')).toBeTruthy();
    expect(screen.getByText(/not a final invoice total/i)).toBeTruthy();
    expect(screen.getByTestId('organization-credit-ledger')).toBeTruthy();
  });

  it('offers direct navigation to the major billing sections', () => {
    const onNavigate = vi.fn();
    render(<BillingWorkspace {...defaults} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Usage & limits' }));
    expect(onNavigate).toHaveBeenCalledWith('usage');
    fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
    expect(onNavigate).toHaveBeenCalledWith('payments');
    fireEvent.click(screen.getByRole('button', { name: 'Add credits' }));
    expect(onNavigate).toHaveBeenCalledWith('topup');
  });

  it('keeps organization spending distinct from the selected workspace cap and preserves save', () => {
    const onSaveBudget = vi.fn();
    const onBudgetDraftChange = vi.fn();
    render(<BillingWorkspace {...defaults} view="usage" onSaveBudget={onSaveBudget} onBudgetDraftChange={onBudgetDraftChange} />);
    expect(screen.getByText('Organization usage spend')).toBeTruthy();
    expect(screen.getByText('Selected workspace cap')).toBeTruthy();
    expect(screen.getByText('Workspace cap remaining')).toBeTruthy();
    expect(screen.getByText(/different scopes/i)).toBeTruthy();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Monthly cap in INR' }), { target: { value: '2000' } });
    expect(onBudgetDraftChange).toHaveBeenCalledWith('2000');
    fireEvent.click(screen.getByRole('button', { name: 'Save workspace cap' }));
    expect(onSaveBudget).toHaveBeenCalledOnce();
  });

  it('does not display the edit action without workspace permissions', () => {
    render(<BillingWorkspace {...defaults} view="usage" canManageBudget={false} />);
    expect(screen.queryByRole('button', { name: 'Save workspace cap' })).toBeNull();
  });

  it('explains a failed refresh and lets the user retry', () => {
    const onRetry = vi.fn();
    render(<BillingWorkspace {...defaults} workspaceBilling={null} organizationPricing={null} error="Backend unavailable" onRetry={onRetry} />);
    expect(screen.getByRole('alert').textContent).toContain('Backend unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('formats duration without manufacturing decimal hours', () => {
    expect(formatCallTime(62)).toBe('1h 2m');
    expect(formatCallTime(0.5)).toBe('30s');
    expect(formatCallTime(null)).toBe('—');
  });
});
