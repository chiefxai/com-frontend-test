import React from 'react';
import WorkspaceAddonPurchases from './WorkspaceAddonPurchases';
import { useAuthorization } from '../../lib/authorization';
import { ArrowDownToLine, CheckCircle2, Clock3, CreditCard, Plus, RefreshCw, Wallet } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { billingClient, newBillingIdempotencyKey } from '../../lib/billing/client';
import type { BillingAmount, BillingOverview, PaymentRequest } from '../../lib/billing/types';
import DataTable from '../ui/DataTable';
import KpiCard from '../ui/KpiCard';
import Widget from '../ui/Widget';

type Quote = { quoteId: string; paymentAmount: BillingAmount; topupCredits: BillingAmount; validUntil: string };
const TOPUP_PRESETS = [500, 1000, 2500, 5000] as const;
const formatMoney = (amount: BillingAmount) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })
    .format(Number(amount.units) / 10 ** amount.scale);

export type BillingPanel = 'dashboard' | 'credits' | 'topup' | 'payments' | 'plan' | 'usage';
export default function OrganizationTopUp({ canSubmit = false, view = 'dashboard', onNavigate }: { canSubmit?: boolean; view?: BillingPanel; onNavigate?: (view: BillingPanel) => void }) {
  const {can} = useAuthorization();
  const [showForm, setShowForm] = React.useState(false);
  const [overview, setOverview] = React.useState<BillingOverview | null>(null);
  const [overviewError, setOverviewError] = React.useState('');
  const [topupAvailable, setTopupAvailable] = React.useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = React.useState(false);
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

  const loadCapabilities = React.useCallback(async () => {
    try {
      const response = await apiFetch('/api/billing/capabilities');
      const body = await response.json();
      setTopupAvailable(response.ok && body.topupAvailable === true);
    } catch { setTopupAvailable(false); }
  }, []);

  const refresh = React.useCallback(async () => {
    await Promise.all([loadOverview(), loadHistory(null), loadCapabilities()]);
    setCursorStack([null]);
    setInitialLoadComplete(true);
  }, [loadOverview, loadHistory, loadCapabilities]);
  React.useEffect(() => { void refresh(); }, [refresh]);
  const displayedHistory = history.filter(item => historyFilter === 'all' || item.purpose === 'topup');
  const recentPayments = overview?.recentPayments || history;
  const balances = overview?.balances || [];
  const subscriptionCredits = balances.filter(balance => balance.kind === 'subscription');
  const topupCredits = balances.filter(balance => balance.kind === 'topup');
  const sumBalance = (items: typeof balances) => items.every(item => item.available.asset === 'INR' && item.available.scale === 2)
    ? formatMoney({ asset: 'INR', units: items.reduce((sum, item) => sum + BigInt(item.available.units), 0n).toString(), scale: 2 })
    : '—';
  const canTopup = canSubmit && topupAvailable && Boolean(overview);

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
    if (!canTopup) { setError('Top-up submissions are currently unavailable.'); return; }
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
    approved: 'Approved',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
  };

  return <div className="col-span-12 grid grid-cols-12 content-start gap-4 md:gap-5 xl:gap-6" id="organization-billing-overview">
    {(view === 'plan' || view === 'payments') && can('billing.organization.read') && <Widget title="Additional workspace billing" subtitle="Manage purchase approvals and monthly workspace renewals." icon={CreditCard} accent="#f59e0b" padding="none">
      <WorkspaceAddonPurchases canSubmit={canSubmit}/>
    </Widget>}
    {view === 'dashboard' && (
      <Widget
        title="Credit balances & recent payments"
        subtitle="Prepaid usage credit balances and payment activity for the organization."
        icon={Wallet}
        padding="md"
        action={
          <button type="button" onClick={() => void refresh()}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] px-3 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)]">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        }
      >
        <div className="grid grid-cols-12 gap-3 pt-1 sm:gap-4">
          <KpiCard colSpan={6} span={{ xs: 12, sm: 6, lg: 6 }} icon={Wallet} iconPosition="top-left"
            label="Subscription credits" value={overview ? sumBalance(subscriptionCredits) : '—'}
            sub="Usage credits provided through your subscription; may expire." />
          <KpiCard colSpan={6} span={{ xs: 12, sm: 6, lg: 6 }} icon={ArrowDownToLine} iconPosition="top-left"
            label="Added credits" value={overview ? sumBalance(topupCredits) : '—'}
            sub="Extra prepaid credits available after payment approval." />
        </div>
        {overviewError && (
          <p role="alert" className="mt-3 text-xs text-amber-700 dark:text-amber-300">
            Credit balances are unavailable: {overviewError}
          </p>
        )}
        <p className="mt-4 text-xs leading-5 text-[var(--text-muted)]">
          Credits are available for usage; they are not the monthly subscription price.
          Submitting a top-up payment does not increase this balance until it is approved.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => onNavigate?.('credits')}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)]">
            View credit details
          </button>
          {canTopup && (
            <button type="button" onClick={() => onNavigate?.('topup')}
              className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90">
              Add credits
            </button>
          )}
        </div>

        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Recent payments</h3>
            <button type="button" onClick={() => onNavigate?.('payments')}
              className="text-xs font-semibold text-[var(--accent)] hover:underline">View payment history</button>
          </div>
          {recentPayments.length ? (
            <ul className="mt-2 divide-y divide-[var(--border)]">
              {recentPayments.slice(0, 3).map(payment => (
                <li key={payment.id} className="flex flex-col gap-2 py-3 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <span className="min-w-0 flex-1 text-[var(--text-secondary)]">
                    <span className="block font-medium text-[var(--text-primary)]">{payment.purpose === 'topup' ? 'Credit top-up' : payment.purpose}</span>
                    <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">{new Date(payment.submittedAt).toLocaleDateString('en-IN')}</span>
                  </span>
                  <span className="font-semibold tabular-nums text-[var(--text-primary)]">{formatMoney(payment.expectedAmount)}</span>
                  <span className="w-fit rounded-md bg-[var(--bg-subtle)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
                    {statuses[payment.status] || payment.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-xs text-[var(--text-muted)]">No payments have been recorded yet.</p>}
        </div>
      </Widget>
    )}
    {(view === 'credits' || view === 'topup') && <>

    <Widget title="Organization credits & payments" subtitle="Check available usage credits, add credits, and track submitted payments." icon={Wallet} accent="#f59e0b" padding="md" action={<div className="flex items-center gap-2"><button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)]"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>{canSubmit && <button type="button" onClick={() => { setShowForm(current => !current); setError(''); }} disabled={!canTopup} className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" /> Top up</button>}</div>}>
      <div className="grid grid-cols-12 gap-4 pt-2">
        <KpiCard colSpan={4} span={{ xs: 12, sm: 6, lg: 4 }} label="Available subscription credits" value={overview ? sumBalance(subscriptionCredits) : '—'} sub="Issued with your subscription, subject to expiry." icon={Wallet} iconBg="var(--accent-subtle)" iconColor="var(--accent)" />
        <KpiCard colSpan={4} span={{ xs: 12, sm: 6, lg: 4 }} label="Available top-up credits" value={overview ? sumBalance(topupCredits) : '—'} sub="Purchased credits added after payment approval." icon={ArrowDownToLine} iconBg="var(--accent-subtle)" iconColor="var(--accent)" />
        <KpiCard colSpan={4} span={{ xs: 12, sm: 6, lg: 4 }} label="Subscription period" value={overview?.activePeriod?.status || 'Not available'} sub={overview?.activePeriod?.endsAt ? `Ends ${new Date(overview.activePeriod.endsAt).toLocaleDateString('en-IN')}` : 'Your subscription billing details.'} icon={CreditCard} iconBg="#e0f2fe" iconColor="#0369a1" />
      </div>
      {overviewError && <p role="status" className="mt-3 text-xs text-amber-700">Credit ledger unavailable: {overviewError}. The figures below may use the separate legacy billing view.</p>}
      {canSubmit && initialLoadComplete && !canTopup && <p role="status" className="mt-3 text-xs text-[var(--text-muted)]">Top-up submissions are unavailable until the billing ledger and payment review flow are enabled.</p>}
      {!canSubmit && <p className="mt-3 text-xs text-slate-500">Top-up submission is available to organization owners, organization admins and billing admins with payment-submission permission.</p>}
    </Widget>

    {canTopup && (showForm || view === 'topup') && <Widget title="Request additional usage credits" subtitle="Pay by bank transfer or UPI outside this page, then upload proof. ₹1 paid provides ₹1 of usage credits; your subscription plan stays unchanged." icon={Plus} accent="#f59e0b" padding="md">
      <p className="mb-4 text-xs text-amber-700">Submitting proof does not add credits. A platform admin must verify and approve the payment.</p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <p className="text-xs font-medium text-[var(--text-secondary)]">Choose an amount</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {TOPUP_PRESETS.map(value => <button key={value} type="button" aria-pressed={amount === String(value)}
              onClick={() => { setAmount(String(value)); resetQuote(); }}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${amount === String(value)
                ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                : 'border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-primary)] hover:border-[var(--accent)]'}`}>
              ₹{value.toLocaleString('en-IN')}
            </button>)}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-medium text-[var(--text-secondary)]">Top-up amount (₹)
            <input required value={amount} onChange={e => { setAmount(e.target.value); resetQuote(); }}
              placeholder="1000.00" inputMode="decimal" className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
            <span className="mt-1 block text-[11px] font-normal text-slate-500">₹1 to ₹999,999.99, up to two decimal places.</span>
          </label>
          <label className="block text-xs font-medium text-[var(--text-secondary)]">Bank or UPI transaction reference
            <input required value={reference} onChange={e => { setReference(e.target.value); setPaymentKey(newBillingIdempotencyKey()); setError(''); }}
              placeholder="UTR or payment reference" className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]" />
          </label>
        </div>
        <label className="block text-xs font-medium text-[var(--text-secondary)]">Payment receipt
          <input required type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            onChange={e => { setProof(e.target.files?.[0] || null); setPaymentKey(newBillingIdempotencyKey()); setError(''); }} className="mt-1 block w-full text-xs" />
          <span className="mt-1 block text-[11px] font-normal text-slate-500">PDF, JPG, PNG or WEBP; maximum 10 MB.</span>
        </label>
        <label className="block text-xs font-medium text-[var(--text-secondary)]">Payment note (optional)
          <textarea value={note} onChange={e => { setNote(e.target.value); setPaymentKey(newBillingIdempotencyKey()); }} maxLength={2000} rows={2}
            className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)]" />
        </label>
        {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={() => { setShowForm(false); if (view === 'topup') onNavigate?.('credits'); }} disabled={busy} className="px-3 py-2 text-sm text-slate-500">Cancel</button>
          <button type="submit" disabled={busy || Boolean(success)} className="rounded-xl bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {busy ? 'Submitting…' : quote ? 'Retry payment submission' : 'Submit for verification'}
          </button>
        </div>
      </form>
    </Widget>}

    </>}
    {success && <Widget showHeader={false} padding="md" className="border-emerald-200 bg-emerald-50"><p role="status" className="text-xs font-medium text-emerald-800"><CheckCircle2 className="mr-2 inline h-4 w-4" />{success}</p></Widget>}
    {view === 'payments' && <Widget title="Payment history" subtitle="Track top-up verification and other organization payments." icon={Clock3} accent="#64748b" padding="md" action={<select aria-label="Payment type" value={historyFilter} onChange={e => setHistoryFilter(e.target.value as 'topup' | 'all')} className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)]">
          <option value="topup">Top-up payments</option><option value="all">All payments</option>
        </select>}>
      {historyError && <p role="alert" className="mt-3 text-xs text-rose-700">{historyError}</p>}
      <div className="mt-4">
        <DataTable<PaymentRequest> bare resizable loading={historyLoading} columns={[
          { key: 'date', header: 'Date', cell: payment => new Date(payment.submittedAt).toLocaleDateString('en-IN') },
          { key: 'type', header: 'Type', cell: payment => payment.purpose === 'topup' ? 'Credit top-up' : payment.purpose },
          { key: 'amount', header: 'Amount', cell: payment => <span className="font-semibold">{formatMoney(payment.expectedAmount)}</span> },
          { key: 'status', header: 'Status', cell: payment => statuses[payment.status] || payment.status },
        ]} rows={displayedHistory} rowKey={payment => payment.id} emptyMessage="No matching payments on this page." />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">Page {cursorStack.length} · up to 10 payments per page</span>
        <div className="flex gap-2">
          <button type="button" disabled={historyLoading || cursorStack.length <= 1} onClick={() => {
            const previous = cursorStack.slice(0, -1); setCursorStack(previous); void loadHistory(previous[previous.length - 1]);
          }} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-secondary)] disabled:opacity-40">Previous</button>
          <button type="button" disabled={historyLoading || !nextCursor} onClick={() => {
            if (!nextCursor) return; setCursorStack(current => [...current, nextCursor]); void loadHistory(nextCursor);
          }} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-secondary)] disabled:opacity-40">Next</button>
        </div>
      </div>
      {historyFilter === 'topup' && <p className="mt-2 text-[11px] text-slate-500">Pagination follows all payments. Some pages may have no top-ups; use Next to browse older requests.</p>}
    </Widget>}
  </div>;
}
