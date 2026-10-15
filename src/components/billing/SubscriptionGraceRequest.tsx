import React from 'react';
import { CalendarClock, RefreshCw, ShieldAlert } from 'lucide-react';
import { BillingApiError, billingClient, newBillingIdempotencyKey } from '../../lib/billing/client';
import type { SubscriptionGraceResponse } from '../../lib/billing/types';
import { useAuthorization } from '../../lib/authorization';
import { Card, CardHeader } from '../ui/Card';
import Button from '../ui/Button';
import { subscriptionDateText } from './InitialSubscriptionPurchase';

function localInputDate(isoValue: string | null): string {
  if (!isoValue || Number.isNaN(Date.parse(isoValue))) return '';
  const date = new Date(isoValue);
  const part = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`;
}

export default function SubscriptionGraceRequest() {
  const { can, authorization } = useAuthorization();
  const billingAdmin = can('billing.read') && can('billing.organization.read')
    && ['Owner', 'Organization Admin', 'Billing Admin'].includes(authorization?.organizationRole || '');
  const [data, setData] = React.useState<SubscriptionGraceResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [requestedUntil, setRequestedUntil] = React.useState('');
  const [justification, setJustification] = React.useState('');
  const [operationKey, setOperationKey] = React.useState(newBillingIdempotencyKey);

  const refresh = React.useCallback(async () => {
    setLoading(true); setError('');
    try {
      setData(await billingClient.subscriptionGraceRequests());
    } catch (cause) {
      setData(null);
      const message = cause instanceof Error ? cause.message : 'Could not load grace request status.';
      setError(cause instanceof BillingApiError && cause.status === 503
        ? `${message} This action is unavailable until platform operations enables it.` : message);
    } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { if (billingAdmin) void refresh(); else setLoading(false); }, [billingAdmin, refresh]);

  const eligibility = data?.eligibility;
  const minBase = eligibility?.currentRestrictionDeadline || eligibility?.currentPeriodEndsAt || null;
  const minInput = localInputDate(minBase);
  const maxInput = localInputDate(eligibility?.maximumUntil || null);
  const request = eligibility?.currentRequest || data?.items?.find(item => item.periodId === eligibility?.currentPeriodId) || null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!eligibility?.requestEligible || !eligibility.currentPeriodId || busy || !requestedUntil || justification.trim().length < 1) return;
    const requestedDate = new Date(requestedUntil);
    const requestedTime = requestedDate.getTime();
    const now = Date.now();
    if (!Number.isFinite(requestedTime) || requestedTime <= now
      || (minBase && requestedTime <= Date.parse(minBase))
      || (eligibility.maximumUntil && requestedTime > Date.parse(eligibility.maximumUntil))) {
      setError(`Choose a future date after the current billing deadline and no later than ${subscriptionDateText(eligibility.maximumUntil)}.`);
      return;
    }
    if (justification.trim().length > 2000) { setError('Reason must be 2,000 characters or fewer.'); return; }
    setBusy(true); setError(''); setSuccess('');
    try {
      await billingClient.submitSubscriptionGraceRequest({ periodId: eligibility.currentPeriodId,
        requestedUntil: requestedDate.toISOString(), justification: justification.trim(), expectedVersion: eligibility.subscriptionVersion },
      { idempotencyKey: operationKey });
      setSuccess('Your request was sent. Your deadline stays the same unless an administrator approves it.');
      setRequestedUntil(''); setJustification(''); setOperationKey(newBillingIdempotencyKey());
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not submit the grace request. Retry the same request safely.'); }
    finally { setBusy(false); }
  };

  if (!billingAdmin) return null;
  return <Card padding="sm" className="col-span-12 sm:!p-5">
    <CardHeader title="Need more time to pay?" subtitle="Ask your billing team to move your deadline." icon={CalendarClock} />
    {loading && <p role="status" className="text-xs text-[var(--text-muted)]">Checking if you can ask for more time…</p>}
    {error && <p role="alert" className="mt-3 rounded-lg border border-rose-300/60 bg-rose-500/5 p-3 text-xs text-rose-700">{error}</p>}
    {success && <p role="status" className="mt-3 rounded-lg border border-emerald-300/60 bg-emerald-500/5 p-3 text-xs text-emerald-800">{success}</p>}
    {!loading && data && <div className="mt-3 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] p-3 text-xs">
        <div><p className="font-semibold">{eligibility?.requestEligible ? 'You can ask for more time' : request ? `Your request: ${request.status}` : 'You cannot ask for more time with this plan right now'}</p>
          <p className="mt-1 text-[var(--text-muted)]">Your current deadline: {subscriptionDateText(eligibility?.currentRestrictionDeadline || eligibility?.currentPeriodEndsAt || null)}</p>
          {eligibility?.maximumUntil && <p className="mt-1 text-[var(--text-muted)]">Latest date you can ask for: {subscriptionDateText(eligibility.maximumUntil)}</p>}</div>
        <Button type="button" size="sm" variant="secondary" icon={RefreshCw} disabled={loading || busy} onClick={() => void refresh()}>Refresh</Button>
      </div>
      {request && <div className="rounded-lg bg-[var(--bg-subtle)] p-3 text-xs text-[var(--text-secondary)]">
        <p className="font-semibold">Your request: {request.status}</p>
        <p className="mt-1">You asked for {subscriptionDateText(request.requestedUntil)}{request.grantedUntil ? ` · Approved until ${subscriptionDateText(request.grantedUntil)}` : ''}</p>
        <p className="mt-1">Reason: {request.justification}</p>
      </div>}
      {eligibility?.requestEligible && !request && <form onSubmit={submit} className="space-y-3 rounded-xl border border-[var(--border)] p-4">
        <div className="flex items-start gap-2 text-xs text-[var(--text-secondary)]"><ShieldAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><p>Choose a date before the limit shown above. Asking does not extend your plan automatically, and it does not add credits.</p></div>
        <label className="block text-xs font-medium text-[var(--text-secondary)]">New deadline you are asking for ({Intl.DateTimeFormat().resolvedOptions().timeZone})
          <input className="mt-1.5 block h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 text-sm" type="datetime-local" required disabled={busy} min={minInput || undefined} max={maxInput || undefined} value={requestedUntil} onChange={event => { setRequestedUntil(event.target.value); setOperationKey(newBillingIdempotencyKey()); }} />
          <span className="mt-1 block text-[11px] text-[var(--text-muted)]">Must be after {subscriptionDateText(minBase)} and on or before {subscriptionDateText(eligibility.maximumUntil)}.</span>
        </label>
        <label className="block text-xs font-medium text-[var(--text-secondary)]">Why do you need more time?
          <textarea className="mt-1.5 block w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm" required minLength={1} maxLength={2000} rows={3} disabled={busy} value={justification} onChange={event => { setJustification(event.target.value); setOperationKey(newBillingIdempotencyKey()); }} placeholder="Explain why additional time is needed." />
        </label>
        <Button type="submit" size="sm" variant="primary" loading={busy} disabled={busy || !requestedUntil || !justification.trim()}>Send request for more time</Button>
      </form>}
    </div>}
  </Card>;
}
