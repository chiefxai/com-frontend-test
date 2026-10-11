import React from 'react';
import { Activity, ArrowDownToLine, Clock3, CreditCard, FileText, PhoneCall, Plus, ReceiptText, Wallet } from 'lucide-react';
import Widget from '../ui/Widget';
import KpiCard from '../ui/KpiCard';
import OrganizationTopUp, { type BillingPanel } from './OrganizationTopUp';
import { formatInr } from '../../lib/pricing';

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
  { key: 'payments', label: 'Payments', icon: ReceiptText },
];

const explanations: Record<BillingPanel, string> = {
  dashboard: 'See what your organization pays, uses, and has available at a glance.',
  plan: 'Understand the monthly subscription separately from usage charges.',
  usage: 'Review recorded calling costs and the selected workspace spending limit.',
  credits: 'See available prepaid credits and their sources.',
  topup: 'Request more usage credits with payment proof for admin approval.',
  payments: 'Check payment requests and their verification status.',
};

/**
 * Organization billing console: one consistent navigation and information
 * hierarchy, while the underlying ledger and payment actions stay unchanged.
 * Organization spend and workspace caps intentionally remain separate.
 */
export default function BillingWorkspace({
  view,
  onNavigate,
  workspaceBilling,
  organizationPricing,
  callCount,
  loading,
  error,
  onRetry,
  phoneChargesBillable,
  canSubmitPayment,
  canManageBudget,
  rechargeBased,
  rechargeBalanceInr,
  rechargeReservedInr,
  budgetDraft,
  onBudgetDraftChange,
  onSaveBudget,
  budgetSaving,
  budgetError,
}: BillingWorkspaceProps) {
  const periodLabel = workspaceBilling?.budgetPeriod?.label || 'Current billing period';
  const money = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : formatInr(value);

  return (
    <div className="col-span-12 grid grid-cols-12 content-start gap-4 md:gap-5 xl:gap-6" id="billing-workspace">
      <div className="col-span-12 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)]">
        <div className="flex flex-col gap-3 px-4 pb-3 pt-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">Organization billing</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--text-secondary)]">{explanations[view]}</p>
          </div>
          <span className="w-fit shrink-0 rounded-lg bg-[var(--bg-subtle)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)]">
            {periodLabel}
          </span>
        </div>
        <nav aria-label="Billing sections" className="flex items-center gap-1.5 overflow-x-auto border-t border-[var(--border)] px-3 py-2 sm:px-4">
          {sections.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              aria-current={view === key ? 'page' : undefined}
              onClick={() => onNavigate(key)}
              className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${view === key
                ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'}`}
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
              {label}
            </button>
          ))}
          {canSubmitPayment && (
            <button
              type="button"
              onClick={() => onNavigate('topup')}
              aria-current={view === 'topup' ? 'page' : undefined}
              className={`ml-auto inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${view === 'topup'
                ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                : 'bg-[var(--accent)] text-white hover:opacity-90'}`}
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              Add credits
            </button>
          )}
        </nav>
      </div>

      {error && (
        <div role="alert" className="col-span-12 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/70 bg-amber-50/70 px-4 py-3 text-xs text-amber-900 dark:border-amber-600/40 dark:bg-amber-500/10 dark:text-amber-200">
          <p>Usage and subscription totals are unavailable: {error}. Credit balances may still be available separately.</p>
          <button type="button" onClick={onRetry} className="rounded-lg px-2 py-1 font-semibold underline underline-offset-2 focus-visible:outline-2">Retry</button>
        </div>
      )}

      {view === 'dashboard' && (
        <Widget
          title="At a glance"
          subtitle={`Subscription and recorded usage for ${periodLabel.toLowerCase()}`}
          icon={Activity}
          padding="md"
        >
          <div className="grid grid-cols-12 gap-3 pt-1 sm:gap-4">
            <KpiCard colSpan={3} span={{ xs: 12, sm: 6, lg: 3 }} iconPosition="top-left" icon={CreditCard}
              label="Subscription / month" value={money(organizationPricing?.totalMonthlyInr)}
              sub="Recurring price; usage and tax extra" />
            <KpiCard colSpan={3} span={{ xs: 12, sm: 6, lg: 3 }} iconPosition="top-left" icon={Activity}
              label="Recorded usage" value={money(workspaceBilling?.periodSpendInr)}
              sub="Organization-wide in this period" />
            <KpiCard colSpan={3} span={{ xs: 12, sm: 6, lg: 3 }} iconPosition="top-left" icon={PhoneCall}
              label="Calls recorded" value={callCount ?? '—'}
              sub="Across the organization" />
            <KpiCard colSpan={3} span={{ xs: 12, sm: 6, lg: 3 }} iconPosition="top-left" icon={Clock3}
              label="Conversation time" value={formatCallTime(workspaceBilling?.aiMinutesUsed)}
              sub="Across the organization" />
          </div>
          <p className="mt-4 text-xs leading-5 text-[var(--text-muted)]">
            Subscription price and metered usage are different charges. These are not a final invoice total.
            Credits, payment approvals, and any applicable taxes are handled separately.
          </p>
          {loading && <p role="status" className="mt-2 text-xs text-[var(--text-muted)]">Refreshing billing totals…</p>}
        </Widget>
      )}

      {view === 'plan' && (
        <Widget title="Monthly subscription" subtitle="Recurring platform and workspace subscription costs" icon={CreditCard} padding="md">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-5 py-5">
            <p className="text-xs font-medium text-[var(--text-secondary)]">Organization subscription price</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
              {money(organizationPricing?.totalMonthlyInr)}
              <span className="ml-1 text-sm font-medium text-[var(--text-muted)]">/ month</span>
            </p>
            <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">Excludes metered usage charges and any applicable taxes.</p>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] p-4">
              <p className="text-xs text-[var(--text-muted)]">Included workspaces</p>
              <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{organizationPricing?.workspaceCount ?? '—'}</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-4">
              <p className="text-xs text-[var(--text-muted)]">Additional industry packs</p>
              <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{organizationPricing?.additionalIndustries ?? '—'}</p>
            </div>
          </div>
          <p className="mt-4 text-xs leading-5 text-[var(--text-muted)]">
            Subscription fees are not the same as prepaid usage credits. Visit Credits to view available credit balances.
          </p>
        </Widget>
      )}

      {view === 'usage' && (
        <>
          <Widget title="Calling costs" subtitle={`Organization-wide usage · ${periodLabel}`} icon={PhoneCall} padding="md">
            <div className="grid grid-cols-12 gap-3 pt-1 sm:gap-4">
              <KpiCard colSpan={3} span={{ xs: 12, sm: 6, lg: 3 }} iconPosition="top-left" icon={PhoneCall}
                label="Calls" value={callCount ?? '—'} sub="Recorded in this period" />
              <KpiCard colSpan={3} span={{ xs: 12, sm: 6, lg: 3 }} iconPosition="top-left" icon={Clock3}
                label="Call duration" value={formatCallTime(workspaceBilling?.aiMinutesUsed)} sub="Total conversation time" />
              <KpiCard colSpan={3} span={{ xs: 12, sm: 6, lg: 3 }} iconPosition="top-left" icon={Activity}
                label="AI voice & post-call" value={money(workspaceBilling?.aiSpendInr)} sub="Combined AI processing costs" />
              <KpiCard colSpan={3} span={{ xs: 12, sm: 6, lg: 3 }} iconPosition="top-left" icon={PhoneCall}
                label={phoneChargesBillable ? 'Phone provider charges' : 'Phone provider estimate'}
                value={money(workspaceBilling?.phoneSpendInr)}
                sub={phoneChargesBillable ? 'Recorded phone provider charges' : 'Own provider account; not billed by platform'} />
            </div>
            <p className="mt-4 text-xs leading-5 text-[var(--text-muted)]">
              AI voice and post-call processing are combined above. Phone provider costs are shown separately.
              {phoneChargesBillable ? '' : ' Your own provider charges are informational, not a platform charge.'}
            </p>
          </Widget>

          <Widget title="Spending & limits" subtitle="Organization-wide spending versus a single workspace limit" icon={Wallet} padding="md">
            <div className="grid grid-cols-12 gap-3 pt-1 sm:gap-4">
              <KpiCard colSpan={4} span={{ xs: 12, sm: 6, lg: 4 }} iconPosition="top-left" icon={Activity}
                label="Organization usage spend" value={money(workspaceBilling?.periodSpendInr)}
                sub="Recorded across all workspaces" />
              <KpiCard colSpan={4} span={{ xs: 12, sm: 6, lg: 4 }} iconPosition="top-left" icon={CreditCard}
                label="Selected workspace cap"
                value={!workspaceBilling ? '—' : workspaceBilling.monthlyBudgetInr == null ? 'No cap' : money(workspaceBilling.monthlyBudgetInr)}
                sub={workspaceBilling?.workspaceName || 'Selected workspace'} />
              <KpiCard colSpan={4} span={{ xs: 12, sm: 6, lg: 4 }} iconPosition="top-left" icon={ArrowDownToLine}
                label="Workspace cap remaining"
                value={money(workspaceBilling?.remainingBudgetInr)}
                sub="Reported by the billing service" />
              {rechargeBased && (
                <KpiCard colSpan={4} span={{ xs: 12, sm: 6, lg: 4 }} iconPosition="top-left" icon={Wallet}
                  label="Call balance available"
                  value={formatInr(Math.max(0, rechargeBalanceInr - rechargeReservedInr))}
                  sub="After reservations for active calls" />
              )}
            </div>

            {canManageBudget && workspaceBilling && (
              <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Set the selected workspace's monthly cap</h3>
                  <p className="text-xs leading-5 text-[var(--text-secondary)]">
                    Limit new outbound calling when this workspace reaches its cap. Leave blank for no cap.
                  </p>
                </div>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <label className="min-w-0 flex-1 text-xs font-medium text-[var(--text-secondary)]">
                    Monthly cap in INR
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={budgetDraft}
                      onChange={event => onBudgetDraftChange(event.target.value)}
                      placeholder="No cap"
                      className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-subtle)]"
                    />
                  </label>
                  <button type="button" onClick={onSaveBudget} disabled={budgetSaving}
                    className="h-10 shrink-0 rounded-lg bg-[var(--accent)] px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                    {budgetSaving ? 'Saving…' : 'Save workspace cap'}
                  </button>
                </div>
                {budgetError && <p role="alert" className="mt-2 text-xs text-rose-600">{budgetError}</p>}
              </div>
            )}
            <p className="mt-4 text-xs leading-5 text-[var(--text-muted)]">
              Organization usage and the selected workspace cap are different scopes: do not subtract one from the other.
              An active call may finish slightly over the workspace cap. The organization credit wallet is shared.
            </p>
          </Widget>
        </>
      )}

      {(view === 'dashboard' || view === 'credits' || view === 'topup' || view === 'payments' || view === 'plan') && (
        <OrganizationTopUp canSubmit={canSubmitPayment} view={view} onNavigate={onNavigate} />
      )}
    </div>
  );
}
