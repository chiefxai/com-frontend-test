import React from 'react';
import { AlertCircle, CreditCard, RefreshCw } from 'lucide-react';
import { billingClient, BillingApiError, newBillingIdempotencyKey } from '../../lib/billing/client';
import type { BillingAmount, SubscriptionPurchaseResponse } from '../../lib/billing/types';
import { useAuthorization } from '../../lib/authorization';
import { Card, CardHeader } from '../ui/Card';
import Button from '../ui/Button';

const FIELD = 'mt-1.5 block h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-subtle)]';
export const subscriptionAmountText = (amount: BillingAmount | null | undefined): string => {
  if (!amount || !/^\d+$/.test(amount.units) || !Number.isInteger(amount.scale) || amount.scale < 0) return '—';
  const units = BigInt(amount.units);
  const divisor = 10n ** BigInt(amount.scale);
  const wholeText = new Intl.NumberFormat('en-IN', { style: 'currency', currency: amount.asset, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(units / divisor);
  if (!amount.scale) return wholeText;
  const decimal = new Intl.NumberFormat('en-IN').formatToParts(1.1).find(part => part.type === 'decimal')?.value || '.';
  return `${wholeText}${decimal}${(units % divisor).toString().padStart(amount.scale, '0')}`;
};
export const subscriptionDateText = (value: string | null) => {
  if (!value || Number.isNaN(Date.parse(value))) return '—';
  return `${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`;
};

export default function InitialSubscriptionPurchase({ canSubmit = false }: { canSubmit?: boolean }) {
  const { can, authorization } = useAuthorization();
  const billingAdmin = can('billing.read') && ['Owner', 'Organization Admin', 'Billing Admin'].includes(authorization?.organizationRole || '');
  const [data, setData] = React.useState<SubscriptionPurchaseResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [notProvisioned, setNotProvisioned] = React.useState(false);
  const [provisionKey, setProvisionKey] = React.useState(newBillingIdempotencyKey);
  const [paymentKey, setPaymentKey] = React.useState(newBillingIdempotencyKey);
  const [reference, setReference] = React.useState('');
  const [note, setNote] = React.useState('');
  const [proof, setProof] = React.useState<File | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true); setError(''); setNotProvisioned(false);
    try {
      setData(await billingClient.subscriptionPurchase());
    } catch (cause) {
      setData(null);
      if (cause instanceof BillingApiError && cause.status === 404) setNotProvisioned(true);
      else setError(cause instanceof Error ? cause.message : 'Could not load the initial subscription quote.');
    } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { if (billingAdmin) void refresh(); else setLoading(false); }, [billingAdmin, refresh]);

  const retryQuote = async () => {
    if (!billingAdmin || busy) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      const result = await billingClient.provisionInitialSubscriptionQuote({ idempotencyKey: provisionKey });
      setData(result); setNotProvisioned(false); setProvisionKey(newBillingIdempotencyKey());
      setSuccess('Your starting price is ready. Check the amount below before paying.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create the initial subscription quote. Retry to try again safely.'); }
    finally { setBusy(false); }
  };

  const submitPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    const quote = data?.quote;
    if (!quote?.payable || !data?.payment.submissionEnabled || !canSubmit || !proof || !reference.trim()) return;
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(proof.type) || proof.size === 0 || proof.size > 10 * 1024 * 1024) {
      setError('Choose a PDF, JPG, PNG or WEBP payment receipt up to 10 MB.'); return;
    }
    setBusy(true); setError(''); setSuccess('');
    try {
      await billingClient.submitPaymentWithProof({ schemaVersion: 1, purpose: 'subscription', quoteId: quote.quoteId,
        expectedAmount: quote.paymentAmount, paymentReference: reference.trim(), ...(note.trim() ? { payerNote: note.trim() } : {}) }, proof,
      { idempotencyKey: paymentKey });
      setSuccess('We received your payment receipt. Your plan and included credits start after approval and activation.');
      setReference(''); setNote(''); setProof(null); setPaymentKey(newBillingIdempotencyKey());
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not submit payment proof. Retry the same submission safely.'); }
    finally { setBusy(false); }
  };

  if (!billingAdmin) return null;
  const quote = data?.quote;
  const canPay = Boolean(quote?.payable && data?.payment.submissionEnabled && canSubmit);

  return <Card padding="sm" className="mt-4 sm:!p-5">
    <CardHeader title="Start your plan" subtitle="See your first payment amount and how to send your receipt." icon={CreditCard} />
    {loading && <p role="status" className="text-xs text-[var(--text-muted)]">Checking the starting price for your plan…</p>}
    {!loading && notProvisioned && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300/60 bg-amber-500/5 p-3 text-xs text-[var(--text-secondary)]">
      <p>Your starting price is not ready yet. Select the button to see how much your first payment will be.</p>
      <Button type="button" size="sm" variant="primary" loading={busy} disabled={busy} onClick={() => void retryQuote()}>Show my starting price</Button>
    </div>}
    {error && <p role="alert" className="mt-3 rounded-lg border border-rose-300/60 bg-rose-500/5 p-3 text-xs text-rose-700">{error}</p>}
    {success && <p role="status" className="mt-3 rounded-lg border border-emerald-300/60 bg-emerald-500/5 p-3 text-xs text-emerald-800">{success}</p>}
    {!loading && data && !quote && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300/60 bg-amber-500/5 p-3 text-xs text-[var(--text-secondary)]">
      <p>Your starting price is not ready yet. We can calculate it from your saved plan.</p>
      <Button type="button" size="sm" variant="primary" loading={busy} disabled={busy} onClick={() => void retryQuote()}>Show my starting price</Button>
    </div>}
    {!loading && data && quote && <div className="mt-3 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-[var(--bg-subtle)] p-4">
        <div>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Your {quote.plan?.id?.replace(/[-_]/g, ' ') || 'chosen'} plan</h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{quote.expired ? 'This price has expired.' : quote.payable ? 'Here is the price to get started.' : 'This price cannot be paid right now.'}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Price valid until {subscriptionDateText(quote.validUntil)}</p>
        </div>
        {quote.expired && <Button type="button" size="sm" variant="secondary" icon={RefreshCw} loading={busy} disabled={busy} onClick={() => void retryQuote()}>Get a new price</Button>}
      </div>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] p-4"><dt className="text-sm text-[var(--text-secondary)]">Your first payment</dt><dd className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{subscriptionAmountText(quote.paymentAmount)}</dd></div>
        <div className="rounded-xl border border-[var(--border)] p-4"><dt className="text-sm text-[var(--text-secondary)]">Calling credits included with your plan</dt><dd className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{subscriptionAmountText(quote.includedCredits)}</dd></div>
      </dl>
      <p className="text-sm leading-6 text-[var(--text-secondary)]">
        These credits are not money you pay. They become available after payment approval and when your paid plan begins.
      </p>
      <details className="rounded-xl border border-[var(--border)] p-3 text-sm text-[var(--text-secondary)]">
        <summary className="cursor-pointer font-semibold text-[var(--text-primary)]">See what makes up this price</summary>
        {quote.lines.length > 0 && <div className="mt-3 divide-y divide-[var(--border)]">
          {quote.lines.map((line, index) => <div key={`${line.code}-${index}`} className="flex justify-between gap-3 py-2"><span>{line.label} × {line.quantity}</span><span className="font-medium tabular-nums">{subscriptionAmountText(line.amount)}</span></div>)}
        </div>}
        <p className="mt-3">Before tax: {subscriptionAmountText(quote.subtotal)} · Tax: {subscriptionAmountText(quote.totalTax)}</p>
        <p className="mt-2 break-all text-xs">For support: {quote.quoteId}</p>
      </details>
      {canPay && <form onSubmit={submitPayment} className="space-y-3 rounded-xl border border-[var(--border)] p-4">
        <h3 className="text-base font-semibold">Already paid? Send us your receipt.</h3>
        <p className="text-xs text-[var(--text-secondary)]">Pay {subscriptionAmountText(quote.paymentAmount)} using your usual payment method. Then enter the payment ID and upload the receipt. We will check it before your plan starts.</p>
        <label className="block text-xs font-medium text-[var(--text-secondary)]">Bank or UPI payment reference<input className={FIELD} required maxLength={160} value={reference} disabled={busy} onChange={event => { setReference(event.target.value); setPaymentKey(newBillingIdempotencyKey()); }} /></label>
        <label className="block text-xs font-medium text-[var(--text-secondary)]">Payment receipt<input className="mt-1.5 block w-full text-xs" required type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" disabled={busy} onChange={event => { setProof(event.target.files?.[0] || null); setPaymentKey(newBillingIdempotencyKey()); }} /><span className="mt-1 block text-[11px] text-[var(--text-muted)]">PDF, JPG, PNG or WEBP, up to 10 MB.</span></label>
        <label className="block text-xs font-medium text-[var(--text-secondary)]">Note (optional)<textarea className={FIELD + ' h-auto py-2'} maxLength={2000} rows={2} value={note} disabled={busy} onChange={event => { setNote(event.target.value); setPaymentKey(newBillingIdempotencyKey()); }} /></label>
        <Button type="submit" size="sm" variant="primary" disabled={!proof || !reference.trim() || busy} loading={busy}>Send receipt for review</Button>
      </form>}
      {!canPay && <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-xs text-[var(--text-secondary)]">
        {!quote.payable ? <p><AlertCircle className="mr-1 inline h-3.5 w-3.5" />{quote.expired ? 'This price has expired. Get a new price before paying.' : 'This price cannot be paid right now. Please contact your billing administrator.'}</p>
          : !data.payment.submissionEnabled ? <p>Sending receipts is not available right now. Please contact your billing administrator.</p>
            : <p>Only an account billing administrator can send a receipt.</p>}
      </div>}
    </div>}
    {!loading && !data && !notProvisioned && !error && <p className="text-xs text-[var(--text-muted)]">We could not load your plan yet. Please try again or contact your billing administrator.</p>}
  </Card>;
}
