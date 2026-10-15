import React from 'react';
import { Card } from '../ui/Card';
import { CalendarClock, CreditCard, PhoneCall, Wallet, Sparkles } from 'lucide-react';
import { billingClient } from '../../lib/billing/client';
import type { BillingOverview, SubscriptionCreditStatus, SubscriptionRenewalResponse } from '../../lib/billing/types';
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

function Tile({ title, amount, description, icon: Icon }: {
  title: string; amount: React.ReactNode; description: string; icon: React.ElementType;
}) {
  return <Card padding="none" className="!p-4 min-w-0">
    <Icon aria-hidden="true" className="h-5 w-5 text-[var(--accent)]" />
    <p className="mt-3 text-sm text-[var(--text-secondary)]">{title}</p>
    <p className="mt-1 break-words text-2xl font-bold tabular-nums text-[var(--text-primary)]">{amount}</p>
    <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{description}</p>
  </Card>;
}

/** Compact billing home: key balances on the left, current plan on the right. */
export default function BillingOverviewHome({
  onNavigate, onOpenSubscriptionTask, usage, callCount, canManageSubscription,
}: Props) {
  const [overview, setOverview] = React.useState<BillingOverview | null>(null);
  const [creditStatus, setCreditStatus] = React.useState<SubscriptionCreditStatus | null>(null);
  const [renewal, setRenewal] = React.useState<SubscriptionRenewalResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [errors, setErrors] = React.useState<string[]>([]);
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.allSettled([
      billingClient.organizationOverview(),
      billingClient.subscriptionCreditStatus(),
      canManageSubscription ? billingClient.subscriptionRenewal() : Promise.resolve(null),
    ]).then(([balances, credits, period]) => {
      if (cancelled) return;
      const failures: string[] = [];
      if (balances.status === 'fulfilled') setOverview(balances.value);
      else { setOverview(null); failures.push('Available credits could not be loaded.'); }
      if (credits.status === 'fulfilled') setCreditStatus(credits.value);
      else { setCreditStatus(null); failures.push('Plan information could not be loaded.'); }
      if (period.status === 'fulfilled') setRenewal(period.value);
      else { setRenewal(null); failures.push('Renewal status could not be loaded.'); }
      setErrors(failures);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [canManageSubscription]);

  const now = Date.now();
  const endsAt = renewal?.period?.endsAt || overview?.activePeriod?.endsAt || null;
  const daysLeft = endsAt ? daysUntil(endsAt, now) : null;
  const notice = renewalNotice(renewal, now, Boolean(overview?.nextPeriod));
  const actionRequired = notice.inGrace || notice.expired || (daysLeft != null && daysLeft <= 7);
  const access = renewal?.subscription.accessState;
  const suspended = Boolean(access && ['manual_suspended','security_suspended','billing_suspended'].includes(access));
  const showPay = canManageSubscription && notice.canRenew && actionRequired && !notice.nextPeriodScheduled;
  const planName = creditStatus?.planName || creditStatus?.planId;
  const planStatus = notice.inGrace ? 'Payment grace period'
    : suspended ? 'Access restricted' : notice.expired ? 'Plan expired' : 'Current plan';

  return <section className="col-span-12 min-w-0 space-y-4" aria-label="Your billing overview">
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Billing balances and usage">
        <Tile title="Plan credits remaining" icon={Wallet}
          amount={overview ? availableCredits(overview.balances,'subscription') : '—'}
          description="Approved plan credits still in the organization pool" />
        <Tile title="Extra credits remaining" icon={CreditCard}
          amount={overview ? availableCredits(overview.balances,'topup') : '—'}
          description="Approved top-ups still in the organization pool" />
        <Tile title="AI usage cost" icon={Sparkles} amount={money(usage?.aiSpendInr)}
          description="AI voice and post-call processing this period" />
        <Tile title="Call usage" icon={PhoneCall} amount={callCount ?? '—'}
          description={`Calls · ${usage?.aiMinutesUsed == null ? 'Time unavailable' : Math.round(usage.aiMinutesUsed) + ' call minutes'}`} />
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
  </section>;
}
