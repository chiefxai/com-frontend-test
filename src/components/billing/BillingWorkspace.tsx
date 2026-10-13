import React from 'react';
import { Activity, ArrowDownToLine, Clock3, CreditCard, PhoneCall, Plus, ReceiptText, Wallet, Building2, Layers3, RefreshCw, Info } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import Button from '../ui/Button';
import KpiCard from '../ui/KpiCard';
import OrganizationTopUp, { type BillingPanel } from './OrganizationTopUp';
import { formatInr } from '../../lib/pricing';
import { useAuthorization, canAllocateOrganizationCredits } from '../../lib/authorization';
import ManualWorkspaceAllocation from './ManualWorkspaceAllocation';
import SubscriptionActionCenter from './SubscriptionActionCenter';
import WorkspaceAllocatedBilling from './WorkspaceAllocatedBilling';

export interface WorkspaceBillingSnapshot {
  workspaceId: string;
  workspaceName: string;
  monthlyBudgetInr: number | null;
  periodSpendInr: number;
  aiMinutesUsed: number;
  aiSpendInr: number;
  phoneSpendInr: number;
  remainingBudgetInr: number | null;
  budgetPeriod: { label: string };
}

export interface OrganizationSubscriptionPrice {
  totalMonthlyInr: number;
  workspaceCount: number;
  additionalIndustries: number;
}

export interface BillingWorkspaceProps {
  workspaceId?: string;
  view: BillingPanel;
  onNavigate: (view: BillingPanel) => void;
  workspaceBilling: WorkspaceBillingSnapshot | null;
  organizationPricing: OrganizationSubscriptionPrice | null;
  callCount: number | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  phoneChargesBillable: boolean;
  canSubmitPayment: boolean;
  canManageBudget: boolean;
  rechargeBased: boolean;
  rechargeBalanceInr: number;
  rechargeReservedInr: number;
  budgetDraft: string;
  onBudgetDraftChange: (value: string) => void;
  onSaveBudget: () => void;
  budgetSaving: boolean;
  budgetError: string;
}

/** Period call duration is returned as minutes, including fractional minutes. */
export function formatCallTime(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return '—';
  const seconds = Math.max(0, Math.round(minutes * 60));
  if (seconds < 60) return `${seconds}s`;
  const hours = Math.floor(seconds / 3600);
  const restMinutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${restMinutes}m` : `${Math.round(seconds / 60)}m`;
}

const sections: { key: BillingPanel; label: string; icon: React.ElementType }[] = [
  { key: 'dashboard', label: 'Overview', icon: Activity },
  { key: 'plan', label: 'Subscription', icon: CreditCard },
  { key: 'usage', label: 'Usage & limits', icon: PhoneCall },
  { key: 'credits', label: 'Credits', icon: Wallet },
  { key: 'allocation', label: 'Allocation', icon: Wallet },
  { key: 'payments', label: 'Payments', icon: ReceiptText },
];

const descriptions: Record<BillingPanel, string> = {
  dashboard: 'Your subscription, usage and credit balances in one place.',
  plan: 'Your plan, its price, and simple steps to manage it.',
  usage: 'Recorded call costs and workspace spending controls.',
  credits: 'Available credits from your plan and approved top-ups.',
  allocation: 'Assign organization-owned credit grants to workspaces and review transfer history.',
  topup: 'Submit a payment receipt for additional usage credits.',
  payments: 'Track payments and verification status.',
};

const money = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? '—' : formatInr(value);

/** Organization-wide charges must never be presented as a workspace-level bill. */
export default function BillingWorkspace({
  workspaceId, view, onNavigate, workspaceBilling, organizationPricing, callCount, loading, error,
  onRetry, phoneChargesBillable, canSubmitPayment, canManageBudget, rechargeBased,
  rechargeBalanceInr, rechargeReservedInr, budgetDraft, onBudgetDraftChange,
  onSaveBudget, budgetSaving, budgetError,
}: BillingWorkspaceProps) {
  const periodLabel = workspaceBilling?.budgetPeriod?.label || 'Current billing period';
  const { authorization } = useAuthorization();
  const canAllocate = canAllocateOrganizationCredits(authorization);
  const [showMorePlanDetails, setShowMorePlanDetails] = React.useState(false);
  const canManageSubscription = Boolean(authorization && authorization.permissions.includes('billing.read') &&
    ['Owner', 'Organization Admin', 'Billing Admin'].includes(authorization.organizationRole || ''));
  if (!authorization?.permissions.includes('billing.organization.read')) {
    return authorization?.permissions.includes('billing.read')
      ? <WorkspaceAllocatedBilling workspaceId={workspaceId || workspaceBilling?.workspaceId || ''} />
      : <p role="alert" className="col-span-12 text-xs text-[var(--text-secondary)]">You do not have access to workspace billing.</p>;
  }
  return (
    <div className="col-span-12 grid grid-cols-12 content-start gap-4 md:gap-5" id="billing-workspace">
      <Card padding="none" className="col-span-12 min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <p className="text-xs font-medium text-[var(--text-secondary)]">{descriptions[view]}</p>
          <span className="rounded-lg bg-[var(--bg-subtle)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)]">{periodLabel}</span>
        </div>
        <nav aria-label="Billing sections" className="flex gap-1 overflow-x-auto border-t border-[var(--border)] p-2 sm:px-3">
          {sections.filter(row => row.key !== 'allocation' || canAllocate).map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" aria-current={view === key ? 'page' : undefined}
              onClick={() => onNavigate(key)}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${view === key
                ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'}`}>
              <Icon aria-hidden="true" className="h-4 w-4" />{label}
            </button>
          ))}
          {canSubmitPayment && (
            <button type="button" aria-current={view === 'topup' ? 'page' : undefined}
              onClick={() => onNavigate('topup')}
              className={`ml-auto inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${view === 'topup'
                ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                : 'bg-[var(--accent)] text-white hover:opacity-90'}`}>
              <Plus aria-hidden="true" className="h-4 w-4" />Add credits
            </button>
          )}
        </nav>
      </Card>

      {error && (
        <div role="alert" className="col-span-12 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/60 bg-amber-500/5 p-4 text-xs text-[var(--text-secondary)]">
          <p>Usage and subscription totals are unavailable: {error}. Credit balances may still be available separately.</p>
          <Button type="button" size="sm" variant="secondary" icon={RefreshCw} onClick={onRetry}>Retry</Button>
        </div>
      )}
      {loading && <p role="status" className="col-span-12 text-xs text-[var(--text-muted)]">Refreshing billing totals…</p>}

      {view === 'dashboard' && (
        <div className="col-span-12 grid grid-cols-12 gap-3 md:gap-4">
            <KpiCard colSpan={3} iconPosition="top-left" icon={CreditCard}
              label="Subscription / month" value={money(organizationPricing?.totalMonthlyInr)}
              sub="Recurring plan price" />
            <KpiCard colSpan={3} iconPosition="top-left" icon={Activity}
              label="Recorded usage" value={money(workspaceBilling?.periodSpendInr)}
              sub="Organization-wide this period" />
            <KpiCard colSpan={3} iconPosition="top-left" icon={PhoneCall}
              label="Calls recorded" value={callCount ?? '—'} sub="Across all workspaces" />
            <KpiCard colSpan={3} iconPosition="top-left" icon={Clock3}
              label="Conversation time" value={formatCallTime(workspaceBilling?.aiMinutesUsed)}
              sub="Across all workspaces" />
        </div>
      )}

      {view === 'plan' && (
        <>
          <Card padding="sm" className="col-span-12 sm:!p-5">
            <CardHeader title="Your subscription" subtitle="Here's what your plan costs and what you can do next." icon={CreditCard}
              action={<Button type="button" size="sm" variant="secondary" icon={Wallet}
                onClick={() => onNavigate('credits')}>See my credits</Button>} />
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div className="rounded-xl bg-[var(--accent-subtle)] p-5">
                <p className="text-sm font-medium text-[var(--text-secondary)]">Your estimated plan price</p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-[var(--text-primary)]">
                  {money(organizationPricing?.totalMonthlyInr)}
                  <span className="ml-1 text-base font-normal text-[var(--text-secondary)]">every month</span>
                </p>
                <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                  This is your plan's monthly price before taxes and extra usage charges. The amount to pay on a bill may differ.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-[var(--border)] p-4">
                  <Building2 aria-hidden="true" className="h-5 w-5 text-[var(--accent)]" />
                  <p className="mt-3 text-2xl font-bold text-[var(--text-primary)]">{organizationPricing?.workspaceCount ?? '—'}</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">Workspaces</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Offices or teams on this plan</p>
                </div>
                <div className="rounded-xl border border-[var(--border)] p-4">
                  <Layers3 aria-hidden="true" className="h-5 w-5 text-[var(--accent)]" />
                  <p className="mt-3 text-2xl font-bold text-[var(--text-primary)]">{organizationPricing?.additionalIndustries ?? '—'}</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">Extra work types</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Additional industries in your plan</p>
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-[var(--border)] p-4">
              <Info aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" />
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Plan price and calling credits are different.</p>
                <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                  You pay the plan price to keep your subscription. Credits are used for services such as calls.
                  Credits included with your plan become available only after the payment is approved and the paid period starts.
                </p>
              </div>
            </div>
          </Card>
          {canManageSubscription
            ? <SubscriptionActionCenter canSubmitPayment={canSubmitPayment} />
            : <p className="col-span-12 rounded-xl border border-[var(--border)] p-4 text-sm text-[var(--text-secondary)]">
                Only your organization's billing administrators can start, renew, or change a subscription.
              </p>}
          <section className="col-span-12 space-y-3">
            <button type="button" aria-expanded={showMorePlanDetails}
              onClick={() => setShowMorePlanDetails(current => !current)}
              className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-4 text-left text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
              <span>{showMorePlanDetails ? 'Hide' : 'Show'} extra plan details</span>
              <span className="text-xs font-normal text-[var(--text-secondary)]">Workspace add-ons and credits</span>
            </button>
            {showMorePlanDetails && <OrganizationTopUp canSubmit={canSubmitPayment} view="plan" onNavigate={onNavigate} />}
          </section>
        </>
      )}

      {view === 'usage' && (
        <>
          <Card padding="sm" className="col-span-12 sm:!p-5">
            <CardHeader title="Calling costs" subtitle={`Organization-wide activity · ${periodLabel}`} icon={PhoneCall} />
            <div className="grid grid-cols-12 gap-3">
              <KpiCard colSpan={3} iconPosition="top-left" icon={PhoneCall}
                label="Calls" value={callCount ?? '—'} sub="Recorded this period" />
              <KpiCard colSpan={3} iconPosition="top-left" icon={Clock3}
                label="Call duration" value={formatCallTime(workspaceBilling?.aiMinutesUsed)} sub="Conversation time" />
              <KpiCard colSpan={3} iconPosition="top-left" icon={Activity}
                label="AI voice & post-call" value={money(workspaceBilling?.aiSpendInr)} sub="AI processing" />
              <KpiCard colSpan={3} iconPosition="top-left" icon={PhoneCall}
                label={phoneChargesBillable ? 'Phone provider charges' : 'Phone provider estimate'}
                value={money(workspaceBilling?.phoneSpendInr)}
                sub={phoneChargesBillable ? 'Recorded provider cost' : 'Your provider bills separately'} />
            </div>
            {!phoneChargesBillable && <p className="mt-3 text-xs text-[var(--text-muted)]">
              Phone costs are informational and not charged by this platform.
            </p>}
          </Card>
          <Card padding="sm" className="col-span-12 sm:!p-5">
            <CardHeader title="Spending & limits" subtitle="Organization spend and selected workspace controls" icon={Wallet} />
            <div className="grid grid-cols-12 gap-3">
              <KpiCard colSpan={4} span={{ xs: 12, sm: 6, lg: 4 }} iconPosition="top-left" icon={Activity}
                label="Organization usage spend" value={money(workspaceBilling?.periodSpendInr)}
                sub="Across all workspaces" />
              <KpiCard colSpan={4} span={{ xs: 12, sm: 6, lg: 4 }} iconPosition="top-left" icon={CreditCard}
                label="Selected workspace cap"
                value={!workspaceBilling ? '—' : workspaceBilling.monthlyBudgetInr == null ? 'No cap' : money(workspaceBilling.monthlyBudgetInr)}
                sub={workspaceBilling?.workspaceName || 'Selected workspace'} />
              <KpiCard colSpan={4} span={{ xs: 12, sm: 6, lg: 4 }} iconPosition="top-left" icon={ArrowDownToLine}
                label="Workspace cap remaining" value={money(workspaceBilling?.remainingBudgetInr)}
                sub="From billing service" />
              {rechargeBased && <KpiCard colSpan={4} span={{ xs: 12, sm: 6, lg: 4 }} iconPosition="top-left" icon={Wallet}
                label="Call balance available" value={formatInr(Math.max(0, rechargeBalanceInr - rechargeReservedInr))}
                sub="After active-call reservations" />}
            </div>
            {canManageBudget && workspaceBilling && (
              <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]/40 p-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Set the selected workspace's monthly cap</h3>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                  Limit new outbound calls when this workspace reaches its cap. Leave blank for no cap.
                </p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <label className="min-w-0 flex-1 text-xs font-medium text-[var(--text-secondary)]">
                    Monthly cap in INR
                    <input type="number" min="0" step="0.01" value={budgetDraft}
                      onChange={event => onBudgetDraftChange(event.target.value)}
                      placeholder="No cap"
                      className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-subtle)]" />
                  </label>
                  <Button type="button" variant="primary" size="md" loading={budgetSaving} onClick={onSaveBudget}>
                    Save workspace cap
                  </Button>
                </div>
                {budgetError && <p role="alert" className="mt-2 text-xs text-rose-600">{budgetError}</p>}
              </div>
            )}
            <p className="mt-4 text-xs leading-5 text-[var(--text-muted)]">
              Organization usage and the selected workspace cap are different scopes. Do not subtract one from the other.
              Active calls may finish slightly over the cap.
            </p>
          </Card>
        </>
      )}

      {view === 'allocation' && (canAllocate
        ? <ManualWorkspaceAllocation />
        : <p role="alert" className="col-span-12 px-3 py-4 text-xs text-[var(--text-secondary)]">
            Only organization administrators can allocate credits to workspaces.
          </p>)}
      {(view === 'dashboard' || view === 'credits' || view === 'topup' || view === 'payments') && (
        <OrganizationTopUp canSubmit={canSubmitPayment} view={view} onNavigate={onNavigate} />
      )}
    </div>
  );
}
