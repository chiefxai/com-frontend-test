import React from 'react';
import { apiFetch } from '../../lib/api';
import { billingClient, newBillingIdempotencyKey } from '../../lib/billing/client';
import type { BillingAmount, PaymentRequest } from '../../lib/billing/types';

type Quote = { quoteId: string; paymentAmount: BillingAmount; topupCredits: BillingAmount; validUntil: string };
const formatMoney = (amount: BillingAmount) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })
    .format(Number(amount.units) / 10 ** amount.scale);

export default function OrganizationTopUp() {
  const [amount, setAmount] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [proof, setProof] = React.useState<File | null>(null);
  const [note, setNote] = React.useState('');
  const [quote, setQuote] = React.useState<Quote | null>(null);
  const [quoteKey, setQuoteKey] = React.useState(() => newBillingIdempotencyKey());
  const [paymentKey, setPaymentKey] = React.useState(() => newBillingIdempotencyKey());
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [history, setHistory] = React.useState<PaymentRequest[]>([]);

  const refresh = React.useCallback(async () => {
    try {
      const page = await billingClient.payments(null, 25);
      setHistory(page.rows.filter(payment => payment.purpose === 'topup'));
    } catch {
      // A missing ledger or an unavailable read API must not misrepresent a payment.
    }
  }, []);
  React.useEffect(() => { void refresh(); }, [refresh]);

  const resetQuote = () => {
    setQuote(null);
    setQuoteKey(newBillingIdempotencyKey());
    setPaymentKey(newBillingIdempotencyKey());
    setSuccess('');
    setError('');
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!/^(?:[1-9][0-9]{0,5})(?:\.[0-9]{1,2})?$/.test(amount.trim())) {
      setError('Enter a top-up amount between ₹1 and ₹999,999.99.');
      return;
    }
    if (!reference.trim() || !proof) {
      setError('Enter the transaction reference and attach the payment receipt.');
      return;
    }
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(proof.type)
      || proof.size > 10 * 1024 * 1024 || proof.size === 0) {
      setError('Upload a PDF, JPG, PNG or WEBP receipt of up to 10 MB.');
      return;
    }
    setBusy(true);
    try {
      let current = quote;
      if (!current) {
        const response = await apiFetch('/api/billing/topup-quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': quoteKey },
          body: JSON.stringify({ amountInr: amount.trim() }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Unable to prepare credit top-up.');
        current = data as Quote;
        setQuote(current);
      }
      const result = await billingClient.submitPaymentWithProof({
        purpose: 'topup', quoteId: current.quoteId,
        expectedAmount: current.paymentAmount,
        paymentReference: reference.trim(),
        ...(note.trim() ? { payerNote: note.trim() } : {}),
      }, proof, { idempotencyKey: paymentKey });
      setSuccess(`Top-up request submitted for ${formatMoney(result.expectedAmount)}. The platform team will verify the receipt in Payment Reviews. Credits are added only after approval.`);
      setAmount('');
      setReference('');
      setProof(null);
      setNote('');
      setQuote(null);
      setQuoteKey(newBillingIdempotencyKey());
      setPaymentKey(newBillingIdempotencyKey());
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Top-up request failed. Retry without changing the payment details.');
    } finally { setBusy(false); }
  };

  const statuses: Record<string, string> = {
    pending_verification: 'Awaiting admin verification',
    needs_information: 'More information requested',
    needs_clarification: 'More information requested',
    approved: 'Approved — credits issued',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
  };

  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div>
      <h3 className="text-sm font-semibold text-slate-800">Add usage credits</h3>
      <p className="mt-1 text-xs text-slate-500">
        Pay by bank transfer or UPI outside this page, then submit your transaction details and receipt.
        For this top-up, ₹1 paid provides ₹1 of usage credits. Your subscription plan will not change.
      </p>
    </div>
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-slate-600">Top-up amount (₹)
          <input required value={amount} onChange={e => { setAmount(e.target.value); resetQuote(); }}
            placeholder="1000.00" inputMode="decimal"
            className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
        </label>
        <label className="block text-xs font-medium text-slate-600">Bank / UPI transaction reference
          <input required value={reference} onChange={e => { setReference(e.target.value); setError(''); }}
            placeholder="UTR or payment reference"
            className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
        </label>
      </div>
      <label className="block text-xs font-medium text-slate-600">Payment receipt (PDF, JPG, PNG or WEBP; max 10 MB)
        <input required type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
          onChange={e => { setProof(e.target.files?.[0] || null); setError(''); }} className="mt-1 block w-full text-xs" />
      </label>
      <label className="block text-xs font-medium text-slate-600">Note (optional)
        <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000} rows={2}
          className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      </label>
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      {success && <p role="status" className="text-xs text-emerald-700">{success}</p>}
      <button type="submit" disabled={busy || Boolean(success)}
        className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-medium text-white hover:bg-amber-400 disabled:opacity-50">
        {busy ? 'Submitting…' : quote ? 'Retry payment submission' : 'Submit top-up for verification'}
      </button>
    </form>
    <div className="border-t border-slate-200 pt-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-800">Recent top-up requests</h4>
        <button type="button" onClick={() => void refresh()} className="text-xs font-medium text-amber-700">Refresh</button>
      </div>
      {!history.length ? <p className="mt-2 text-xs text-slate-500">No top-up requests available.</p>
        : <ul className="mt-2 space-y-2">{history.map(payment =>
          <li key={payment.id} className="flex justify-between gap-3 border-b border-slate-100 pb-2 text-xs">
            <span>{formatMoney(payment.expectedAmount)}</span>
            <span>{statuses[payment.status] || payment.status}</span>
          </li>)}</ul>}
    </div>
  </section>;
}
