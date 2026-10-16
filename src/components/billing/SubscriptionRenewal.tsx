import React from 'react';
import { AlertCircle, CalendarClock, CreditCard, RefreshCw } from 'lucide-react';
import { BillingApiError, billingClient, newBillingIdempotencyKey } from '../../lib/billing/client';
import type { SubscriptionRenewalResponse } from '../../lib/billing/types';
import { useAuthorization } from '../../lib/authorization';
import { Card, CardHeader } from '../ui/Card';
import Button from '../ui/Button';
import { subscriptionAmountText } from './InitialSubscriptionPurchase';

export default function SubscriptionRenewal({ canSubmit = false, embedded = false }: { canSubmit?: boolean; embedded?: boolean }) {
  const { can, authorization } = useAuthorization();
  const billingAdmin = can('billing.read') && ['Owner', 'Organization Admin', 'Billing Admin'].includes(authorization?.organizationRole || '');
  const [data, setData] = React.useState<SubscriptionRenewalResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [notFound, setNotFound] = React.useState(false);
  const [quoteKey, setQuoteKey] = React.useState(newBillingIdempotencyKey);
  const [paymentKey, setPaymentKey] = React.useState(newBillingIdempotencyKey);
  const [reference, setReference] = React.useState('');
  const [note, setNote] = React.useState('');
  const [proof, setProof] = React.useState<File | null>(null);
  const [targetPlanId, setTargetPlanId] = React.useState('');
  const [acknowledgeFeatureLoss, setAcknowledgeFeatureLoss] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setLoading(true); setError(''); setNotFound(false);
    try { setData(await billingClient.subscriptionRenewal()); }
    catch (cause) {
      setData(null);
      if (cause instanceof BillingApiError && cause.status === 404) setNotFound(true);
      else setError(cause instanceof Error ? cause.message : 'Could not load renewal status.');
    } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { if (billingAdmin) void refresh(); else setLoading(false); }, [billingAdmin, refresh]);

  const createQuote = async () => {
    if (!billingAdmin || busy || data?.period?.renewalEligible !== true || data.quote?.pendingPayment) return;
    const selected = data.availablePlans?.find(plan => plan.planId === targetPlanId) || null;
    if (data.period.isTrial && !selected) { setError('Choose a subscription plan to continue after the trial.'); return; }
    if (selected?.impact?.conflicts.length) { setError('The selected plan cannot support your current organization inventory.'); return; }
    if (selected?.impact?.removedModules.length && !acknowledgeFeatureLoss) { setError('Confirm feature loss and backup guidance before requesting this plan.'); return; }
    setBusy(true); setError(''); setSuccess('');
    try {
      const next = await billingClient.createSubscriptionRenewalQuote(selected ? { targetPlanId: selected.planId, targetPlanVersion: selected.planVersion, acknowledgeFeatureLoss } : {}, { idempotencyKey: quoteKey });
      setData(next); setQuoteKey(newBillingIdempotencyKey());
      setSuccess('Renewal price is ready. Add your payment reference and receipt below.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not prepare the renewal quote. Retry to try again safely.'); }
    finally { setBusy(false); }
  };

  const submitPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    const quote = data?.quote;
    if (!quote?.payable || quote.pendingPayment || !data?.payment.submissionEnabled || !canSubmit || !proof || !reference.trim()) return;
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(proof.type) || proof.size === 0 || proof.size > 10 * 1024 * 1024) {
      setError('Choose a PDF, JPG, PNG or WEBP payment receipt up to 10 MB.'); return;
    }
    setBusy(true); setError(''); setSuccess('');
    try {
      await billingClient.submitPaymentWithProof({ schemaVersion: 1, purpose: 'subscription', quoteId: quote.quoteId,
        expectedAmount: quote.paymentAmount, paymentReference: reference.trim(), ...(note.trim() ? { payerNote: note.trim() } : {}) }, proof,
      { idempotencyKey: paymentKey });
      setSuccess('We have your receipt. Your plan will renew after your payment is approved and the next period starts.');
      setReference(''); setNote(''); setProof(null); setPaymentKey(newBillingIdempotencyKey());
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not submit renewal proof. Retry the same submission safely.'); }
    finally { setBusy(false); }
  };

  if (!billingAdmin) return null;
  const quote = data?.quote;
  const eligible = data?.period?.renewalEligible === true;
  const selectedPlan = data?.availablePlans?.find(plan => plan.planId === targetPlanId);
  const removedModules = selectedPlan?.impact?.removedModules || [];
  const selectionBlocked = Boolean(selectedPlan?.impact?.conflicts.length);
  const canPay = Boolean(quote?.payable && !quote.pendingPayment && data?.payment.submissionEnabled && canSubmit);

  return <div className={embedded ? "min-w-0" : "col-span-12"}>
    {!embedded && <CardHeader title="Renew your plan" subtitle="Review the payment steps and submit your receipt." icon={CalendarClock} />}
    {loading && <p role="status" className="text-sm text-[var(--text-muted)]">Checking when you can renew…</p>}
    {error && <p role="alert" className="mt-3 rounded-lg border border-rose-300/60 bg-rose-500/5 p-3 text-xs text-rose-700">{error}</p>}
    {success && <p role="status" className="mt-3 rounded-lg border border-emerald-300/60 bg-emerald-500/5 p-3 text-xs text-emerald-800">{success}</p>}
    {!loading && notFound && <p role="status" className="mt-3 text-xs text-[var(--text-secondary)]">We could not find a plan to renew yet. If you are starting a new plan, choose “Start a new plan” above.</p>}
    {!loading && data && <div className="mt-5 space-y-5">
      {data.period && !eligible && <p role="status" className="text-sm text-[var(--text-secondary)]">Renewal is not available for this subscription yet.</p>}

      {eligible && (!quote || quote.expired) && !quote?.pendingPayment && <div className="flex flex-wrap items-end gap-3 rounded-lg border border-amber-300/60 bg-amber-500/5 p-3">
        <div className="min-w-64 flex-1"><label className="block text-xs font-medium text-[var(--text-secondary)]" htmlFor="trial-conversion-plan">Choose your next subscription plan</label>
          <select id="trial-conversion-plan" value={targetPlanId} onChange={event=>{ setTargetPlanId(event.target.value); setAcknowledgeFeatureLoss(false); }} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm">
            <option value="">Select a subscription plan</option>{(data.availablePlans || []).map(plan=><option key={`${plan.planId}:${plan.planVersion}`} value={plan.planId}>{plan.name} · {subscriptionAmountText(plan.monthlyPrice)} / month</option>)}
          </select>
        </div>
        {selectedPlan?.impact?.conflicts.map((problem, index) => <p key={index} role="alert" className="w-full text-xs text-rose-700">{problem}</p>)}
        {removedModules.length > 0 && <div className="w-full space-y-2 rounded-lg border border-amber-400 p-3 text-xs text-[var(--text-primary)]" role="alert"><strong>Feature access will be removed</strong><p>The following features are not supported by this plan. Existing data is not automatically deleted, but it may become inaccessible. Export or back up anything you need before the new plan begins.</p><ul className="list-inside list-disc">{removedModules.map(module => <li key={`${module.industry}-${module.key}`}>{module.industry}: {module.key.replaceAll('_', ' ')}</li>)}</ul><label className="flex items-center gap-2"><input type="checkbox" checked={acknowledgeFeatureLoss} onChange={event => setAcknowledgeFeatureLoss(event.target.checked)} /> I understand the lost features and have backed up anything I need.</label></div>}
        <Button type="button" size="sm" variant="primary" icon={CreditCard} loading={busy} disabled={busy || !targetPlanId || selectionBlocked || (removedModules.length > 0 && !acknowledgeFeatureLoss)} onClick={()=>void createQuote()}>See my plan price</Button>
        <p className="w-full text-[11px] text-[var(--text-muted)]">Plan changes take effect only after payment approval and activation of the next billing period. Your current plan remains in effect until then.</p>
      </div>}

      {eligible && !data.period?.isTrial && (!quote || quote.expired) && !quote?.pendingPayment && (!data.availablePlans?.length) && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300/60 bg-amber-500/5 p-3 text-xs text-[var(--text-secondary)]">
        <p>{quote?.expired ? 'Your old price offer has expired. Get a new one.' : data.period?.overdue ? 'Your plan has ended, but you can still request a renewal price.' : 'It is time to renew. You can check the price now.'}</p>
        <Button type="button" size="sm" variant="primary" icon={RefreshCw} loading={busy} disabled={busy} onClick={() => void createQuote()}>{quote?.expired ? 'Get an updated price' : 'See my renewal price'}</Button>
      </div>}

      {quote && <section className="space-y-5">
        {canPay && <form onSubmit={submitPayment} className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Renew your plan</h3>
            <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">Pay {subscriptionAmountText(quote.paymentAmount)} using your usual payment method, then add the reference and receipt. We’ll review it before renewing your plan.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-[var(--text-primary)]">Bank or UPI payment reference
              <input className="mt-1.5 block h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-blue-500/15" required maxLength={160} value={reference} disabled={busy} autoComplete="off" placeholder="Enter transaction ID" onChange={event => { setReference(event.target.value); setPaymentKey(newBillingIdempotencyKey()); }} />
            </label>
            <label className="block text-sm font-medium text-[var(--text-primary)]">Payment receipt
              <input className="mt-1.5 block w-full cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-xs text-[var(--text-secondary)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--bg-subtle)] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[var(--text-primary)]" required type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" disabled={busy} onChange={event => { setProof(event.target.files?.[0] || null); setPaymentKey(newBillingIdempotencyKey()); }} />
              <span className="mt-1.5 block text-xs text-[var(--text-muted)]">PDF, JPG, PNG or WEBP · up to 10 MB</span>
            </label>
          </div>
          <label className="block text-sm font-medium text-[var(--text-primary)]">Note <span className="font-normal text-[var(--text-muted)]">(optional)</span>
            <textarea className="mt-1.5 block w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-blue-500/15" maxLength={2000} rows={3} placeholder="Add any details that will help us verify your payment" value={note} disabled={busy} onChange={event => { setNote(event.target.value); setPaymentKey(newBillingIdempotencyKey()); }} />
          </label>
          <div className="flex flex-col-reverse gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[var(--text-muted)]">Your plan renews after the receipt is approved.</p>
            <Button type="submit" size="md" variant="primary" icon={CreditCard} className="justify-center" disabled={!proof || !reference.trim() || busy} loading={busy}>Send receipt for review</Button>
          </div>
        </form>}
        {quote.pendingPayment && <p role="status" className="rounded-lg bg-amber-500/10 p-3 text-sm text-[var(--text-secondary)]"><AlertCircle className="mr-1 inline h-4 w-4" />We received your receipt. It is waiting for someone to check it.</p>}
        {canPay && <form onSubmit={submitPayment} className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-[var(--accent)]"><CreditCard className="h-5 w-5" /></div>
            <div><h3 className="text-base font-semibold text-[var(--text-primary)]">Submit your payment</h3>
              <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">Pay {subscriptionAmountText(quote.paymentAmount)} using your usual payment method, then add the reference and receipt. We’ll review it before renewing your plan.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-[var(--text-primary)]">Bank or UPI payment reference
              <input className="mt-1.5 block h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-blue-500/15" required maxLength={160} value={reference} disabled={busy} autoComplete="off" placeholder="Enter transaction ID" onChange={event => { setReference(event.target.value); setPaymentKey(newBillingIdempotencyKey()); }} />
            </label>
            <label className="block text-sm font-medium text-[var(--text-primary)]">Payment receipt
              <input className="mt-1.5 block w-full cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-xs text-[var(--text-secondary)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--bg-subtle)] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[var(--text-primary)]" required type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" disabled={busy} onChange={event => { setProof(event.target.files?.[0] || null); setPaymentKey(newBillingIdempotencyKey()); }} />
              <span className="mt-1.5 block text-xs text-[var(--text-muted)]">PDF, JPG, PNG or WEBP · up to 10 MB</span>
            </label>
          </div>
          <label className="block text-sm font-medium text-[var(--text-primary)]">Note <span className="font-normal text-[var(--text-muted)]">(optional)</span>
            <textarea className="mt-1.5 block w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-blue-500/15" maxLength={2000} rows={3} placeholder="Add any details that will help us verify your payment" value={note} disabled={busy} onChange={event => { setNote(event.target.value); setPaymentKey(newBillingIdempotencyKey()); }} />
          </label>
          <div className="flex flex-col-reverse gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[var(--text-muted)]">Your plan renews after the receipt is approved.</p>
            <Button type="submit" size="md" variant="primary" icon={CreditCard} className="justify-center" disabled={!proof || !reference.trim() || busy} loading={busy}>Send receipt for review</Button>
          </div>
        </form>}
        {!canPay && !quote.pendingPayment && <p className="text-xs text-[var(--text-secondary)]">{!quote.payable ? quote.expired ? "This price expired. Get an updated price before paying." : "Payment is not available for this plan right now." : !data.payment.submissionEnabled ? 'Sending receipts is not available right now. Ask your billing administrator for help.' : 'Only an account billing administrator can send a payment receipt.'}</p>}
      </section>}
    </div>}
  </div>;
}
