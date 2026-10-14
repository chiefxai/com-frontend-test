import React from 'react';
import { Activity, ArrowRight, CalendarClock, CreditCard, ExternalLink, PhoneCall, RefreshCw, Wallet, Building2, Sparkles, Info } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { billingClient } from '../../lib/billing/client';
import type { BillingOverview, SubscriptionCreditStatus, SubscriptionRenewalResponse, BillingAmount } from '../../lib/billing/types';
import type { CallLog } from '../../types';
import type { BillingPanel } from './OrganizationTopUp';
import type { OrganizationSubscriptionPrice, WorkspaceBillingSnapshot } from './BillingWorkspace';
import { formatInr } from '../../lib/pricing';
import Button from '../ui/Button';
import { availableCredits, daysUntil, displayBillingAmount, displayDate, mayPreviewUpgrade, renewalNotice } from './billingOverviewHelpers';

type Addon = { id: string; name: string; status: string; monthlyAmount: BillingAmount; workspaceId: string | null };
type AddonList = { rows?: Addon[] };

interface Props {
  onNavigate: (section: BillingPanel) => void;
  onOpenCallLogs?: () => void;
  callLogs?: CallLog[];
  pricing: OrganizationSubscriptionPrice | null;
  usage: WorkspaceBillingSnapshot | null;
  callCount: number | null;
  phoneChargesBillable: boolean;
  canManageSubscription: boolean;
  canAllocate: boolean;
  canSubmitPayment: boolean;
  loadingUsage: boolean;
}

function money(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : formatInr(value);
}

function Tile({ title, amount, description, icon: Icon }: {
  title: string; amount: React.ReactNode; description: string; icon: React.ElementType;
}) {
  return <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
    <Icon aria-hidden="true" className="h-5 w-5 text-[var(--accent)]" />
    <p className="mt-3 text-sm text-[var(--text-secondary)]">{title}</p>
    <p className="mt-1 break-words text-2xl font-bold tabular-nums text-[var(--text-primary)]">{amount}</p>
    <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{description}</p>
  </div>;
}

/** One organization-scoped dashboard. Failed optional endpoints do not hide known values. */
export default function BillingOverviewHome({
  onNavigate, onOpenCallLogs, callLogs = [], pricing, usage, callCount, phoneChargesBillable,
  canManageSubscription, canAllocate, canSubmitPayment, loadingUsage,
}: Props) {
  const [overview, setOverview] = React.useState<BillingOverview | null>(null);
  const [creditStatus, setCreditStatus] = React.useState<SubscriptionCreditStatus | null>(null);
  const [renewal, setRenewal] = React.useState<SubscriptionRenewalResponse | null>(null);
  const [addons, setAddons] = React.useState<Addon[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    const readAddons = async (): Promise<Addon[]> => {
      const response = await apiFetch('/api/billing/workspace-addons');
      if (!response.ok) throw new Error('Extra workspace fees are unavailable.');
      const body = await response.json() as AddonList;
      return Array.isArray(body.rows) ? body.rows : [];
    };
    const jobs: Promise<unknown>[] = [
      billingClient.organizationOverview(), billingClient.subscriptionCreditStatus(),
      canManageSubscription ? billingClient.subscriptionRenewal() : Promise.resolve(null),
      readAddons(),
    ];
    setLoading(true);
    void Promise.allSettled(jobs).then(results => {
      if (cancelled) return;
      const failures: string[] = [];
      const [balances, credits, period, extras] = results;
      if (balances.status === 'fulfilled') setOverview(balances.value as BillingOverview);
      else { setOverview(null); failures.push('Available credit balances could not be loaded.'); }
      if (credits.status === 'fulfilled') setCreditStatus(credits.value as SubscriptionCreditStatus);
      else { setCreditStatus(null); failures.push('Plan name and monthly credit details could not be loaded.'); }
      if (period.status === 'fulfilled') setRenewal(period.value as SubscriptionRenewalResponse | null);
      else { setRenewal(null); failures.push('Renewal dates and payment-grace status could not be loaded.'); }
      if (extras.status === 'fulfilled') setAddons(extras.value as Addon[]);
      else { setAddons(null); failures.push('Extra workspace fees could not be loaded.'); }
      setErrors(failures);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [canManageSubscription, refreshKey]);

  const nowMs = Date.now();
  const endsAt = renewal?.period?.endsAt || overview?.activePeriod?.endsAt || null;
  const notice = renewalNotice(renewal, nowMs, Boolean(overview?.nextPeriod));
  const daysLeft = endsAt ? daysUntil(endsAt, nowMs) : null;
  const access = renewal?.subscription.accessState;
  const lifecycle = renewal?.subscription.lifecycleStatus;
  const planName = creditStatus?.planName || creditStatus?.planId || null;
  const planId = renewal?.subscription.planId || creditStatus?.planId;
  const hasPaidPlan = Boolean(overview?.activePeriod || renewal?.period);
  const suspended = Boolean(access && ['manual_suspended', 'security_suspended', 'billing_suspended'].includes(access));
  const active = !notice.expired && hasPaidPlan && !suspended && ['active', 'operational', undefined].includes(lifecycle);
  const statusTitle = notice.inGrace ? 'Payment grace period' : suspended ? 'Access restricted'
    : notice.expired ? 'Plan expired' : active ? 'Active plan' : hasPaidPlan ? 'Plan awaiting activation' : 'Plan information unavailable';
  const nextStep = notice.nextPeriodScheduled
    ? 'Your next paid period is already scheduled.'
    : notice.pendingPayment ? 'We are checking your renewal payment.'
    : notice.inGrace ? `You have ${notice.graceDays} day${notice.graceDays === 1 ? '' : 's'} left in your payment grace period.`
    : notice.expired ? 'Your paid period ended. Ask your billing administrator about restoring access.'
    : daysLeft != null && daysLeft <= 7
      ? `Your current plan ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Pay now to continue next month.`
      : daysLeft != null ? `${daysLeft} days until your plan ends.` : 'We could not verify your next billing deadline.';

  const recentCalls = [...callLogs]
    .filter(row => row.createdAt && Number.isFinite(Date.parse(row.createdAt)))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 5);
  const activeAddons = addons?.filter(row => row.status === 'active' || row.status === 'grace' || row.status === 'suspended') || [];
  const pendingAddons = addons?.filter(row => row.status === 'pending') || [];
  const showUpgrade = canManageSubscription && mayPreviewUpgrade(planId);
  const showRenew = canManageSubscription && notice.canRenew;
  const displayPeriod = overview?.activePeriod?.startsAt && overview?.activePeriod?.endsAt
    ? `${displayDate(overview.activePeriod.startsAt)} – ${displayDate(overview.activePeriod.endsAt)}`
    : endsAt ? `Ends ${displayDate(endsAt)}` : 'Period dates unavailable';

  return <section className="col-span-12 space-y-4" aria-label="Your billing overview">
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Your plan right now</p>
          <h2 className="mt-2 text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">{planName || (loading ? 'Checking your plan…' : 'Plan name unavailable')}</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{statusTitle} · {displayPeriod}</p>
        </div>
        <Button type="button" variant="secondary" size="sm" icon={RefreshCw}
          disabled={loading} onClick={() => setRefreshKey(v => v + 1)}>Refresh status</Button>
      </div>
      <div role="status" className={`mt-5 rounded-xl border p-4 ${notice.inGrace || notice.expired || (daysLeft != null && daysLeft <= 7) ? 'border-amber-300/70 bg-amber-500/10' : 'border-[var(--border)] bg-[var(--bg-subtle)]'}`}>
        <div className="flex items-start gap-3">
          <CalendarClock aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" />
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">{nextStep}</p>
            {notice.inGrace && <p className="mt-1 text-xs text-[var(--text-secondary)]">Access deadline: {displayDate(notice.graceEnd)}. Complete payment before this date to avoid losing access.</p>}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {showRenew && <Button type="button" variant="primary" size="sm" icon={CreditCard}
            onClick={() => onNavigate('plan')}>Pay to continue next month</Button>}
          <Button type="button" variant="secondary" size="sm" onClick={() => onNavigate('plan')}>View my plan</Button>
          {showUpgrade && <Button type="button" variant="secondary" size="sm" icon={Sparkles}
            onClick={() => onNavigate('plan')}>See upgrade options</Button>}
        </div>
        {showUpgrade && <p className="mt-2 text-xs text-[var(--text-muted)]">Upgrades are currently a price preview only, not an instant plan change.</p>}
        {canManageSubscription && <details className="mt-3 text-xs text-[var(--text-secondary)]">
          <summary className="cursor-pointer py-1">Other plan options, including a lower-cost plan</summary>
          <p className="mt-2 leading-5">To request a downgrade, contact your platform billing administrator. Downgrades cannot be applied here yet.</p>
        </details>}
      </div>
      {errors.length > 0 && !loading && <p role="alert" className="mt-3 text-xs leading-5 text-amber-700">
        Some information is unavailable: {errors.join(' ')} Refresh or check again later.
      </p>}
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Tile title="Plan credits remaining" icon={Wallet}
        amount={overview ? availableCredits(overview.balances, 'subscription') : '—'}
        description="Approved plan credits still in the organization pool" />
      <Tile title="Extra credits remaining" icon={CreditCard}
        amount={overview ? availableCredits(overview.balances, 'topup') : '—'}
        description="Approved top-ups still in the organization pool" />
      <Tile title="AI usage cost" icon={Sparkles} amount={money(usage?.aiSpendInr)}
        description="AI voice and post-call processing this period" />
      <Tile title="Call usage" icon={PhoneCall} amount={callCount ?? '—'}
        description={`Calls · ${usage?.aiMinutesUsed == null ? 'Time unavailable' : Math.round(usage.aiMinutesUsed) + ' call minutes'}`} />
    </div>
    <p className="text-xs leading-5 text-[var(--text-secondary)]">
      Organization pool balances exclude credits already moved to individual workspaces. Visit Credits or Allocation to see how credits are distributed.
    </p>

    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">What has calling cost?</h3>
        <div className="mt-4 divide-y divide-[var(--border)] text-sm">
          <div className="flex items-center justify-between gap-3 py-3"><span>AI processing</span><strong className="tabular-nums">{money(usage?.aiSpendInr)}</strong></div>
          <div className="flex items-center justify-between gap-3 py-3"><span>{phoneChargesBillable ? 'Phone-service cost' : 'Phone-provider estimate'}</span><strong className="tabular-nums">{money(usage?.phoneSpendInr)}</strong></div>
          <div className="flex items-center justify-between gap-3 py-3"><span>Recorded usage total</span><strong className="tabular-nums">{money(usage?.periodSpendInr)}</strong></div>
        </div>
        {!phoneChargesBillable && <p className="mt-2 text-xs text-[var(--text-secondary)]">Your phone provider charges separately. Its estimated cost is not an extra platform charge.</p>}
        <Button type="button" variant="secondary" size="sm" icon={ArrowRight} className="mt-3"
          onClick={() => onNavigate('usage')}>See usage and limits</Button>
      </div>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Your recent calls</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">Last five calls in the selected workspace, not individual billing ledger charges.</p>
        <div className="mt-3 divide-y divide-[var(--border)]">
          {recentCalls.length ? recentCalls.map(call => <div key={call.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{call.leadName || call.callerNumber || 'Unknown caller'}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{displayDate(call.createdAt)} · {call.direction || 'Call'} · {Math.round(call.duration / 60)} min</p>
            </div>
            <span className="shrink-0 text-xs text-[var(--text-secondary)]">{call.status}</span>
          </div>) : <p className="py-5 text-sm text-[var(--text-secondary)]">No call activity available for this workspace.</p>}
        </div>
        {onOpenCallLogs && <Button type="button" variant="secondary" size="sm" icon={ExternalLink} className="mt-3" onClick={onOpenCallLogs}>Open all call logs</Button>}
      </div>
    </div>

    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
      <div className="flex items-center gap-3"><Building2 aria-hidden="true" className="h-5 w-5 text-[var(--accent)]" /><h3 className="text-base font-semibold text-[var(--text-primary)]">Extra workspace charges</h3></div>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">Extra workspaces can have a separate monthly access fee because each additional workspace needs its own subscription access. These fees are not deducted from calling credits.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Tile title="Estimated base plan price" icon={CreditCard} amount={money(pricing?.totalMonthlyInr)}
          description="Plan pricing estimate; workspace add-on invoices below are tracked separately" />
        <Tile title="Extra workspace access" icon={Building2}
          amount={addons == null ? '—' : activeAddons.length}
          description={addons == null ? 'Invoice details unavailable' : `${pendingAddons.length} more awaiting payment approval`} />
      </div>
      {activeAddons.length > 0 && <div className="mt-3 space-y-2">
        {activeAddons.map(addon => <div key={addon.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] p-3 text-sm">
          <span className="font-medium text-[var(--text-primary)]">{addon.name} <span className="text-xs font-normal text-[var(--text-muted)]">({addon.status})</span></span>
          <strong className="tabular-nums">{displayBillingAmount(addon.monthlyAmount)}/month</strong>
        </div>)}
      </div>}
      {addons && !activeAddons.length && !pendingAddons.length && <p className="mt-3 text-sm text-[var(--text-secondary)]">No separately billed workspace add-ons found.</p>}
      <p className="mt-3 flex items-start gap-2 text-xs text-[var(--text-secondary)]"><Info aria-hidden="true" className="h-4 w-4 shrink-0" /> The total payable amount comes from the approved invoice or renewal quote. Avoid adding these estimates together as if they were a final bill.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {canAllocate && <Button type="button" variant="primary" size="sm" icon={Wallet} onClick={() => onNavigate('allocation')}>Allocate credits to a workspace</Button>}
        {canSubmitPayment && <Button type="button" variant="secondary" size="sm" onClick={() => onNavigate('topup')}>Add more credits</Button>}
        <Button type="button" variant="secondary" size="sm" onClick={() => onNavigate('payments')}>View workspace invoices</Button>
      </div>
    </div>
    {loadingUsage && <p role="status" className="text-xs text-[var(--text-muted)]">Refreshing current usage…</p>}
  </section>;
}
