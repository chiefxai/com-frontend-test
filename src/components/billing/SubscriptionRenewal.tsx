import React from 'react';
import { AlertCircle, CalendarClock, CreditCard, RefreshCw } from 'lucide-react';
import { BillingApiError, billingClient, newBillingIdempotencyKey } from '../../lib/billing/client';
import type { SubscriptionRenewalResponse } from '../../lib/billing/types';
import { useAuthorization } from '../../lib/authorization';
import { Card, CardHeader } from '../ui/Card';
import Button from '../ui/Button';
import { subscriptionAmountText, subscriptionDateText } from './InitialSubscriptionPurchase';

export default function SubscriptionRenewal({ canSubmit = false }: { canSubmit?: boolean }) {
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
      setSuccess('Your renewal price is ready. Check the amount below before paying.');
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

  return <Card padding="sm" className="col-span-12 sm:!p-5">
    <CardHeader title="Renew your plan" subtitle="Check your end date, see the price, and send a receipt when you are ready." icon={CalendarClock} />
    {loading && <p role="status" className="text-sm text-[var(--text-muted)]">Checking when you can renew…</p>}
    {error && <p role="alert" className="mt-3 rounded-lg border border-rose-300/60 bg-rose-500/5 p-3 text-xs text-rose-700">{error}</p>}
    {success && <p role="status" className="mt-3 rounded-lg border border-emerald-300/60 bg-emerald-500/5 p-3 text-xs text-emerald-800">{success}</p>}
    {!loading && notFound && <p role="status" className="mt-3 text-xs text-[var(--text-secondary)]">We could not find a plan to renew yet. If you are starting a new plan, choose “Start a new plan” above.</p>}
    {!loading && data && <div className="mt-3 space-y-4">
      {data.period ? <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4 text-sm">
        <span>{data.period.isTrial ? `Free trial (${data.period.trialDays} days):` : 'Current paid period:'} {subscriptionDateText(data.period.startsAt)} – {subscriptionDateText(data.period.endsAt)}</span>
        {data.period.isTrial && <span>₹200 trial credits expire when the trial ends. Purchased credits have their own later expiry.</span>}
        {data.period.overdue && <strong className="text-amber-700">Plan has ended</strong>}
        {eligible && <strong className="text-[var(--accent)]">You can renew now</strong>}
      </div> : <p className="text-sm text-[var(--text-secondary)]">We do not have your plan dates yet.</p>}

      {data.paidCreditsDuringTrial && data.period?.isTrial && <p role="status" className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4 text-sm text-[var(--text-primary)]"><strong>Paid credits are available now:</strong> {subscriptionAmountText(data.paidCreditsDuringTrial.amount)} was added to your organization credit pool after payment approval. It can be used alongside remaining trial credits, and stays available after trial credits expire (until {subscriptionDateText(data.paidCreditsDuringTrial.expiresAt)}). Your paid plan activates when the trial ends.</p>}
      {data.period && !eligible && <p role="status" className="rounded-xl border border-[var(--border)] p-4 text-sm text-[var(--text-secondary)]">It is not time to renew yet. When renewal becomes available, you'll see a button here to check your next price.</p>}

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

      {quote && <div className="space-y-4 rounded-xl border border-[var(--border)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-semibold">Your renewal price</h3><p className="mt-1 text-sm text-[var(--text-secondary)]">{quote.pendingPayment ? "Your payment is being checked." : ["paid", "scheduled", "fulfilled"].includes(quote.status.toLowerCase()) ? "Your payment has been recorded." : quote.expired ? "This price has expired." : quote.payable ? "Ready when you are." : "This price cannot be paid right now."}</p><p className="mt-1 text-xs text-[var(--text-muted)]">Price valid until {subscriptionDateText(quote.validUntil)}</p></div>
        </div>
        
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-[var(--bg-subtle)] p-3"><dt className="text-sm text-[var(--text-secondary)]">{quote.pendingPayment ? "Amount sent for review" : ["paid", "scheduled", "fulfilled"].includes(quote.status.toLowerCase()) ? "Payment amount" : "Amount to pay"}</dt><dd className="mt-1 text-2xl font-bold">{subscriptionAmountText(quote.paymentAmount)}</dd></div>
          <div className="rounded-lg bg-[var(--bg-subtle)] p-3"><dt className="text-sm text-[var(--text-secondary)]">Credits included with your next paid period</dt><dd className="mt-1 text-2xl font-bold">{subscriptionAmountText(quote.includedCredits)}</dd></div>
        </dl>
        <p className="text-sm leading-6 text-[var(--text-secondary)]">{data.period?.isTrial ? 'After approval, paid-plan credits become available alongside any remaining trial credits. The paid plan starts when the trial ends.' : 'Credits become available when your next paid billing period activates.'}</p>
        <details className="rounded-xl border border-[var(--border)] p-3 text-sm text-[var(--text-secondary)]">
          <summary className="cursor-pointer font-semibold text-[var(--text-primary)]">See how we worked out this price</summary>
          {quote.lines.length > 0 && <div className="mt-3 divide-y divide-[var(--border)]">{quote.lines.map((line, index) => <div key={`${line.code}-${index}`} className="flex justify-between gap-3 py-2"><span>{line.label} × {line.quantity}</span><span className="font-medium tabular-nums">{subscriptionAmountText(line.amount)}</span></div>)}</div>}
          <p className="mt-3">Before tax: {subscriptionAmountText(quote.subtotal)} · Tax: {subscriptionAmountText(quote.totalTax)}</p>
          <p className="mt-2 break-all text-xs">For support: {quote.quoteId}</p>
        </details>
        {quote.pendingPayment && <p role="status" className="rounded-lg bg-amber-500/10 p-3 text-sm text-[var(--text-secondary)]"><AlertCircle className="mr-1 inline h-4 w-4" />We received your receipt. It is waiting for someone to check it.</p>}
        {canPay && <form onSubmit={submitPayment} className="space-y-3 rounded-xl border border-[var(--border)] p-4">
          <h3 className="flex items-center gap-2 text-base font-semibold"><CreditCard className="h-5 w-5" />Already paid? Send us your receipt.</h3>
          <p className="text-xs text-[var(--text-secondary)]">First pay {subscriptionAmountText(quote.paymentAmount)} using your usual payment method. Then enter the payment ID and upload your receipt. We will check it before renewing your plan.</p>
          <label className="block text-xs font-medium text-[var(--text-secondary)]">Bank or UPI payment reference<input className="mt-1.5 block h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 text-sm" required maxLength={160} value={reference} disabled={busy} onChange={event => { setReference(event.target.value); setPaymentKey(newBillingIdempotencyKey()); }} /></label>
          <label className="block text-xs font-medium text-[var(--text-secondary)]">Payment receipt<input className="mt-1.5 block w-full text-xs" required type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" disabled={busy} onChange={event => { setProof(event.target.files?.[0] || null); setPaymentKey(newBillingIdempotencyKey()); }} /><span className="mt-1 block text-[11px] text-[var(--text-muted)]">PDF, JPG, PNG or WEBP, up to 10 MB.</span></label>
          <label className="block text-xs font-medium text-[var(--text-secondary)]">Note (optional)<textarea className="mt-1.5 block w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm" maxLength={2000} rows={2} value={note} disabled={busy} onChange={event => { setNote(event.target.value); setPaymentKey(newBillingIdempotencyKey()); }} /></label>
          <Button type="submit" size="sm" variant="primary" disabled={!proof || !reference.trim() || busy} loading={busy}>Send receipt for review</Button>
        </form>}
        {!canPay && !quote.pendingPayment && <p className="text-xs text-[var(--text-secondary)]">{!quote.payable ? quote.expired ? "This price expired. Get an updated price before paying." : "Payment is not available for this plan right now." : !data.payment.submissionEnabled ? 'Sending receipts is not available right now. Ask your billing administrator for help.' : 'Only an account billing administrator can send a payment receipt.'}</p>}
      </div>}
    </div>}
  </Card>;
}
