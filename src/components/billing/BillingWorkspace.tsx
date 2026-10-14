import React from 'react';
import { Activity, ArrowRight, Clock3, CreditCard, PhoneCall, Plus, ReceiptText, Wallet, Building2, Layers3, RefreshCw, Info, ChartNoAxesCombined, Gauge, CircleHelp } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import Button from '../ui/Button';
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
  // Do not compare organization-wide usage against a single workspace's limit.
  const limit = workspaceBilling?.monthlyBudgetInr;
  const remaining = workspaceBilling?.remainingBudgetInr;
  const workspaceCapUsed = limit != null && Number.isFinite(limit) && limit > 0
    && remaining != null && Number.isFinite(remaining)
    ? Math.min(100, Math.max(0, ((limit - remaining) / limit) * 100)) : null;
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
        <section className="col-span-12 space-y-4" aria-label="Billing overview">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <span className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-subtle)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">
                  <ChartNoAxesCombined aria-hidden="true" className="h-3.5 w-3.5" /> Your billing at a glance
                </span>
                <h2 className="mt-3 text-xl font-bold tracking-tight text-[var(--text-primary)] sm:text-2xl">See your costs. Stay in control.</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                  Your plan has a regular price. Calls and other services use credits. Here's what we know for {periodLabel}.
                </p>
              </div>
              <Button type="button" size="sm" variant="secondary" icon={RefreshCw} disabled={loading} onClick={onRetry}>Refresh overview</Button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { title: 'Plan price', value: money(organizationPricing?.totalMonthlyInr), detail: 'Monthly, before extra charges', icon: CreditCard },
                { title: 'Usage recorded', value: money(workspaceBilling?.periodSpendInr), detail: 'Across your organization', icon: Activity },
                { title: 'Calls made', value: callCount ?? '—', detail: 'Across all workspaces', icon: PhoneCall },
                { title: 'Time on calls', value: formatCallTime(workspaceBilling?.aiMinutesUsed), detail: 'Total conversation time', icon: Clock3 },
              ].map(({ title, value, detail, icon: Icon }) =>
                <div key={title} className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]/40 p-4">
                  <Icon aria-hidden="true" className="h-5 w-5 text-[var(--accent)]" />
                  <p className="mt-3 text-xs font-medium text-[var(--text-secondary)]">{title}</p>
                  <p className="mt-1 break-words text-2xl font-bold tabular-nums text-[var(--text-primary)]">{value}</p>
                  <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{detail}</p>
                </div>
              )}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { title: 'My subscription', text: 'Check your plan and next payment.', action: 'plan' as const, icon: CreditCard },
              { title: 'My credits', text: 'See how many credits you can still use.', action: 'credits' as const, icon: Wallet },
              { title: 'My payments', text: 'See which payments are being checked.', action: 'payments' as const, icon: ReceiptText },
            ].map(({ title, text, action, icon: Icon }) =>
              <button key={action} type="button" onClick={() => onNavigate(action)}
                className="group flex min-h-28 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 text-left transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
                <span className="rounded-xl bg-[var(--accent-subtle)] p-3 text-[var(--accent)]"><Icon aria-hidden="true" className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[var(--text-primary)]">{title}</span><span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{text}</span></span>
                <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-1" />
              </button>
            )}
          </div>
        </section>
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
        <section className="col-span-12 grid grid-cols-12 gap-4" aria-label="Usage and limits">
          <div className="col-span-12 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 sm:p-6">
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-subtle)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">
              <Gauge aria-hidden="true" className="h-3.5 w-3.5" /> Spending and limits
            </span>
            <h2 className="mt-3 text-xl font-bold text-[var(--text-primary)] sm:text-2xl">Where your usage goes</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              See what your organization used this period. You can also set a separate spending limit for the selected workspace.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { title: 'Usage cost so far', value: money(workspaceBilling?.periodSpendInr), detail: 'All workspaces combined', icon: Activity },
                { title: 'Calls', value: callCount ?? '—', detail: 'Recorded this period', icon: PhoneCall },
                { title: 'Call time', value: formatCallTime(workspaceBilling?.aiMinutesUsed), detail: 'Total speaking time', icon: Clock3 },
                { title: 'AI costs', value: money(workspaceBilling?.aiSpendInr), detail: 'Voice AI and call processing', icon: ChartNoAxesCombined },
              ].map(({ title, value, detail, icon: Icon }) =>
                <div key={title} className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]/40 p-4">
                  <Icon aria-hidden="true" className="h-5 w-5 text-[var(--accent)]" />
                  <p className="mt-3 text-xs font-medium text-[var(--text-secondary)]">{title}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--text-primary)]">{value}</p>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">{detail}</p>
                </div>)}
            </div>
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-[var(--border)] p-4 text-sm">
              <PhoneCall aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" />
              <div>
                <p className="font-semibold text-[var(--text-primary)]">{phoneChargesBillable ? 'Phone provider charges' : 'Phone provider estimate'}: {money(workspaceBilling?.phoneSpendInr)}</p>
                <p className="mt-1 leading-6 text-[var(--text-secondary)]">{phoneChargesBillable ? 'Recorded phone-service cost for this period.' : 'For information only. Your phone provider bills you separately.'}</p>
              </div>
            </div>
          </div>
          <Card padding="sm" className="col-span-12 sm:!p-6">
            <CardHeader title="Your workspace spending limit" subtitle={workspaceBilling?.workspaceName ? `For ${workspaceBilling.workspaceName} only` : 'For the selected workspace only'} icon={Gauge} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-[var(--bg-subtle)] p-4">
                <p className="text-sm text-[var(--text-secondary)]">Monthly limit</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text-primary)]">
                  {!workspaceBilling ? '—' : workspaceBilling.monthlyBudgetInr == null ? 'No limit set' : money(workspaceBilling.monthlyBudgetInr)}
                </p>
              </div>
              <div className="rounded-xl bg-[var(--bg-subtle)] p-4">
                <p className="text-sm text-[var(--text-secondary)]">Room left before the limit</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text-primary)]">
                  {!workspaceBilling || workspaceBilling.monthlyBudgetInr == null ? '—' : money(workspaceBilling.remainingBudgetInr)}
                </p>
              </div>
            </div>
            {workspaceCapUsed !== null && (
              <div className="mt-5">
                <div className="flex items-center justify-between gap-3 text-xs text-[var(--text-secondary)]">
                  <span>How much of this workspace's limit is used</span>
                  <strong className="text-[var(--text-primary)]">{Math.round(workspaceCapUsed)}%</strong>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[var(--bg-subtle)]"
                  role="progressbar" aria-label="Workspace spending limit used" aria-valuenow={Math.round(workspaceCapUsed)} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${workspaceCapUsed}%` }} />
                </div>
              </div>
            )}
            {canManageBudget && workspaceBilling && (
              <div className="mt-5 rounded-xl border border-[var(--border)] p-4">
                <h3 className="text-base font-semibold text-[var(--text-primary)]">Change the monthly limit</h3>
                <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                  Enter a limit for new outgoing calls. Leave the box empty to allow spending without a set limit.
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <label className="min-w-0 flex-1 text-sm font-medium text-[var(--text-secondary)]">
                    Monthly cap in INR
                    <input type="number" min="0" step="0.01" value={budgetDraft}
                      onChange={event => onBudgetDraftChange(event.target.value)} placeholder="No limit"
                      className="mt-1.5 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-subtle)]" />
                  </label>
                  <Button type="button" variant="primary" size="md" loading={budgetSaving} onClick={onSaveBudget}>
                    Save workspace limit
                  </Button>
                </div>
                {budgetError && <p role="alert" className="mt-2 text-xs text-rose-600">{budgetError}</p>}
              </div>
            )}
            <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-[var(--text-secondary)]">
              <CircleHelp aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              Your organization's total usage and this workspace's limit are different numbers. A call already in progress may finish slightly over the limit.
            </p>
          </Card>
        </section>
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
