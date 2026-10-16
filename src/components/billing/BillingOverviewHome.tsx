import React from 'react';
import { Card, CardHeader } from '../ui/Card';
import KpiCard from '../ui/KpiCard';
import { Building2, CalendarClock, CreditCard, Layers3, PhoneCall, Wallet, Sparkles } from 'lucide-react';
import { billingClient } from '../../lib/billing/client';
import type { BillingOverview, SubscriptionCreditStatus, SubscriptionRenewalResponse, WorkspaceBillingOverview } from '../../lib/billing/types';
import type { CallLog } from '../../types';
import type { BillingPanel } from './OrganizationTopUp';
import type { OrganizationSubscriptionPrice, WorkspaceBillingSnapshot } from './BillingWorkspace';
import { formatInr } from '../../lib/pricing';
import Button from '../ui/Button';
import { availableCredits, daysUntil, displayDate, renewalNotice } from './billingOverviewHelpers';

interface Props {
  onNavigate: (section: BillingPanel) => void;
  onOpenSubscriptionTask: (task: 'start' | 'renew' | 'upgrade' | 'more-time') => void;
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
const money = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? '—' : formatInr(value);

/** Compact billing home: key balances on the left, current plan on the right. */
export default function BillingOverviewHome({
  onNavigate, onOpenSubscriptionTask, pricing, usage, callCount, canManageSubscription,
}: Props) {
  const [overview, setOverview] = React.useState<BillingOverview | null>(null);
  const [workspaceCredits, setWorkspaceCredits] = React.useState<WorkspaceBillingOverview | null>(null);
  const [currentWorkspaceAllocation, setCurrentWorkspaceAllocation] = React.useState<WorkspaceBillingOverview | null>(null);
  const [creditStatus, setCreditStatus] = React.useState<SubscriptionCreditStatus | null>(null);
  const [renewal, setRenewal] = React.useState<SubscriptionRenewalResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [errors, setErrors] = React.useState<string[]>([]);
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setWorkspaceCredits(null);
    setCurrentWorkspaceAllocation(null);
    void Promise.allSettled([
      billingClient.organizationOverview(),
      billingClient.subscriptionCreditStatus(),
      canManageSubscription ? billingClient.subscriptionRenewal() : Promise.resolve(null),
    ]).then(async ([balances, credits, period]) => {
      if (cancelled) return;
      const failures: string[] = [];
      if (balances.status === 'fulfilled') {
        setOverview(balances.value);
        const allocation = balances.value.allocation;
        if (allocation?.mode === 'automatic') {
          if (allocation.status === 'ready' && allocation.workspaceId) {
            try {
              const currentWorkspaceCredits = await billingClient.workspaceOverview(allocation.workspaceId);
              if (currentWorkspaceCredits.workspaceId !== allocation.workspaceId
                  || currentWorkspaceCredits.uninitialized || currentWorkspaceCredits.status !== 'active') {
                throw new Error('The automatically allocated workspace balance is unavailable.');
              }
              if (!cancelled) setWorkspaceCredits(currentWorkspaceCredits);
            } catch {
              failures.push('Workspace credit balances could not be loaded.');
            }
          } else {
            failures.push('Workspace credit balances are not ready yet.');
          }
        } else if (allocation?.mode === 'manual' && usage?.workspaceId) {
          try {
            const selectedWorkspaceAllocation = await billingClient.workspaceOverview(usage.workspaceId);
            if (selectedWorkspaceAllocation.workspaceId !== usage.workspaceId
                || selectedWorkspaceAllocation.uninitialized || selectedWorkspaceAllocation.status !== 'active') {
              throw new Error('The selected workspace allocation is unavailable.');
            }
            if (!cancelled) setCurrentWorkspaceAllocation(selectedWorkspaceAllocation);
          } catch {
            failures.push('Current workspace allocation could not be loaded.');
          }
        }
      } else { setOverview(null); failures.push('Available credits could not be loaded.'); }
      if (credits.status === 'fulfilled') setCreditStatus(credits.value);
      else { setCreditStatus(null); failures.push('Plan information could not be loaded.'); }
      if (period.status === 'fulfilled') setRenewal(period.value);
      else { setRenewal(null); failures.push('Renewal status could not be loaded.'); }
      if (!cancelled) {
        setErrors(failures);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [canManageSubscription, usage?.workspaceId]);

  const now = Date.now();
  const endsAt = renewal?.period?.endsAt || overview?.activePeriod?.endsAt || null;
  const daysLeft = endsAt ? daysUntil(endsAt, now) : null;
  const notice = renewalNotice(renewal, now, Boolean(overview?.nextPeriod));
  const actionRequired = notice.inGrace || notice.expired || (daysLeft != null && daysLeft <= 7);
  const access = renewal?.subscription.accessState;
  const suspended = Boolean(access && ['manual_suspended','security_suspended','billing_suspended'].includes(access));
  const showPay = canManageSubscription && notice.canRenew && actionRequired && !notice.nextPeriodScheduled;
  const planName = creditStatus?.planName || creditStatus?.planId;
  const usesWorkspaceCredits = overview?.allocation?.mode === 'automatic';
  const showWorkspaceAllocation = overview?.allocation?.mode === 'manual';
  const visibleBalances = usesWorkspaceCredits
    ? workspaceCredits?.balances ?? null
    : overview?.balances ?? null;
  const planStatus = notice.inGrace ? 'Payment grace period'
    : suspended ? 'Access restricted' : notice.expired ? 'Plan expired' : 'Current plan';

  return <section className="col-span-12 min-w-0 space-y-4" aria-label="Your billing overview">
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <div className="grid min-w-0 grid-cols-12 gap-3" aria-label="Billing balances and usage">
        <KpiCard span={{ xs: 12, sm: 6 }}  iconBg="var(--accent-subtle)" iconColor="var(--accent)" label="Plan credits remaining" icon={Wallet}
          value={visibleBalances ? availableCredits(visibleBalances,'subscription') : '—'}
          sub={usesWorkspaceCredits ? 'Available in your subscription workspace' : 'Approved plan credits still in the organization pool'} />
        <KpiCard span={{ xs: 12, sm: 6 }}  iconBg="var(--accent-subtle)" iconColor="var(--accent)" label="Extra credits remaining" icon={CreditCard}
          value={visibleBalances ? availableCredits(visibleBalances,'topup') : '—'}
          sub={usesWorkspaceCredits ? 'Extra credits available in your subscription workspace' : 'Approved top-ups still in the organization pool'} />
        <KpiCard span={{ xs: 12, sm: 6 }}  iconBg="var(--accent-subtle)" iconColor="var(--accent)" label="AI usage cost" icon={Sparkles} value={money(usage?.aiSpendInr)}
          sub="AI voice and post-call processing this period" />
        <KpiCard span={{ xs: 12, sm: 6 }}  iconBg="var(--accent-subtle)" iconColor="var(--accent)" label="Call usage" icon={PhoneCall} value={callCount ?? '—'}
          sub={`Calls · ${usage?.aiMinutesUsed == null ? 'Time unavailable' : Math.round(usage.aiMinutesUsed) + ' call minutes'}`} />
      </div>
      <Card padding="none" className="min-w-0 !rounded-2xl !p-5 sm:!p-6" >
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Your plan right now</p>
        <h2 className="mt-2 break-words text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
          {planName || (loading ? 'Checking your plan…' : 'Plan name unavailable')}
        </h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {planStatus}{endsAt ? ` · Ends ${displayDate(endsAt)}` : ''}
        </p>
        {actionRequired && <div role="status" className="mt-5 rounded-xl border border-amber-300/70 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <CalendarClock aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-sm text-[var(--text-primary)]">
              {notice.expired ? (
                <>
                  <p>Your plan has expired.</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]/70 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Renewal</p>
                      <p className="mt-1 font-semibold text-[var(--text-primary)]">
                        {notice.pendingPayment ? 'Payment pending' : notice.canRenew ? 'Renewal available' : 'Contact platform admin'}
                      </p>
                      {notice.canRenew && <p className="mt-1 text-xs text-[var(--text-secondary)]">Renew to restore subscription access.</p>}
                    </div>
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]/70 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Grace time</p>
                      <p className="mt-1 font-semibold text-[var(--text-primary)]">
                        {notice.inGrace ? `${notice.graceDays} day(s) remaining`
                          : renewal?.graceRequest?.status === 'pending' ? 'Request pending' : 'No active grace period'}
                      </p>
                      {notice.inGrace && notice.graceEnd &&
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">Until {displayDate(notice.graceEnd)}</p>}
                    </div>
                  </div>
                </>
              ) : notice.inGrace
                ? `Payment grace period: ${notice.graceDays} day(s) remaining.`
                : `Your plan ends in ${daysLeft} day(s).`}
              {!notice.expired && notice.inGrace && notice.graceEnd &&
                <p className="mt-1 text-xs">Grace deadline: {displayDate(notice.graceEnd)}</p>}
            </div>
          </div>
        </div>}
        <div className="mt-5 flex flex-wrap gap-2">
          {showPay && <Button type="button" variant="primary" size="sm" icon={CreditCard}
            onClick={() => onOpenSubscriptionTask('renew')}>{notice.expired ? 'Renew plan' : 'Pay to continue'}</Button>}
          <Button type="button" variant="secondary" size="sm" onClick={() => document.getElementById('billing-subscription-details')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })}>Subscription details</Button>
        </div>
        {errors.length > 0 && !loading &&
          <p role="alert" className="mt-4 text-xs text-amber-700">{errors.join(' ')}</p>}
      </Card>
    </div>
    <div id="billing-subscription-details" className="grid grid-cols-12 gap-3 scroll-mt-6" aria-label="Subscription pricing and allowances">
      <KpiCard span={{ xs: 12, sm: 6, lg: 4 }} icon={CreditCard}  iconBg="var(--accent-subtle)" iconColor="var(--accent)"
        label="Estimated monthly plan price" value={money(pricing?.totalMonthlyInr)} sub="Before taxes and usage charges" />
      <KpiCard span={{ xs: 12, sm: 6, lg: 4 }} icon={Building2}  iconBg="var(--accent-subtle)" iconColor="var(--accent)"
        label="Workspaces" value={pricing?.workspaceCount ?? '—'} sub="Offices or teams on this plan" />
      <KpiCard span={{ xs: 12, sm: 6, lg: 4 }} icon={Layers3}  iconBg="var(--accent-subtle)" iconColor="var(--accent)"
        label="Extra work types" value={pricing?.additionalIndustries ?? '—'} sub="Additional industries in your plan" />
    </div>
      {showWorkspaceAllocation && <Card padding="sm" className="col-span-12 min-w-0">
        <CardHeader title="Current workspace allocation"
          subtitle={currentWorkspaceAllocation?.workspaceName || usage?.workspaceName || 'Selected workspace'}
          icon={Wallet} />
        {!usage?.workspaceId && <p role="status" className="text-xs text-[var(--text-muted)]">Select a workspace to view its allocation.</p>}
        {usage?.workspaceId && !currentWorkspaceAllocation && <p role="status" className="text-xs text-[var(--text-muted)]">
          {loading ? 'Loading current workspace allocation…' : 'Current workspace allocation is unavailable.'}
        </p>}
        {currentWorkspaceAllocation && <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="border-b border-[var(--border)] text-[var(--text-muted)]">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Credit type</th>
                <th scope="col" className="px-3 py-2 font-semibold">Available</th>
                <th scope="col" className="px-3 py-2 font-semibold">Reserved</th>
                <th scope="col" className="px-3 py-2 font-semibold">Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {currentWorkspaceAllocation.balances.length === 0
                ? <tr><td colSpan={4} className="px-3 py-4 text-[var(--text-muted)]">No credits are allocated to this workspace.</td></tr>
                : currentWorkspaceAllocation.balances.map((balance, index) => (
                  <tr key={balance.kind + '-' + index}>
                    <th scope="row" className="px-3 py-3 font-medium text-[var(--text-primary)]">
                      {balance.kind === 'subscription' ? 'Subscription credits' : 'Extra credits'}
                    </th>
                    <td className="px-3 py-3 text-[var(--text-secondary)]">{availableCredits([balance], balance.kind)}</td>
                    <td className="px-3 py-3 text-[var(--text-secondary)]">{availableCredits([{ ...balance, available: balance.held }], balance.kind)}</td>
                    <td className="px-3 py-3 text-[var(--text-secondary)]">{balance.expiresAt ? displayDate(balance.expiresAt) : 'No expiry'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>}
      </Card>}

  </section>;
}
