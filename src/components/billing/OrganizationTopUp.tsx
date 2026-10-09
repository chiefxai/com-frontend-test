import React from 'react';
import { ArrowDownToLine, CheckCircle2, Clock3, CreditCard, Plus, RefreshCw, Wallet } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { billingClient, newBillingIdempotencyKey } from '../../lib/billing/client';
import type { BillingAmount, BillingOverview, PaymentRequest } from '../../lib/billing/types';

type Quote = { quoteId: string; paymentAmount: BillingAmount; topupCredits: BillingAmount; validUntil: string };
const formatMoney = (amount: BillingAmount) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })
    .format(Number(amount.units) / 10 ** amount.scale);

export type BillingPanel = 'dashboard' | 'credits' | 'topup' | 'payments' | 'plan' | 'usage';
export default function OrganizationTopUp({ canSubmit = false, view = 'dashboard', onNavigate }: { canSubmit?: boolean; view?: BillingPanel; onNavigate?: (view: BillingPanel) => void }) {
  const [showForm, setShowForm] = React.useState(false);
  const [overview, setOverview] = React.useState<BillingOverview | null>(null);
  const [overviewError, setOverviewError] = React.useState('');
  const [historyError, setHistoryError] = React.useState('');
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [cursorStack, setCursorStack] = React.useState<(string | null)[]>([null]);
  const [historyFilter, setHistoryFilter] = React.useState<'all' | 'topup'>('topup');
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

  const loadOverview = React.useCallback(async () => {
    try {
      setOverview(await billingClient.organizationOverview());
      setOverviewError('');
    } catch (cause) {
      setOverview(null);
      setOverviewError(cause instanceof Error ? cause.message : 'Credit balances are currently unavailable.');
    }
  }, []);

  const loadHistory = React.useCallback(async (cursor: string | null = null) => {
    setHistoryLoading(true);
    try {
      const page = await billingClient.payments(cursor, 10);
      setHistory(page.rows);
      setNextCursor(page.nextCursor);
      setHistoryError('');
    } catch (cause) {
      setHistory([]);
      setHistoryError(cause instanceof Error ? cause.message : 'Could not load payment history.');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const refresh = React.useCallback(async () => {
    await Promise.all([loadOverview(), loadHistory(null)]);
    setCursorStack([null]);
  }, [loadOverview, loadHistory]);
  React.useEffect(() => { void refresh(); }, [refresh]);
  const displayedHistory = history.filter(item => historyFilter === 'all' || item.purpose === 'topup');
  const recentPayments = overview?.recentPayments || history;
  const balances = overview?.balances || [];
  const subscriptionCredits = balances.filter(balance => balance.kind === 'subscription');
  const topupCredits = balances.filter(balance => balance.kind === 'topup');
  const sumBalance = (items: typeof balances) => items.length && items.every(item => item.available.asset === 'INR' && item.available.scale === 2)
    ? formatMoney({ asset: 'INR', units: items.reduce((sum, item) => sum + BigInt(item.available.units), 0n).toString(), scale: 2 })
    : '—';

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
    if (!canSubmit) { setError('Only authorized organization billing administrators can submit top-ups.'); return; }
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
      setShowForm(false);
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

  return <div className="space-y-5" id="organization-billing-overview">
    {view === 'dashboard' && <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-base font-semibold text-[var(--text-primary)]">Credits & recent payments</h2><p className="mt-1 text-xs text-[var(--text-muted)]">An overview of your organization's billing ledger.</p></div>
        <button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-secondary)]"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-base)] p-4">
          <p className="text-xs text-[var(--text-secondary)]">Subscription credits available</p>
          <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">{overview ? sumBalance(subscriptionCredits) : '—'}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-base)] p-4">
          <p className="text-xs text-[var(--text-secondary)]">Top-up credits available</p>
          <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">{overview ? sumBalance(topupCredits) : '—'}</p>
        </div>
      </div>
      {overviewError && <p className="mt-3 text-xs text-amber-700">Credit ledger unavailable: {overviewError}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => onNavigate?.('credits')} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)]">View credits</button>
        {canSubmit && <button type="button" onClick={() => onNavigate?.('topup')} className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white">Add credits</button>}
        <button type="button" onClick={() => onNavigate?.('payments')} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)]">View payments</button>
      </div>
      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-[var(--text-primary)]">Recent activity</h3><button type="button" onClick={() => onNavigate?.('payments')} className="text-xs font-semibold text-amber-600">View all</button></div>
        {recentPayments.length ? <ul className="mt-3 divide-y divide-[var(--border)]">
          {recentPayments.slice(0, 3).map(payment => <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs">
            <span className="text-[var(--text-secondary)]">{payment.purpose === 'topup' ? 'Credit top-up' : payment.purpose} · {new Date(payment.submittedAt).toLocaleDateString('en-IN')}</span>
            <span className="font-medium text-[var(--text-primary)]">{formatMoney(payment.expectedAmount)}</span>
            <span className="text-[var(--text-secondary)]">{statuses[payment.status] || payment.status}</span>
          </li>)}
        </ul> : <p className="mt-3 text-xs text-[var(--text-muted)]">No recent payments found.</p>}
      </div>
    </section>}
    {(view === 'credits' || view === 'topup') && <>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-700"><Wallet className="h-5 w-5 text-amber-500" /><h2 className="text-base font-semibold">Organization credits & payments</h2></div>
          <p className="mt-1 text-xs text-slate-500">Check available usage credits, add credits, and track submitted payments.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
          {canSubmit && <button type="button" onClick={() => { setShowForm(current => !current); setError(''); }} className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-400"><Plus className="h-4 w-4" /> Add credits</button>}
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="flex items-center gap-2 text-xs font-medium text-slate-500"><Wallet className="h-4 w-4" /> Available subscription credits</p>
          <p className="mt-2 text-2xl font-semibold text-slate-800">{overview ? sumBalance(subscriptionCredits) : '—'}</p>
          <p className="mt-1 text-[11px] text-slate-500">Issued with your subscription, subject to expiry.</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="flex items-center gap-2 text-xs font-medium text-slate-500"><ArrowDownToLine className="h-4 w-4" /> Available top-up credits</p>
          <p className="mt-2 text-2xl font-semibold text-slate-800">{overview ? sumBalance(topupCredits) : '—'}</p>
          <p className="mt-1 text-[11px] text-slate-500">Purchased credits added after payment approval.</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="flex items-center gap-2 text-xs font-medium text-slate-500"><CreditCard className="h-4 w-4" /> Subscription period</p>
          <p className="mt-2 text-sm font-semibold capitalize text-slate-800">{overview?.activePeriod?.status || 'Not available'}</p>
          <p className="mt-1 text-[11px] text-slate-500">{overview?.activePeriod?.endsAt ? `Ends ${new Date(overview.activePeriod.endsAt).toLocaleDateString('en-IN')}` : 'Your subscription billing details.'}</p>
        </div>
      </div>
      {overviewError && <p role="status" className="mt-3 text-xs text-amber-700">Credit ledger unavailable: {overviewError}. The figures below may use the separate legacy billing view.</p>}
      {!canSubmit && <p className="mt-3 text-xs text-slate-500">Top-up submission is available to organization owners, organization admins and billing admins with payment-submission permission.</p>}
    </section>

    {canSubmit && (showForm || view === 'topup') && <section className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm" id="add-credits-form">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-800">Request additional usage credits</h3>
        <p className="mt-1 text-xs text-slate-500">Pay by bank transfer or UPI outside this page, then upload proof. ₹1 paid provides ₹1 of usage credits; your subscription plan stays unchanged.</p>
        <p className="mt-1 text-xs text-amber-700">Submitting proof does not add credits. A platform admin must verify and approve the payment.</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-600">Top-up amount (₹)
            <input required value={amount} onChange={e => { setAmount(e.target.value); resetQuote(); }}
              placeholder="1000.00" inputMode="decimal" className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
            <span className="mt-1 block text-[11px] font-normal text-slate-500">₹1 to ₹999,999.99, up to two decimal places.</span>
          </label>
          <label className="block text-xs font-medium text-slate-600">Bank or UPI transaction reference
            <input required value={reference} onChange={e => { setReference(e.target.value); setPaymentKey(newBillingIdempotencyKey()); setError(''); }}
              placeholder="UTR or payment reference" className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
          </label>
        </div>
        <label className="block text-xs font-medium text-slate-600">Payment receipt
          <input required type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            onChange={e => { setProof(e.target.files?.[0] || null); setPaymentKey(newBillingIdempotencyKey()); setError(''); }} className="mt-1 block w-full text-xs" />
          <span className="mt-1 block text-[11px] font-normal text-slate-500">PDF, JPG, PNG or WEBP; maximum 10 MB.</span>
        </label>
        <label className="block text-xs font-medium text-slate-600">Payment note (optional)
          <textarea value={note} onChange={e => { setNote(e.target.value); setPaymentKey(newBillingIdempotencyKey()); }} maxLength={2000} rows={2}
            className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
        </label>
        {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={() => { setShowForm(false); if (view === 'topup') onNavigate?.('credits'); }} disabled={busy} className="px-3 py-2 text-sm text-slate-500">Cancel</button>
          <button type="submit" disabled={busy || Boolean(success)} className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-50">
            {busy ? 'Submitting…' : quote ? 'Retry payment submission' : 'Submit for verification'}
          </button>
        </div>
      </form>
    </section>}

    </>}
    {success && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-medium text-emerald-800"><CheckCircle2 className="mr-2 inline h-4 w-4" />{success}</div>}
    {view === 'payments' && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Clock3 className="h-4 w-4 text-slate-500" /> Payment history</h3><p className="mt-1 text-xs text-slate-500">Track top-up verification and other organization payments.</p></div>
        <select aria-label="Payment type" value={historyFilter} onChange={e => setHistoryFilter(e.target.value as 'topup' | 'all')}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
          <option value="topup">Top-up payments</option><option value="all">All payments</option>
        </select>
      </div>
      {historyError && <p role="alert" className="mt-3 text-xs text-rose-700">{historyError}</p>}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[580px] text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr><th className="px-3 py-3 font-medium">Date</th><th className="px-3 py-3 font-medium">Type</th><th className="px-3 py-3 font-medium">Amount</th><th className="px-3 py-3 font-medium">Status</th></tr>
          </thead>
          <tbody>
            {displayedHistory.map(payment => <tr key={payment.id} className="border-b border-slate-100 text-slate-700">
              <td className="px-3 py-3">{new Date(payment.submittedAt).toLocaleDateString('en-IN')}</td>
              <td className="px-3 py-3 capitalize">{payment.purpose === 'topup' ? 'Credit top-up' : payment.purpose}</td>
              <td className="px-3 py-3 font-semibold">{formatMoney(payment.expectedAmount)}</td>
              <td className="px-3 py-3">{statuses[payment.status] || payment.status}</td>
            </tr>)}
          </tbody>
        </table>
        {!displayedHistory.length && !historyLoading && <p className="p-4 text-center text-xs text-slate-500">No matching payments on this page.</p>}
        {historyLoading && <p className="p-4 text-center text-xs text-slate-500">Loading payments…</p>}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">Page {cursorStack.length} · up to 10 payments per page</span>
        <div className="flex gap-2">
          <button type="button" disabled={historyLoading || cursorStack.length <= 1} onClick={() => {
            const previous = cursorStack.slice(0, -1); setCursorStack(previous); void loadHistory(previous[previous.length - 1]);
          }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs disabled:opacity-40">Previous</button>
          <button type="button" disabled={historyLoading || !nextCursor} onClick={() => {
            if (!nextCursor) return; setCursorStack(current => [...current, nextCursor]); void loadHistory(nextCursor);
          }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs disabled:opacity-40">Next</button>
        </div>
      </div>
      {historyFilter === 'topup' && <p className="mt-2 text-[11px] text-slate-500">Pagination follows all payments. Some pages may have no top-ups; use Next to browse older requests.</p>}
    </section>}
  </div>;
}
