import React from 'react';
import { Activity, Clock3, CreditCard, PhoneCall, Plus, ReceiptText, Wallet, Building2, Layers3, RefreshCw, Info, ChartNoAxesCombined, Gauge } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import KpiCard from '../ui/KpiCard';
import Button from '../ui/Button';
import OrganizationTopUp, { type BillingPanel } from './OrganizationTopUp';
import BillingOverviewHome from './BillingOverviewHome';
import type { CallLog } from '../../types';
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
  callLogs?: CallLog[];
  onOpenCallLogs?: () => void;
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
  usage: 'Recorded call costs and usage totals.',
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
  callLogs, onOpenCallLogs,
  onRetry, phoneChargesBillable, canSubmitPayment, canManageBudget, rechargeBased,
  rechargeBalanceInr, rechargeReservedInr, budgetDraft, onBudgetDraftChange,
  onSaveBudget, budgetSaving, budgetError,
}: BillingWorkspaceProps) {
  const periodLabel = workspaceBilling?.budgetPeriod?.label || 'Current billing period';
  const { authorization } = useAuthorization();
  const canAllocate = canAllocateOrganizationCredits(authorization);
  const [initialSubscriptionTask, setInitialSubscriptionTask] = React.useState<'start' | 'renew' | 'upgrade' | 'more-time' | null>(null);
  const canManageSubscription = Boolean(authorization && authorization.permissions.includes('billing.read') &&
    ['Owner', 'Organization Admin', 'Billing Admin'].includes(authorization.organizationRole || ''));
  const openSubscriptionTask = (task: 'start' | 'renew' | 'upgrade' | 'more-time') => {
    setInitialSubscriptionTask(task);
    onNavigate('plan');
  };
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

      {view === 'dashboard' && <BillingOverviewHome
        onNavigate={onNavigate}
        onOpenCallLogs={onOpenCallLogs}
        callLogs={callLogs}
        pricing={organizationPricing}
        usage={workspaceBilling}
        callCount={callCount}
        phoneChargesBillable={phoneChargesBillable}
        canManageSubscription={canManageSubscription}
        canAllocate={canAllocate}
        canSubmitPayment={canSubmitPayment}
        loadingUsage={loading}
        onOpenSubscriptionTask={openSubscriptionTask}
      />}

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
              <div className="grid grid-cols-12 gap-3">
                <KpiCard span={{ xs: 6 }} icon={Building2} iconPosition="top-left"
                  iconBg="var(--accent-subtle)" iconColor="var(--accent)"
                  label="Workspaces" value={organizationPricing?.workspaceCount ?? '—'} sub="Offices or teams on this plan" />
                <KpiCard span={{ xs: 6 }} icon={Layers3} iconPosition="top-left"
                  iconBg="var(--accent-subtle)" iconColor="var(--accent)"
                  label="Extra work types" value={organizationPricing?.additionalIndustries ?? '—'} sub="Additional industries in your plan" />
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
            ? <SubscriptionActionCenter canSubmitPayment={canSubmitPayment} initialTask={initialSubscriptionTask} />
            : <p className="col-span-12 rounded-xl border border-[var(--border)] p-4 text-sm text-[var(--text-secondary)]">
                Only your organization's billing administrators can start, renew, or change a subscription.
              </p>}
          <div className="col-span-12 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" icon={Wallet}
              onClick={() => onNavigate('credits')}>View remaining credits</Button>
            <Button type="button" size="sm" variant="secondary" icon={ReceiptText}
              onClick={() => onNavigate('payments')}>Workspace invoices and payments</Button>
          </div>
        </>
      )}

      {view === 'usage' && (
        <section className="col-span-12 grid grid-cols-12 gap-4" aria-label="Usage and limits">
          <Card padding="none" className="col-span-12 !p-5 sm:!p-6">
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-subtle)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">
              <Gauge aria-hidden="true" className="h-3.5 w-3.5" /> Spending and limits
            </span>
            <h2 className="mt-3 text-xl font-bold text-[var(--text-primary)] sm:text-2xl">Where your usage goes</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              See what your organization used this period.
            </p>
            <div className="mt-5 grid grid-cols-12 gap-3">
              {[
                { title: 'Usage cost so far', value: money(workspaceBilling?.periodSpendInr), detail: 'All workspaces combined', icon: Activity },
                { title: 'Calls', value: callCount ?? '—', detail: 'Recorded this period', icon: PhoneCall },
                { title: 'Call time', value: formatCallTime(workspaceBilling?.aiMinutesUsed), detail: 'Total speaking time', icon: Clock3 },
                { title: 'AI costs', value: money(workspaceBilling?.aiSpendInr), detail: 'Voice AI and call processing', icon: ChartNoAxesCombined },
              ].map(({ title, value, detail, icon }) =>
                <KpiCard key={title} span={{ xs: 12, sm: 6, lg: 3 }} iconPosition="top-left"
                  iconBg="var(--accent-subtle)" iconColor="var(--accent)"
                  label={title} value={value} sub={detail} icon={icon} />)}
            </div>
            {rechargeBased && <div className="mt-4 grid grid-cols-12 gap-3">
              <KpiCard span={{ xs: 12, sm: 6, lg: 4 }} icon={Wallet} iconPosition="top-left"
                iconBg="var(--accent-subtle)" iconColor="var(--accent)"
                label="Call credits ready to use" value={formatInr(Math.max(0,rechargeBalanceInr-rechargeReservedInr))}
                sub="Balance after credits reserved for calls in progress" />
            </div>}
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-[var(--border)] p-4 text-sm">
              <PhoneCall aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" />
              <div>
                <p className="font-semibold text-[var(--text-primary)]">{phoneChargesBillable ? 'Phone provider charges' : 'Phone provider estimate'}: {money(workspaceBilling?.phoneSpendInr)}</p>
                <p className="mt-1 leading-6 text-[var(--text-secondary)]">{phoneChargesBillable ? 'Recorded phone-service cost for this period.' : 'For information only. Your phone provider bills you separately.'}</p>
              </div>
            </div>
          </Card>

        </section>
      )}

      {view === 'allocation' && (canAllocate
        ? <ManualWorkspaceAllocation />
        : <p role="alert" className="col-span-12 px-3 py-4 text-xs text-[var(--text-secondary)]">
            Only organization administrators can allocate credits to workspaces.
          </p>)}
      {(view === 'credits' || view === 'topup' || view === 'payments') && (
        <OrganizationTopUp canSubmit={canSubmitPayment} view={view} onNavigate={onNavigate} />
      )}
    </div>
  );
}
