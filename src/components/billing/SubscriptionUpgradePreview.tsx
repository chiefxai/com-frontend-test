import React from 'react';
import { ArrowUpRight, CircleAlert } from 'lucide-react';
import { BillingApiError, billingClient, newBillingIdempotencyKey } from '../../lib/billing/client';
import type { SubscriptionUpgradeResponse } from '../../lib/billing/types';
import { useAuthorization } from '../../lib/authorization';
import { Card, CardHeader } from '../ui/Card';
import Button from '../ui/Button';
import { subscriptionAmountText, subscriptionDateText } from './InitialSubscriptionPurchase';

const FIELD = 'mt-1 block h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-subtle)]';

/** Upgrade preview only: the server intentionally exposes no payment or fulfillment path yet. */
export default function SubscriptionUpgradePreview() {
  const { can, authorization } = useAuthorization();
  const billingAdmin = can('billing.read') && ['Owner', 'Organization Admin', 'Billing Admin'].includes(authorization?.organizationRole || '');
  const [planId, setPlanId] = React.useState('');
  const [planVersion, setPlanVersion] = React.useState('');
  const [result, setResult] = React.useState<SubscriptionUpgradeResponse | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const preview = async (event: React.FormEvent) => {
    event.preventDefault();
    const version = Number(planVersion);
    if (!planId.trim() || !Number.isSafeInteger(version) || version < 1 || busy) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const next = await billingClient.createSubscriptionUpgradeQuote({ targetPlanId: planId.trim(), targetPlanVersion: version },
        { idempotencyKey: newBillingIdempotencyKey() });
      setResult(next);
    } catch (cause) {
      if (cause instanceof BillingApiError && cause.code === 'SUBSCRIPTION_UPGRADE_PREVIEW_DISABLED') {
        setError('Upgrade previews are not enabled for this organization yet. Contact your platform administrator.');
      } else setError(cause instanceof Error ? cause.message : 'Could not prepare the upgrade preview.');
    } finally { setBusy(false); }
  };

  if (!billingAdmin) return null;
  const quote = result?.quote;
  return <Card padding="sm" className="col-span-12 sm:!p-5">
    <CardHeader title="Upgrade subscription plan" subtitle="Preview an immediate upgrade using a published plan version." icon={ArrowUpRight} />
    <p className="text-xs text-[var(--text-secondary)]">The plan catalog is not exposed to this endpoint, so enter the exact plan ID and published version supplied by your platform administrator.</p>
    <form onSubmit={preview} className="mt-3 grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
      <label className="text-xs font-medium text-[var(--text-secondary)]">Target plan ID
        <input className={FIELD} value={planId} onChange={event => setPlanId(event.target.value)} placeholder="e.g. enterprise" required maxLength={120} />
      </label>
      <label className="text-xs font-medium text-[var(--text-secondary)]">Published version
        <input className={FIELD} type="number" min="1" step="1" value={planVersion} onChange={event => setPlanVersion(event.target.value)} placeholder="1" required />
      </label>
      <Button type="submit" size="sm" variant="primary" loading={busy} disabled={busy || !planId.trim() || !planVersion}>Preview upgrade</Button>
    </form>
    {error && <p role="alert" className="mt-3 rounded-lg border border-amber-300/60 bg-amber-500/5 p-3 text-xs text-amber-800">{error}</p>}
    {quote && <div className="mt-4 space-y-3 rounded-xl border border-[var(--border)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h3 className="text-sm font-semibold">{quote.plan.id} · version {quote.plan.version}</h3><p className="mt-1 text-[11px] text-[var(--text-muted)]">Quote {quote.quoteId} · valid until {subscriptionDateText(quote.validUntil)}</p></div>
        <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-800">Preview only · not payable</span>
      </div>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-[var(--bg-subtle)] p-3"><dt className="text-[11px] text-[var(--text-muted)]">Amount due now (proration + tax)</dt><dd className="mt-1 text-sm font-semibold">{subscriptionAmountText(quote.paymentAmount)}</dd></div>
        <div className="rounded-lg bg-[var(--bg-subtle)] p-3"><dt className="text-[11px] text-[var(--text-muted)]">Incremental credits for remaining period</dt><dd className="mt-1 text-sm font-semibold">{subscriptionAmountText(quote.adjustment.incrementalIncludedCredits)}</dd></div>
        <div className="rounded-lg bg-[var(--bg-subtle)] p-3"><dt className="text-[11px] text-[var(--text-muted)]">New recurring monthly fee</dt><dd className="mt-1 text-sm font-semibold">{subscriptionAmountText(quote.adjustment.targetRecurringPrice as { asset: string; units: string; scale: number })}</dd></div>
      </dl>
      <div role="status" className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-xs text-[var(--text-secondary)]">
        <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <p>This quote cannot be paid or applied yet. Platform approval and upgrade fulfillment are not implemented. Your current plan and credits remain unchanged. The upgraded plan would anchor to the current period end ({subscriptionDateText(quote.adjustment.renewalAnchorAt)}).</p>
      </div>
      {quote.expired && <p role="status" className="text-xs font-medium text-rose-700">This preview has expired. Create a new preview before relying on its amount.</p>}
      <p className="text-[11px] text-[var(--text-muted)]">Preview amount: {subscriptionAmountText(quote.paymentAmount)} · Tax: {subscriptionAmountText(quote.totalTax)} · Credits issued only after an approved upgrade is implemented.</p>
    </div>}
  </Card>;
}
