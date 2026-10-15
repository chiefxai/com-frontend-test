import React from 'react';
import { Card, CardHeader } from '../ui/Card';
import KpiCard from '../ui/KpiCard';
import { CalendarClock, CreditCard, PhoneCall, Wallet, Sparkles } from 'lucide-react';
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
  onNavigate, onOpenSubscriptionTask, usage, callCount, canManageSubscription,
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
        <KpiCard span={{ xs: 12, sm: 6 }} iconPosition="top-left" iconBg="var(--accent-subtle)" iconColor="var(--accent)" label="Plan credits remaining" icon={Wallet}
          value={visibleBalances ? availableCredits(visibleBalances,'subscription') : '—'}
          sub={usesWorkspaceCredits ? 'Available in your subscription workspace' : 'Approved plan credits still in the organization pool'} />
        <KpiCard span={{ xs: 12, sm: 6 }} iconPosition="top-left" iconBg="var(--accent-subtle)" iconColor="var(--accent)" label="Extra credits remaining" icon={CreditCard}
          value={visibleBalances ? availableCredits(visibleBalances,'topup') : '—'}
          sub={usesWorkspaceCredits ? 'Extra credits available in your subscription workspace' : 'Approved top-ups still in the organization pool'} />
        <KpiCard span={{ xs: 12, sm: 6 }} iconPosition="top-left" iconBg="var(--accent-subtle)" iconColor="var(--accent)" label="AI usage cost" icon={Sparkles} value={money(usage?.aiSpendInr)}
          sub="AI voice and post-call processing this period" />
        <KpiCard span={{ xs: 12, sm: 6 }} iconPosition="top-left" iconBg="var(--accent-subtle)" iconColor="var(--accent)" label="Call usage" icon={PhoneCall} value={callCount ?? '—'}
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
              {notice.inGrace
                ? `Payment grace period: ${notice.graceDays} day(s) remaining.`
                : notice.expired ? 'Your plan has expired.'
                : `Your plan ends in ${daysLeft} day(s).`}
              {notice.inGrace && notice.graceEnd &&
                <p className="mt-1 text-xs">Grace deadline: {displayDate(notice.graceEnd)}</p>}
            </div>
          </div>
        </div>}
        <div className="mt-5 flex flex-wrap gap-2">
          {showPay && <Button type="button" variant="primary" size="sm" icon={CreditCard}
            onClick={() => onOpenSubscriptionTask('renew')}>Pay to continue</Button>}
          <Button type="button" variant="secondary" size="sm" onClick={() => onNavigate('plan')}>View my plan</Button>
        </div>
        {errors.length > 0 && !loading &&
          <p role="alert" className="mt-4 text-xs text-amber-700">{errors.join(' ')}</p>}
      </Card>
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
