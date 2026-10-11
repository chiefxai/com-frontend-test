import React from 'react';
import { AlertCircle, CreditCard, RefreshCw, ShieldCheck } from 'lucide-react';
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
      setSuccess('Initial subscription quote is ready. Review the amount and credit allowance below.');
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
      setSuccess('Payment proof submitted for platform review. Subscription access and credits change only after payment approval and period activation.');
      setReference(''); setNote(''); setProof(null); setPaymentKey(newBillingIdempotencyKey());
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not submit payment proof. Retry the same submission safely.'); }
    finally { setBusy(false); }
  };

  if (!billingAdmin) return null;
  const quote = data?.quote;
  const canPay = Boolean(quote?.payable && data?.payment.submissionEnabled && canSubmit);

  return <Card padding="sm" className="mt-4 sm:!p-5">
    <CardHeader title="Initial subscription purchase" subtitle="The plan fee and included usage credits are separate amounts." icon={CreditCard} />
    {loading && <p role="status" className="text-xs text-[var(--text-muted)]">Loading initial subscription quote…</p>}
    {!loading && notProvisioned && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300/60 bg-amber-500/5 p-3 text-xs text-[var(--text-secondary)]">
      <p>No initial purchase quote is provisioned yet. You can ask the server to create or recover it from the selected plan and organization inventory.</p>
      <Button type="button" size="sm" variant="primary" loading={busy} disabled={busy} onClick={() => void retryQuote()}>Create quote</Button>
    </div>}
    {error && <p role="alert" className="mt-3 rounded-lg border border-rose-300/60 bg-rose-500/5 p-3 text-xs text-rose-700">{error}</p>}
    {success && <p role="status" className="mt-3 rounded-lg border border-emerald-300/60 bg-emerald-500/5 p-3 text-xs text-emerald-800">{success}</p>}
    {!loading && data && !quote && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300/60 bg-amber-500/5 p-3 text-xs text-[var(--text-secondary)]">
      <p>No initial purchase quote is available yet. Provision one from the saved plan and current organization inventory.</p>
      <Button type="button" size="sm" variant="primary" loading={busy} disabled={busy} onClick={() => void retryQuote()}>Create quote</Button>
    </div>}
    {!loading && data && quote && <div className="mt-3 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-3">
        <div><p className="text-sm font-semibold">{quote.plan?.id || 'Selected subscription plan'} · {quote.status}</p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">Quote {quote.quoteId} · valid until {subscriptionDateText(quote.validUntil)}</p></div>
        {quote.expired && <Button type="button" size="sm" variant="secondary" icon={RefreshCw} loading={busy} disabled={busy} onClick={() => void retryQuote()}>Retry expired quote</Button>}
      </div>
      {quote.lines.length > 0 && <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] px-3">
        {quote.lines.map((line, index) => <div key={`${line.code}-${index}`} className="flex justify-between gap-3 py-2 text-xs"><span className="text-[var(--text-secondary)]">{line.label} × {line.quantity}</span><span className="font-medium tabular-nums">{subscriptionAmountText(line.amount)}</span></div>)}
      </div>}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[11px] text-[var(--text-muted)]">Subtotal</dt><dd className="mt-1 text-sm font-semibold">{subscriptionAmountText(quote.subtotal)}</dd></div>
        <div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[11px] text-[var(--text-muted)]">Tax</dt><dd className="mt-1 text-sm font-semibold">{subscriptionAmountText(quote.totalTax)}</dd></div>
        <div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[11px] text-[var(--text-muted)]">Amount to pay</dt><dd className="mt-1 text-sm font-semibold">{subscriptionAmountText(quote.paymentAmount)}</dd></div>
        <div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[11px] text-[var(--text-muted)]">Included monthly credits</dt><dd className="mt-1 text-sm font-semibold">{subscriptionAmountText(quote.includedCredits)}</dd></div>
      </dl>
      <p className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--text-muted)]"><ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />Included credits are not part of the subscription payment and are issued only after payment approval and paid-period activation.</p>
      {canPay && <form onSubmit={submitPayment} className="space-y-3 rounded-xl border border-[var(--border)] p-4">
        <h3 className="text-sm font-semibold">Submit subscription payment proof</h3>
        <p className="text-xs text-[var(--text-secondary)]">Pay the exact server-quoted amount of {subscriptionAmountText(quote.paymentAmount)}, then submit your transaction reference and receipt for platform review.</p>
        <label className="block text-xs font-medium text-[var(--text-secondary)]">Bank or UPI transaction reference<input className={FIELD} required maxLength={160} value={reference} disabled={busy} onChange={event => { setReference(event.target.value); setPaymentKey(newBillingIdempotencyKey()); }} /></label>
        <label className="block text-xs font-medium text-[var(--text-secondary)]">Payment receipt<input className="mt-1.5 block w-full text-xs" required type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" disabled={busy} onChange={event => { setProof(event.target.files?.[0] || null); setPaymentKey(newBillingIdempotencyKey()); }} /><span className="mt-1 block text-[11px] text-[var(--text-muted)]">PDF, JPG, PNG or WEBP, up to 10 MB.</span></label>
        <label className="block text-xs font-medium text-[var(--text-secondary)]">Note (optional)<textarea className={FIELD + ' h-auto py-2'} maxLength={2000} rows={2} value={note} disabled={busy} onChange={event => { setNote(event.target.value); setPaymentKey(newBillingIdempotencyKey()); }} /></label>
        <Button type="submit" size="sm" variant="primary" disabled={!proof || !reference.trim() || busy} loading={busy}>Submit for verification</Button>
      </form>}
      {!canPay && <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-xs text-[var(--text-secondary)]">
        {!quote.payable ? <p><AlertCircle className="mr-1 inline h-3.5 w-3.5" />This quote is not payable. {quote.expired ? 'Request a fresh quote before submitting payment.' : `Quote status: ${quote.status}.`}</p>
          : !data.payment.submissionEnabled ? <p>Payment submission is not enabled yet. Contact platform operations to enable the approved payment workflow.</p>
            : <p>Your role cannot submit payment proof for this subscription.</p>}
      </div>}
    </div>}
    {!loading && !data && !notProvisioned && !error && <p className="text-xs text-[var(--text-muted)]">Initial subscription details are unavailable.</p>}
  </Card>;
}
