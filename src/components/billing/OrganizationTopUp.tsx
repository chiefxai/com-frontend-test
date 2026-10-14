import React from 'react';
import WorkspaceAddonPurchases from './WorkspaceAddonPurchases';
import SubscriptionCreditStatusPanel from './SubscriptionCreditStatusPanel';
import { useAuthorization, canAllocateOrganizationCredits } from '../../lib/authorization';
import { ArrowDownToLine, CheckCircle2, Clock3, CreditCard, Plus, RefreshCw, Wallet, ReceiptText, Info } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { billingClient, newBillingIdempotencyKey } from '../../lib/billing/client';
import type { BillingAmount, BillingOverview, PaymentHistoryType, PaymentRequest } from '../../lib/billing/types';
import DataTable from '../ui/DataTable';
import KpiCard from '../ui/KpiCard';
import { Card, CardHeader } from '../ui/Card';
import Button from '../ui/Button';

type Quote = { quoteId: string; paymentAmount: BillingAmount; topupCredits: BillingAmount; validUntil: string };
const TOPUP_PRESETS = [500, 1000, 2500, 5000] as const;
const formatMoney = (amount: BillingAmount) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })
    .format(Number(amount.units) / 10 ** amount.scale);

export type BillingPanel = 'dashboard' | 'credits' | 'topup' | 'payments' | 'plan' | 'usage' | 'allocation';

/** Never call a generic invoice payment a workspace add-on without invoice metadata. */
export function paymentTypeLabel(payment: PaymentRequest): string {
  if (payment.purpose === 'topup') return 'Credit top-up';
  if (payment.purpose === 'subscription') return 'Subscription payment';
  if (payment.purpose === 'invoice' && payment.workspaceAddonName) return 'Workspace add-on';
  return 'Invoice payment';
}

export default function OrganizationTopUp({ canSubmit = false, view = 'dashboard', onNavigate }: { canSubmit?: boolean; view?: BillingPanel; onNavigate?: (view: BillingPanel) => void }) {
  const { can, authorization } = useAuthorization();
  const canAllocate = canAllocateOrganizationCredits(authorization);
  const [showForm, setShowForm] = React.useState(false);
  const [overview, setOverview] = React.useState<BillingOverview | null>(null);
  const [overviewError, setOverviewError] = React.useState('');
  const [topupAvailable, setTopupAvailable] = React.useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = React.useState(false);
  const [historyError, setHistoryError] = React.useState('');
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [cursorStack, setCursorStack] = React.useState<(string | null)[]>([null]);
  const [historyFilter, setHistoryFilter] = React.useState<PaymentHistoryType>('all');
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
      const page = await billingClient.payments(cursor, 10, historyFilter);
      setHistory(page.rows);
      setNextCursor(page.nextCursor);
      setHistoryError('');
    } catch (cause) {
      setHistory([]);
      setHistoryError(cause instanceof Error ? cause.message : 'Could not load payment history.');
    } finally {
      setHistoryLoading(false);
    }
  }, [historyFilter]);

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
  const recentPayments = overview?.recentPayments || history;
  const balances = overview?.balances || [];
  const subscriptionCredits = balances.filter(balance => balance.kind === 'subscription');
  const topupCredits = balances.filter(balance => balance.kind === 'topup');
  const sumBalance = (items: typeof balances) => items.every(item => item.available.asset === 'INR' && item.available.scale === 2)
    ? formatMoney({ asset: 'INR', units: items.reduce((sum, item) => sum + BigInt(item.available.units), 0n).toString(), scale: 2 })
    : '—';
  const canTopup = canSubmit && topupAvailable && Boolean(overview);
  const awaitingReviewOnPage = history.filter(payment => ['pending_verification', 'submitted', 'needs_information', 'needs_clarification'].includes(payment.status)).length;

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

  return (
    <div className="col-span-12 grid grid-cols-12 content-start gap-4 md:gap-5" id="organization-billing-overview">
      {view === 'dashboard' && (
        <>
          <Card padding="sm" className="col-span-12 min-w-0 lg:col-span-7 sm:!p-5">
            <CardHeader title="Available usage credits" subtitle="Credits that can pay for metered usage"
              icon={Wallet} action={
                <Button type="button" variant="secondary" size="sm" icon={RefreshCw} onClick={() => void refresh()}>
                  Refresh
                </Button>
              } />
            <p className="mb-4 text-sm leading-6 text-[var(--text-secondary)]">These credits help pay for services like AI calls. Credits included in your plan and credits you buy are kept separate.</p>
            <div className="grid grid-cols-12 gap-3">
              <KpiCard colSpan={6} span={{ xs: 12, sm: 6 }} icon={Wallet} iconPosition="top-left"
                label="From your plan" value={overview ? sumBalance(subscriptionCredits) : '—'}
                sub="Included with your plan" />
              <KpiCard colSpan={6} span={{ xs: 12, sm: 6 }} icon={ArrowDownToLine} iconPosition="top-left"
                label="Credits you added" value={overview ? sumBalance(topupCredits) : '—'}
                sub="Approved top-up payments" />
            </div>
            {overviewError && <p role="alert" className="mt-3 text-xs text-rose-600 dark:text-rose-300">Credits unavailable: {overviewError}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => onNavigate?.('credits')}>View credits</Button>
              {canTopup && <Button type="button" variant="primary" size="sm" icon={Plus}
                onClick={() => onNavigate?.('topup')}>Add credits</Button>}
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs text-[var(--text-secondary)]"><Info aria-hidden="true" className="h-4 w-4 shrink-0" /> New credits appear only after payment approval.</p>
          </Card>
          <Card padding="sm" className="col-span-12 min-w-0 lg:col-span-5 sm:!p-5">
            <CardHeader title="Recent payments" subtitle="A quick look at your latest receipts"
              icon={Clock3} action={
                <Button type="button" variant="secondary" size="sm" onClick={() => onNavigate?.('payments')}>
                  View all
                </Button>
              } />
            {recentPayments.length ? (
              <ul className="divide-y divide-[var(--border)]">
                {recentPayments.slice(0, 4).map(payment => (
                  <li key={payment.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[var(--text-primary)]">
                        {paymentTypeLabel(payment)}
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">{new Date(payment.submittedAt).toLocaleDateString('en-IN')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold tabular-nums text-[var(--text-primary)]">{formatMoney(payment.expectedAmount)}</p>
                      <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{statuses[payment.status] || payment.status}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-5 text-xs text-[var(--text-muted)]">{historyError ? 'Payment history is temporarily unavailable.' : 'No payment requests yet.'}</p>
            )}
          </Card>
        </>
      )}

      {view === 'credits' && (
        <section className="col-span-12 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 sm:p-6" aria-label="Credit guide">
          <span className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-subtle)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">
            <Wallet aria-hidden="true" className="h-3.5 w-3.5" /> Your credits
          </span>
          <h2 className="mt-3 text-xl font-bold text-[var(--text-primary)] sm:text-2xl">Know what you can spend</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
            Credits are like a balance for services such as calls. Some come with your plan, and others come from payments you make.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-[var(--bg-subtle)] p-4">
              <p className="text-sm text-[var(--text-secondary)]">Credits from your plan</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text-primary)]">{overview ? sumBalance(subscriptionCredits) : '—'}</p>
              <p className="mt-2 text-xs text-[var(--text-muted)]">Available from your subscription</p>
            </div>
            <div className="rounded-xl bg-[var(--bg-subtle)] p-4">
              <p className="text-sm text-[var(--text-secondary)]">Credits you added</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text-primary)]">{overview ? sumBalance(topupCredits) : '—'}</p>
              <p className="mt-2 text-xs text-[var(--text-muted)]">Available from approved top-ups</p>
            </div>
          </div>
          <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-[var(--text-secondary)]"><Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> Your plan may promise monthly credits, but they cannot be spent until they have actually been issued. See the status below.</p>
        </section>
      )}
      {(view === 'credits' || view === 'plan') && can('billing.organization.read') && <SubscriptionCreditStatusPanel />}
      {(view === 'credits' || view === 'topup') && (
        <Card padding="sm" className="col-span-12 min-w-0 sm:!p-5">
          <CardHeader title={view === 'credits' ? 'Your balance and options' : 'Credit balances'} subtitle="Manage credits or view your plan period"
            icon={Wallet} action={
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" icon={RefreshCw} onClick={() => void refresh()}>
                  Refresh
                </Button>
                {canAllocate && view === 'credits' && onNavigate && <Button type="button" variant="secondary" size="sm"
                  icon={Wallet} onClick={() => onNavigate('allocation')}>Allocate credits</Button>}
                {canSubmit && view === 'credits' && <Button type="button" variant="primary" size="sm" icon={Plus}
                  disabled={!canTopup} onClick={() => onNavigate ? onNavigate('topup') : setShowForm(true)}>
                  Add credits
                </Button>}
              </div>
            } />
          <div className="grid grid-cols-12 gap-3">
            <KpiCard colSpan={4} span={{ xs: 12, sm: 6, lg: 4 }} iconPosition="top-left" icon={Wallet}
              label="Plan credits available" value={overview ? sumBalance(subscriptionCredits) : '—'}
              sub="Provided with your subscription" />
            <KpiCard colSpan={4} span={{ xs: 12, sm: 6, lg: 4 }} iconPosition="top-left" icon={ArrowDownToLine}
              label="Extra credits available" value={overview ? sumBalance(topupCredits) : '—'}
              sub="Added after approval" />
            <KpiCard colSpan={4} span={{ xs: 12, sm: 6, lg: 4 }} iconPosition="top-left" icon={CreditCard}
              label="Current plan period" value={overview?.activePeriod?.status === 'active' ? 'Active' : overview?.activePeriod?.status || 'Not available'}
              sub={overview?.activePeriod?.endsAt
                ? `Ends ${new Date(overview.activePeriod.endsAt).toLocaleDateString('en-IN')}`
                : 'Current subscription'} />
          </div>
          {overviewError && <p role="alert" className="mt-3 text-xs text-rose-600 dark:text-rose-300">Credit ledger unavailable: {overviewError}</p>}
          {canSubmit && initialLoadComplete && !canTopup && <p role="status" className="mt-3 text-xs text-[var(--text-muted)]">
            Adding credits is unavailable until the billing ledger and payment review flow are enabled.
          </p>}
          {!canSubmit && <p className="mt-3 text-xs text-[var(--text-muted)]">
            Only administrators with payment-submission permission can add credits.
          </p>}
        </Card>
      )}

      {canTopup && !success && (view === 'topup' || showForm) && (
        <Card padding="sm" className="col-span-12 min-w-0 sm:!p-5">
          <CardHeader title="Add usage credits" icon={Plus}
            subtitle="Transfer the payment externally, then submit your receipt for approval." />
          <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)]/50 px-3.5 py-3">
            <p className="text-xs font-semibold text-[var(--text-primary)]">How payment verification works</p>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              1. Choose your amount. 2. Complete a bank or UPI transfer. 3. Upload proof and submit.
              Credits are added only after the platform team approves the payment. ₹1 paid provides ₹1 usage credit.
            </p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-[var(--text-primary)]" htmlFor="billing-topup-amount">Top-up amount (INR)</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {TOPUP_PRESETS.map(value => (
                  <button key={value} type="button" aria-pressed={amount === String(value)}
                    onClick={() => { setAmount(String(value)); resetQuote(); }}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${amount === String(value)
                      ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                      : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'}`}>
                    ₹{value.toLocaleString('en-IN')}
                  </button>
                ))}
              </div>
              <input id="billing-topup-amount" required value={amount}
                onChange={event => { setAmount(event.target.value); resetQuote(); }}
                placeholder="Enter amount" inputMode="decimal"
                className="mt-2 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-subtle)] sm:max-w-sm" />
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">Minimum ₹1; maximum ₹999,999.99.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                Bank or UPI reference
                <input required value={reference}
                  onChange={event => { setReference(event.target.value); setPaymentKey(newBillingIdempotencyKey()); setError(''); }}
                  placeholder="Enter UTR / transaction ID"
                  className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
              </label>
              <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                Payment receipt
                <input required type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                  onChange={event => { setProof(event.target.files?.[0] || null); setPaymentKey(newBillingIdempotencyKey()); setError(''); }}
                  className="mt-1.5 block w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-2 text-xs text-[var(--text-primary)]" />
                <span className="mt-1 block text-[11px] font-normal text-[var(--text-muted)]">PDF or image, up to 10 MB</span>
              </label>
            </div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)]">
              Note (optional)
              <textarea rows={2} maxLength={2000} value={note}
                onChange={event => { setNote(event.target.value); setPaymentKey(newBillingIdempotencyKey()); }}
                className="mt-1.5 block w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-3 text-sm text-[var(--text-primary)]" />
            </label>
            {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-300">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-4">
              <Button type="button" size="sm" variant="secondary" disabled={busy}
                onClick={() => { setShowForm(false); if (view === 'topup') onNavigate?.('credits'); }}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={busy} disabled={Boolean(success)}>
                {quote ? 'Retry payment submission' : 'Submit for verification'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {success && (
        <Card padding="sm" className="col-span-12 border-emerald-300/60">
          <p role="status" className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-600" />{success}
          </p>
        </Card>
      )}

      {view === 'payments' && (
        <section className="col-span-12 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 sm:p-6" aria-label="Payment guide">
          <span className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-subtle)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">
            <ReceiptText aria-hidden="true" className="h-3.5 w-3.5" /> Payment history
          </span>
          <h2 className="mt-3 text-xl font-bold text-[var(--text-primary)] sm:text-2xl">Know where your payments stand</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
            When you send a receipt, our team checks it. Look here to see if each payment is waiting, approved, or needs attention.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-[var(--bg-subtle)] p-4">
              <p className="text-sm text-[var(--text-secondary)]">Payments on this page</p>
              <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{historyLoading ? '—' : history.length}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Use the filter below to choose a payment type</p>
            </div>
            <div className="rounded-xl bg-[var(--bg-subtle)] p-4">
              <p className="text-sm text-[var(--text-secondary)]">Waiting for review on this page</p>
              <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{historyLoading ? '—' : awaitingReviewOnPage}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Includes requests for more information</p>
            </div>
          </div>
        </section>
      )}
      {view === 'payments' && (
        <Card padding="sm" className="col-span-12 min-w-0 sm:!p-5">
          <CardHeader title="All submitted payments" subtitle="Filter your receipts and see what happens next"
            icon={Clock3} action={
              <div className="flex flex-wrap items-center gap-2">
                <select aria-label="Payment type" value={historyFilter}
                  onChange={event => setHistoryFilter(event.target.value as PaymentHistoryType)}
                  className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-2 text-xs text-[var(--text-primary)]">
                  <option value="all">All payments</option>
                  <option value="topup">Credit top-ups</option>
                  <option value="workspace">Workspace add-ons</option>
                  <option value="subscription">Subscriptions</option>
                  <option value="invoice">Other invoice payments</option>
                </select>
                <Button type="button" size="sm" variant="secondary" icon={RefreshCw}
                  onClick={() => void refresh()}>Refresh</Button>
              </div>
            } />
          {historyError && <p role="alert" className="mb-3 text-xs text-rose-600 dark:text-rose-300">{historyError}</p>}
          <DataTable<PaymentRequest> bare resizable loading={historyLoading}
            columns={[
              { key: 'date', header: 'Sent on', cell: payment => new Date(payment.submittedAt).toLocaleDateString('en-IN') },
              { key: 'type', header: 'What you paid for', cell: payment => (
                <span>
                  <span className="block font-medium text-[var(--text-primary)]">{paymentTypeLabel(payment)}</span>
                  {payment.workspaceAddonName && <span className="block text-[11px] text-[var(--text-muted)]">{payment.workspaceAddonName}</span>}
                </span>
              ) },
              { key: 'amount', header: 'Amount', cell: payment => <span className="font-semibold tabular-nums">{formatMoney(payment.expectedAmount)}</span> },
              { key: 'status', header: 'What happens next', cell: payment => (
                <span className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  payment.status === 'approved' ? 'border-emerald-300/70 bg-emerald-500/10 text-emerald-700' :
                  payment.status === 'rejected' || payment.status === 'cancelled' ? 'border-rose-300/70 bg-rose-500/10 text-rose-700' :
                  'border-amber-300/70 bg-amber-500/10 text-amber-700'
                }`}>
                  {statuses[payment.status] || payment.status}
                </span>
              ) },
            ]}
            rows={history} rowKey={payment => payment.id}
            emptyMessage={historyError ? 'Payment history is unavailable.' : 'No payments match this filter yet.'} />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
            <p className="text-[11px] text-[var(--text-muted)]">Page {cursorStack.length} · up to 10 payments per page</p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" size="sm"
                disabled={historyLoading || cursorStack.length <= 1}
                onClick={() => {
                  const previous = cursorStack.slice(0, -1);
                  setCursorStack(previous);
                  void loadHistory(previous[previous.length - 1]);
                }}>Previous</Button>
              <Button type="button" variant="secondary" size="sm"
                disabled={historyLoading || !nextCursor}
                onClick={() => {
                  if (!nextCursor) return;
                  setCursorStack(current => [...current, nextCursor]);
                  void loadHistory(nextCursor);
                }}>Next</Button>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">
            Only payments that have been submitted appear here. Unpaid workspace invoices are in the section below.
          </p>
        </Card>
      )}

      {(view === 'plan' || view === 'payments') && can('billing.organization.read') && (
        <Card padding="sm" className="col-span-12 min-w-0 sm:!p-5">
          <CardHeader title="Workspace invoices and add-ons" subtitle="Workspace charges and bills that may need payment"
            icon={CreditCard} />
          <WorkspaceAddonPurchases canSubmit={canSubmit} />
        </Card>
      )}
    </div>
  );
}
