import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setAuthorization, legacyAuthorization } from '../lib/authorization';
import BillingWorkspace, { formatCallTime, type BillingWorkspaceProps } from '../components/billing/BillingWorkspace';

vi.mock('../components/billing/OrganizationTopUp', () => ({
  default: () => <div data-testid="organization-credit-ledger">Credit ledger</div>,
}));
const mocks = vi.hoisted(() => ({ workspaceOverview: vi.fn(), renewal: vi.fn(), organizationOverview: vi.fn(), creditStatus: vi.fn(), grace: vi.fn() }));
vi.mock('../lib/billing/client', () => ({
  billingClient: { workspaceOverview: mocks.workspaceOverview, subscriptionRenewal: mocks.renewal,
    organizationOverview: mocks.organizationOverview, subscriptionCreditStatus: mocks.creditStatus, subscriptionGraceRequests: mocks.grace }, 
  newBillingIdempotencyKey: () => 'test-renewal-key',
  BillingApiError: class extends Error { status = 500; },
}));
beforeEach(() => {
  setAuthorization(legacyAuthorization('Organization Admin'));
  mocks.organizationOverview.mockResolvedValue({ nextPeriod: null, balances: [], activePeriod: null,
    allocation: { mode:'manual',manualAllocationAllowed:true,workspaceLimit:10,workspaceCount:2,workspaceId:null,status:'ready' } });
  mocks.creditStatus.mockResolvedValue({ planName: 'Starter', planId: 'starter' });
  mocks.grace.mockResolvedValue({ eligibility: { requestEligible: true }, items: [] });
  mocks.renewal.mockResolvedValue({
    subscription: { lifecycleStatus: 'active', accessState: 'operational', planId: 'starter', planVersion: 1, version: 1 },
    period: { endsAt: new Date(Date.now() + 3 * 86400000).toISOString(), renewalEligible: true, startsAt: new Date(Date.now() - 25 * 86400000).toISOString() }, quote: null, payment: { submissionEnabled: false, purpose: 'subscription' }, 
  });
  mocks.workspaceOverview.mockResolvedValue({ orgId: 'org-1', workspaceId: 'workspace-1', workspaceName: 'Main office',
    status: 'active', uninitialized: false, balances: [
      { kind: 'subscription', available: {asset:'INR',units:'12500',scale:2}, held: {asset:'INR',units:'500',scale:2}, expiresAt:'2026-11-01T00:00:00Z' },
      { kind: 'topup', available: {asset:'INR',units:'7000',scale:2}, held: {asset:'INR',units:'0',scale:2}, expiresAt:null },
    ] });
});
afterEach(() => { cleanup(); setAuthorization(null); vi.clearAllMocks(); });

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
  it.each(['dashboard', 'plan', 'usage', 'credits', 'allocation', 'payments', 'topup'] as const)(
    'limits Workspace Admins to selected workspace allocations even on the %s view', async view => {
      setAuthorization({ organizationRole:'Member', workspaceRole:'Workspace Admin', platformAdmin:false,
        permissions:['billing.read','workspace.settings.manage'] });
      render(<BillingWorkspace {...defaults} workspaceId="workspace-1" view={view} />);
      expect(await screen.findByText('Allocated subscription credits')).toBeInTheDocument();
      expect(screen.getByText('Allocated top-up credits')).toBeInTheDocument();
      expect(screen.getByText('INR 125.00')).toBeInTheDocument();
      expect(screen.getByText('INR 70.00')).toBeInTheDocument();
      expect(mocks.workspaceOverview).toHaveBeenCalledWith('workspace-1');
      expect(screen.queryByTestId('organization-credit-ledger')).not.toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name:'Billing sections' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name:'Add credits' })).not.toBeInTheDocument();
      expect(screen.queryByText('Subscription / month')).not.toBeInTheDocument();
      expect(screen.queryByText('Organization usage spend')).not.toBeInTheDocument();
    },
  );

  it('keeps the plan, remaining credits and call usage conceptually separate', () => {
    render(<BillingWorkspace {...defaults} />);
    expect(screen.getByText('Your plan right now')).toBeTruthy();
    expect(screen.getByText('Plan credits remaining')).toBeTruthy();
    expect(screen.getByText('Call usage')).toBeTruthy();
    expect(screen.getByText('43')).toBeTruthy();
    expect(screen.queryByText('Explore billing')).not.toBeInTheDocument();
    expect(screen.queryByTestId('organization-credit-ledger')).not.toBeInTheDocument();
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

  it('keeps primary billing navigation without an Explore billing card', () => {
    const onNavigate = vi.fn();
    render(<BillingWorkspace {...defaults} onNavigate={onNavigate} />);
    expect(screen.queryByText('Explore billing')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Subscription' }));
    expect(onNavigate).toHaveBeenCalledWith('plan');
    fireEvent.click(screen.getByRole('button', { name: 'Credits' }));
    expect(onNavigate).toHaveBeenCalledWith('credits');
  });

  it('shows a simple subscription overview and hides extra billing details by default', async () => {
    render(<BillingWorkspace {...defaults} view="plan" />);
    expect(screen.getByText('Your subscription')).toBeInTheDocument();
    expect(screen.getByText('Your estimated plan price')).toBeInTheDocument();
    expect(screen.getByText('Plan price and calling credits are different.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Keep my plan going/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /Start a new plan/ })).toBeInTheDocument();
    expect(screen.queryByTestId('organization-credit-ledger')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show extra plan details/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /View remaining credits/ }));
    expect(defaults.onNavigate).toHaveBeenCalledWith('credits');
    fireEvent.click(screen.getByRole('button', { name: /Workspace invoices and payments/ }));
    expect(defaults.onNavigate).toHaveBeenCalledWith('payments');
  });

  it('hides Allocation for automatic single-workspace billing and redirects a direct Allocation URL', async () => {
    const onNavigate = vi.fn();
    mocks.organizationOverview.mockResolvedValue({ nextPeriod: null, balances: [], activePeriod: null,
      allocation: { mode:'automatic',manualAllocationAllowed:false,workspaceLimit:1,workspaceCount:1,
        workspaceId:'workspace-1',status:'ready' } });
    render(<BillingWorkspace {...defaults} view="allocation" onNavigate={onNavigate} />);
    expect(await screen.findByRole('navigation', { name:'Billing sections' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name:'Allocation' })).not.toBeInTheDocument();
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('credits'));
  });

  it('keeps four usage and balance cards alongside the compact current-plan card', () => {
    render(<BillingWorkspace {...defaults} />);
    expect(screen.getByText('Your plan right now')).toBeInTheDocument();
    for (const title of ['Plan credits remaining','Extra credits remaining','AI usage cost','Call usage'])
      expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View my plan' })).toBeInTheDocument();
  });

  it('removes workspace monthly spending controls without hiding usage totals', () => {
    render(<BillingWorkspace {...defaults} view="usage" />);
    expect(screen.getByText('Usage cost so far')).toBeInTheDocument();
    expect(screen.queryByText('Your workspace spending limit')).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', {name:'Monthly cap in INR'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name:'Save workspace limit'})).not.toBeInTheDocument();
  });

  it('keeps Add credits hidden for viewers without submission permission', () => {
    render(<BillingWorkspace {...defaults} canSubmitPayment={false} />);
    expect(screen.queryByRole('button', { name: 'Add credits' })).not.toBeInTheDocument();
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
