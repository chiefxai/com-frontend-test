import React from 'react';
import { Activity, Clock3, PhoneCall, Plus, ReceiptText, Wallet, RefreshCw, ChartNoAxesCombined } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import KpiCard from '../ui/KpiCard';
import Button from '../ui/Button';
import OrganizationTopUp, { type BillingPanel } from './OrganizationTopUp';
import BillingOverviewHome from './BillingOverviewHome';
import type { CallLog } from '../../types';
import { formatInr } from '../../lib/pricing';
import { useAuthorization, canAllocateOrganizationCredits } from '../../lib/authorization';
import ManualWorkspaceAllocation from './ManualWorkspaceAllocation';
import Modal from '../ui/Modal';
import SubscriptionRenewal from './SubscriptionRenewal';
import SubscriptionGraceRequest from './SubscriptionGraceRequest';
import WorkspaceAllocatedBilling from './WorkspaceAllocatedBilling';
import { billingClient } from '../../lib/billing/client';
import type { BillingOverview } from '../../lib/billing/types';

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
  { key: 'usage', label: 'Usage', icon: PhoneCall },
  { key: 'credits', label: 'Credits', icon: Wallet },
  { key: 'payments', label: 'Payments', icon: ReceiptText },
];

const descriptions: Record<BillingPanel, string> = {
  dashboard: 'Your subscription, usage and credit balances in one place.',
  plan: 'Your plan, its price, and simple steps to manage it.',
  usage: 'Recorded call costs and usage totals.',
  credits: 'Available credits from your plan and approved top-ups.',
  allocation: 'Review and assign credits to eligible workspaces.',
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
  const [allocationCapability, setAllocationCapability] = React.useState<BillingOverview['allocation'] | null>(null);
  const [allocationCapabilityError, setAllocationCapabilityError] = React.useState(false);
  React.useEffect(() => {
    let current = true;
    if (!authorization?.permissions.includes('billing.organization.read')) return () => { current = false; };
    billingClient.organizationOverview().then(overview => {
      if (!current) return;
      setAllocationCapability(overview.allocation || null);
      setAllocationCapabilityError(false);
    }).catch(() => {
      if (!current) return;
      setAllocationCapability(null);
      setAllocationCapabilityError(true);
    });
    return () => { current = false; };
  }, [authorization?.permissions]);
  // The backend resolves manual mode from effective terms and legacy saved
  // workspace policy. Do not independently infer it from subscriptionTerms:
  // older organizations may have a workspace policy but no billing terms row.
  const canShowAllocation = canAllocate && allocationCapability?.mode === 'manual';
  const canUseManualAllocation = canShowAllocation && allocationCapability?.mode === 'manual'
    && allocationCapability.status === 'ready' && allocationCapability.manualAllocationAllowed;
  React.useEffect(() => {
    if (view === 'allocation' && allocationCapability && !canShowAllocation) onNavigate('credits');
  }, [view, allocationCapability, canShowAllocation, onNavigate]);
  const [renewalDialogOpen, setRenewalDialogOpen] = React.useState(false);
  const [graceDialogOpen, setGraceDialogOpen] = React.useState(false);
  const [topupDialogOpen, setTopupDialogOpen] = React.useState(false);
  const canManageSubscription = Boolean(authorization && authorization.permissions.includes('billing.read') &&
    ['Owner', 'Organization Admin', 'Billing Admin'].includes(authorization.organizationRole || ''));
  const openSubscriptionTask = (task: 'start' | 'renew' | 'upgrade' | 'more-time') => {
    if (task === 'renew') setRenewalDialogOpen(true);
    if (task === 'more-time') setGraceDialogOpen(true);
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
          {sections.filter(row => row.key !== 'allocation' || canShowAllocation).map(({ key, label, icon: Icon }) => (
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
              onClick={() => setTopupDialogOpen(true)}
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

      {view === 'credits' && canAllocate && allocationCapabilityError && (
        <p role="status" className="col-span-12 rounded-lg border border-amber-300/60 bg-amber-500/5 p-3 text-xs text-[var(--text-secondary)]">
          Workspace allocation availability could not be checked. Refresh the billing page to try again.
        </p>
      )}
      {view === 'credits' && canShowAllocation && !canUseManualAllocation && (
        <section className="col-span-12 rounded-xl border border-[var(--border)] p-4" aria-label="Workspace allocation status">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Workspace allocation</h2>
          <p role="status" className="mt-1 text-xs text-[var(--text-secondary)]">
            {allocationCapability?.status === 'review_required'
              ? 'The number of workspaces exceeds this plan’s limit. Review the plan or workspace setup before allocating credits.'
              : 'Workspace allocation is not ready for this plan yet. Check the workspace and subscription setup.'}
          </p>
        </section>
      )}

      {view === 'dashboard' && (
        <>
          <BillingOverviewHome
            onNavigate={onNavigate}
            onOpenCallLogs={onOpenCallLogs}
            callLogs={callLogs}
            pricing={organizationPricing}
            usage={workspaceBilling}
            callCount={callCount}
            phoneChargesBillable={phoneChargesBillable}
            canManageSubscription={canManageSubscription}
            canAllocate={canUseManualAllocation}
            canSubmitPayment={canSubmitPayment}
            loadingUsage={loading}
            onOpenSubscriptionTask={openSubscriptionTask}
          />

        </>
      )}

      {view === 'usage' && (
        <section className="col-span-12 grid grid-cols-12 gap-4" aria-label="Usage">
            <div className="col-span-12 grid grid-cols-12 gap-3">
              {[
                { title: 'Usage cost so far', value: money(workspaceBilling?.periodSpendInr), detail: 'All workspaces combined', icon: Activity },
                { title: 'Calls', value: callCount ?? '—', detail: 'Recorded this period', icon: PhoneCall },
                { title: 'Call time', value: formatCallTime(workspaceBilling?.aiMinutesUsed), detail: 'Total speaking time', icon: Clock3 },
                { title: 'AI costs', value: money(workspaceBilling?.aiSpendInr), detail: 'Voice AI and call processing', icon: ChartNoAxesCombined },
              ].map(({ title, value, detail, icon }) =>
                <KpiCard key={title} span={{ xs: 12, sm: 6, lg: 3 }} 
                  iconBg="var(--accent-subtle)" iconColor="var(--accent)"
                  label={title} value={value} sub={detail} icon={icon} />)}
            </div>
            {rechargeBased && <div className="col-span-12 grid grid-cols-12 gap-3">
              <KpiCard span={{ xs: 12, sm: 6, lg: 4 }} icon={Wallet} 
                iconBg="var(--accent-subtle)" iconColor="var(--accent)"
                label="Call credits ready to use" value={formatInr(Math.max(0,rechargeBalanceInr-rechargeReservedInr))}
                sub="Balance after credits reserved for calls in progress" />
            </div>}
          <Card padding="sm" className="col-span-12 min-w-0 sm:!p-5">
            <CardHeader title="Usage activity breakdown" subtitle="Aggregate charges and call activity for the current billing period" icon={Activity}
              action={onOpenCallLogs ? <Button type="button" size="sm" variant="secondary" onClick={onOpenCallLogs}>View call logs</Button> : undefined} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="border-b border-[var(--border)] text-[var(--text-secondary)]">
                  <tr><th scope="col" className="pb-3 pr-4 font-medium">Activity</th><th scope="col" className="pb-3 pr-4 font-medium">Usage</th><th scope="col" className="pb-3 pr-4 font-medium">Cost</th><th scope="col" className="pb-3 font-medium">Details</th></tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] text-[var(--text-primary)]">
                  <tr><th scope="row" className="py-3 pr-4 font-semibold">AI credits / processing</th><td className="py-3 pr-4">{formatCallTime(workspaceBilling?.aiMinutesUsed)}</td>
                    <td className="py-3 pr-4 font-semibold tabular-nums">{money(workspaceBilling?.aiSpendInr)}</td><td className="py-3 text-[var(--text-secondary)]">Voice AI usage this period</td></tr>
                  <tr><th scope="row" className="py-3 pr-4 font-semibold">Call credits / phone service</th><td className="py-3 pr-4">{callCount ?? '—'} calls</td>
                    <td className="py-3 pr-4 font-semibold tabular-nums">{money(workspaceBilling?.phoneSpendInr)}</td><td className="py-3 text-[var(--text-secondary)]">{phoneChargesBillable ? 'Phone charges included in billing' : 'Provider estimate; billed separately'}</td></tr>
                  <tr><th scope="row" className="py-3 pr-4 font-semibold">Total recorded usage</th><td className="py-3 pr-4">{periodLabel}</td>
                    <td className="py-3 pr-4 font-semibold tabular-nums">{money(workspaceBilling?.periodSpendInr)}</td><td className="py-3 text-[var(--text-secondary)]">Billing-period aggregate; not an additional charge</td></tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-[var(--text-muted)]">These are period-level totals from billing data, not individual credit ledger transactions. Phone provider estimates may be billed separately.</p>
          </Card>

        </section>
      )}

      {(view === 'credits' || view === 'topup' || view === 'payments') && (
        <OrganizationTopUp canSubmit={canSubmitPayment} view={view} onNavigate={onNavigate}
          creditUsage={workspaceBilling ? {
            aiSpendInr: workspaceBilling.aiSpendInr,
            phoneSpendInr: workspaceBilling.phoneSpendInr,
            phoneChargesBillable,
            periodLabel,
          } : null}
          manualAllocationAllowed={Boolean(canUseManualAllocation)} />
      )}
      {canSubmitPayment && <Modal open={topupDialogOpen} onClose={() => setTopupDialogOpen(false)}
        title="Add usage credits" subtitle="Submit a payment reference and receipt for approval."
        maxWidth="max-w-2xl" className="!max-h-[92vh]">
        {topupDialogOpen && <OrganizationTopUp canSubmit={canSubmitPayment} view="topup" embeddedTopup
          onTopupClose={() => setTopupDialogOpen(false)} />}
      </Modal>}
      {canManageSubscription && <>
        <Modal open={renewalDialogOpen} onClose={() => setRenewalDialogOpen(false)}
          title="Renew your plan" subtitle="Get the current renewal price and submit your payment receipt."
          maxWidth="max-w-3xl" className="!max-h-[92vh]">
          <SubscriptionRenewal canSubmit={canSubmitPayment} embedded />
        </Modal>
        <Modal open={graceDialogOpen} onClose={() => setGraceDialogOpen(false)}
          title="Ask for more time" subtitle="Request a later payment deadline from your billing team."
          maxWidth="max-w-3xl" className="!max-h-[92vh]">
          <SubscriptionGraceRequest />
        </Modal>
      </>}
    </div>
  );
}
