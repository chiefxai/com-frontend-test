import React from 'react';
import { CalendarClock, CreditCard, ShieldAlert } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';

/** Exact monetary representation shared by the subscription UI adapter. */
export interface SubscriptionMoney {
  asset: string;
  units: string;
  scale: number;
}

export type OrganizationSubscriptionPeriodState =
  | 'awaiting_payment' | 'scheduled' | 'active' | 'expired' | 'cancelled';
export type OrganizationSubscriptionPaymentState =
  | 'submitted' | 'needs_information' | 'approved' | 'rejected' | 'scheduled' | 'fulfilled';
export type OrganizationSubscriptionGraceState =
  | 'requested' | 'approved' | 'denied' | 'revoked' | 'expired';
export type OrganizationSubscriptionAccessState =
  | 'operational' | 'billing_recovery' | 'billing_suspended' | 'manual_suspended' | 'security_suspended';

export interface OrganizationSubscriptionView {
  planName: string | null;
  periodState: OrganizationSubscriptionPeriodState | null;
  paymentState: OrganizationSubscriptionPaymentState | null;
  accessState: OrganizationSubscriptionAccessState;
  periodStartsAt: string | null;
  periodEndsAt: string | null;
  paymentDeadline: string | null;
  recurringFee: SubscriptionMoney | null;
  includedCredits: SubscriptionMoney | null;
  issuedCredits: SubscriptionMoney | null;
  grace: { state: OrganizationSubscriptionGraceState; grantedUntil: string | null } | null;
}

export interface OrganizationSubscriptionProps {
  /** Values and action availability must come from the organization-scoped API. */
  subscription: OrganizationSubscriptionView | null;
  loading?: boolean;
  error?: string;
  /** Server-authorized actions are passed in; the component does not infer eligibility from dates. */
  allowedActions?: Partial<Record<'purchase' | 'renew' | 'upgrade' | 'request_grace', boolean>>;
  onAction?: (action: 'purchase' | 'renew' | 'upgrade' | 'request_grace') => void;
}

function money(value: SubscriptionMoney | null): string {
  if (!value || !/^\d+$/.test(value.units) || !Number.isInteger(value.scale) || value.scale < 0) return '—';
  const divisor = 10n ** BigInt(value.scale);
  const units = BigInt(value.units);
  const whole = units / divisor;
  const fraction = units % divisor;
  const formatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: value.asset, minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const wholeText = formatter.format(whole);
  if (!value.scale) return wholeText;
  const decimal = new Intl.NumberFormat('en-IN').formatToParts(1.1).find(part => part.type === 'decimal')?.value || '.';
  return `${wholeText}${decimal}${fraction.toString().padStart(value.scale, '0')}`;
}

function localDate(value: string | null): string {
  if (!value || Number.isNaN(Date.parse(value))) return '—';
  const date = new Date(value);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)} (${zone})`;
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-lg border border-[var(--border)] p-3">
    <dt className="text-[11px] text-[var(--text-muted)]">{label}</dt>
    <dd className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{value}</dd>
  </div>;
}

/** Presentational foundation for subscription lifecycle and billing recovery. */
export default function OrganizationSubscription({ subscription, loading = false, error = '', allowedActions = {}, onAction }: OrganizationSubscriptionProps) {
  return <section aria-label="Organization subscription" className="space-y-4">
    {error && <p role="alert" className="rounded-lg border border-rose-300/60 p-3 text-xs text-rose-700">{error}</p>}
    {loading && <p role="status" className="text-xs text-[var(--text-muted)]">Loading subscription details…</p>}
    {!loading && !subscription && <Card padding="sm">
      <CardHeader title="Organization subscription" subtitle="Subscription details are not available yet." icon={CreditCard} />
    </Card>}
    {subscription && <Card padding="sm" className="sm:!p-5">
      <CardHeader title="Organization subscription" subtitle={subscription.planName || 'Plan details'} icon={CreditCard} />
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Detail label="Period status" value={subscription.periodState || '—'} />
        <Detail label="Payment status" value={subscription.paymentState || '—'} />
        <Detail label="Access status" value={subscription.accessState} />
        <Detail label="Paid period starts" value={localDate(subscription.periodStartsAt)} />
        <Detail label="Paid period ends" value={localDate(subscription.periodEndsAt)} />
        <Detail label="Payment deadline" value={localDate(subscription.paymentDeadline)} />
        <Detail label="Recurring subscription fee" value={money(subscription.recurringFee)} />
        <Detail label="Included monthly credits" value={money(subscription.includedCredits)} />
        <Detail label="Credits issued this period" value={money(subscription.issuedCredits)} />
      </dl>
      {subscription.grace && <div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--border)] p-3 text-xs text-[var(--text-secondary)]">
        <CalendarClock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Grace request: {subscription.grace.state}. Approved through: {localDate(subscription.grace.grantedUntil)}.</p>
      </div>}
      {['billing_recovery', 'billing_suspended'].includes(subscription.accessState) && <div role="status" className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-xs text-[var(--text-secondary)]">
        <ShieldAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p>Billing recovery access is available. Payment or grace actions are shown only when authorized by the server.</p>
      </div>}
      {['manual_suspended', 'security_suspended'].includes(subscription.accessState) && <div role="status" className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-xs text-[var(--text-secondary)]">
        <ShieldAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p>Organization access is restricted for a reason separate from subscription billing.</p>
      </div>}
      <div className="mt-4 flex flex-wrap gap-2">
        {(['purchase', 'renew', 'upgrade', 'request_grace'] as const).filter(action => allowedActions[action]).map(action =>
          <button key={action} type="button" onClick={() => onAction?.(action)}
            className="min-h-10 rounded-lg bg-[var(--accent)] px-4 text-xs font-semibold text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
            {{ purchase: 'Purchase subscription', renew: 'Renew subscription', upgrade: 'Upgrade plan', request_grace: 'Request grace time' }[action]}
          </button>)}
      </div>
    </Card>}
  </section>;
}
