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
    setBusy(true); setError(''); setSuccess('');
    try {
      const next = await billingClient.createSubscriptionRenewalQuote({ idempotencyKey: quoteKey });
      setData(next); setQuoteKey(newBillingIdempotencyKey());
      setSuccess('Renewal quote is ready. Review its dates, amount, and included credits.');
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
      setSuccess('Renewal payment proof submitted for platform review. The period is renewed only after approval and activation.');
      setReference(''); setNote(''); setProof(null); setPaymentKey(newBillingIdempotencyKey());
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not submit renewal proof. Retry the same submission safely.'); }
    finally { setBusy(false); }
  };

  if (!billingAdmin) return null;
  const quote = data?.quote;
  const eligible = data?.period?.renewalEligible === true;
  const canPay = Boolean(quote?.payable && !quote.pendingPayment && data?.payment.submissionEnabled && canSubmit);

  return <Card padding="sm" className="col-span-12 sm:!p-5">
    <CardHeader title="Subscription renewal" subtitle="Renewal eligibility and deadlines are supplied by the billing service." icon={CalendarClock} />
    {loading && <p role="status" className="text-xs text-[var(--text-muted)]">Checking renewal eligibility…</p>}
    {error && <p role="alert" className="mt-3 rounded-lg border border-rose-300/60 bg-rose-500/5 p-3 text-xs text-rose-700">{error}</p>}
    {success && <p role="status" className="mt-3 rounded-lg border border-emerald-300/60 bg-emerald-500/5 p-3 text-xs text-emerald-800">{success}</p>}
    {!loading && notFound && <p role="status" className="mt-3 text-xs text-[var(--text-secondary)]">No active subscription period is available for renewal.</p>}
    {!loading && data && <div className="mt-3 space-y-4">
      {data.period ? <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-[var(--border)] p-3 text-xs">
        <span>Current paid period: {subscriptionDateText(data.period.startsAt)} – {subscriptionDateText(data.period.endsAt)}</span>
        {data.period.overdue && <strong className="text-amber-700">Overdue</strong>}
        {eligible && <strong className="text-[var(--accent)]">Renewal available</strong>}
      </div> : <p className="text-xs text-[var(--text-secondary)]">No current paid period dates were returned.</p>}

      {eligible && (!quote || quote.expired) && !quote?.pendingPayment && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300/60 bg-amber-500/5 p-3 text-xs text-[var(--text-secondary)]">
        <p>{quote?.expired ? 'The previous renewal quote expired.' : data.period?.overdue ? 'The subscription period is overdue; a renewal quote remains available.' : 'Renewal has opened for this billing period.'}</p>
        <Button type="button" size="sm" variant="primary" icon={RefreshCw} loading={busy} disabled={busy} onClick={() => void createQuote()}>{quote?.expired ? 'Refresh renewal quote' : 'Prepare renewal quote'}</Button>
      </div>}

      {quote && <div className="space-y-3 rounded-lg border border-[var(--border)] p-3">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">Renewal quote · {quote.status}</p><p className="mt-1 text-[11px] text-[var(--text-muted)]">Quote {quote.quoteId} · valid until {subscriptionDateText(quote.validUntil)}</p></div>
          {quote.expired && eligible && <Button type="button" size="sm" variant="secondary" icon={RefreshCw} loading={busy} disabled={busy} onClick={() => void createQuote()}>Refresh quote</Button>}</div>
        {quote.lines.length > 0 && <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] px-3">{quote.lines.map((line, index) => <div key={`${line.code}-${index}`} className="flex justify-between gap-3 py-2 text-xs"><span className="text-[var(--text-secondary)]">{line.label} × {line.quantity}</span><span className="font-medium tabular-nums">{subscriptionAmountText(line.amount)}</span></div>)}</div>}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-[var(--bg-subtle)] p-3"><dt className="text-[11px] text-[var(--text-muted)]">Amount to pay</dt><dd className="mt-1 text-sm font-semibold">{subscriptionAmountText(quote.paymentAmount)}</dd></div>
          <div className="rounded-lg bg-[var(--bg-subtle)] p-3"><dt className="text-[11px] text-[var(--text-muted)]">Included credits</dt><dd className="mt-1 text-sm font-semibold">{subscriptionAmountText(quote.includedCredits)}</dd></div>
          <div className="rounded-lg bg-[var(--bg-subtle)] p-3"><dt className="text-[11px] text-[var(--text-muted)]">Subtotal</dt><dd className="mt-1 text-sm font-semibold">{subscriptionAmountText(quote.subtotal)}</dd></div>
          <div className="rounded-lg bg-[var(--bg-subtle)] p-3"><dt className="text-[11px] text-[var(--text-muted)]">Tax</dt><dd className="mt-1 text-sm font-semibold">{subscriptionAmountText(quote.totalTax)}</dd></div>
        </dl>
        {quote.pendingPayment && <p role="status" className="text-xs text-[var(--text-secondary)]"><AlertCircle className="mr-1 inline h-3.5 w-3.5" />A renewal payment is already awaiting platform review.</p>}
        {canPay && <form onSubmit={submitPayment} className="space-y-3 rounded-xl border border-[var(--border)] p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><CreditCard className="h-4 w-4" />Submit renewal payment proof</h3>
          <p className="text-xs text-[var(--text-secondary)]">Pay the exact quoted amount of {subscriptionAmountText(quote.paymentAmount)}, then submit the reference and receipt for review.</p>
          <label className="block text-xs font-medium text-[var(--text-secondary)]">Bank or UPI transaction reference<input className="mt-1.5 block h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 text-sm" required maxLength={160} value={reference} disabled={busy} onChange={event => { setReference(event.target.value); setPaymentKey(newBillingIdempotencyKey()); }} /></label>
          <label className="block text-xs font-medium text-[var(--text-secondary)]">Payment receipt<input className="mt-1.5 block w-full text-xs" required type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" disabled={busy} onChange={event => { setProof(event.target.files?.[0] || null); setPaymentKey(newBillingIdempotencyKey()); }} /><span className="mt-1 block text-[11px] text-[var(--text-muted)]">PDF, JPG, PNG or WEBP, up to 10 MB.</span></label>
          <label className="block text-xs font-medium text-[var(--text-secondary)]">Note (optional)<textarea className="mt-1.5 block w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm" maxLength={2000} rows={2} value={note} disabled={busy} onChange={event => { setNote(event.target.value); setPaymentKey(newBillingIdempotencyKey()); }} /></label>
          <Button type="submit" size="sm" variant="primary" disabled={!proof || !reference.trim() || busy} loading={busy}>Submit for verification</Button>
        </form>}
        {!canPay && !quote.pendingPayment && <p className="text-xs text-[var(--text-secondary)]">{!quote.payable ? `This renewal quote is not payable (${quote.expired ? 'expired' : quote.status}).` : !data.payment.submissionEnabled ? 'Payment submission is not enabled yet.' : 'Your role cannot submit subscription payment proof.'}</p>}
      </div>}
    </div>}
  </Card>;
}
