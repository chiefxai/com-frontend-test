import React from 'react';
import WorkspaceAddonPurchases, { type PaymentDisplayFilter, type PaymentStatusFilter } from './WorkspaceAddonPurchases';
import { useAuthorization, canAllocateOrganizationCredits } from '../../lib/authorization';
import { ArrowDownToLine, CheckCircle2, Clock3, Plus, RefreshCw, Wallet, ReceiptText, Info } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { billingClient, newBillingIdempotencyKey } from '../../lib/billing/client';
import type { BillingAmount, BillingOverview, PaymentHistoryType, PaymentRequest } from '../../lib/billing/types';
import KpiCard from '../ui/KpiCard';
import { Card, CardHeader } from '../ui/Card';
import FilterBar from '../ui/FilterBar';
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
  const { authorization } = useAuthorization();
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
  const [activityView, setActivityView] = React.useState<PaymentDisplayFilter>('all');
  const [paymentStatus, setPaymentStatus] = React.useState<PaymentStatusFilter>('all');
  const [paymentSearch, setPaymentSearch] = React.useState('');
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
        <>
          <div className="col-span-12 grid grid-cols-12 gap-3" aria-label="Available credit balances">
            <KpiCard span={{ xs: 12, sm: 6 }} icon={Wallet} iconPosition="top-left"
              iconBg="var(--accent-subtle)" iconColor="var(--accent)"
              label="Subscription credits remaining" value={overview ? sumBalance(subscriptionCredits) : '—'} />
            <KpiCard span={{ xs: 12, sm: 6 }} icon={ArrowDownToLine} iconPosition="top-left"
              iconBg="var(--accent-subtle)" iconColor="var(--accent)"
              label="Top-up credits remaining" value={overview ? sumBalance(topupCredits) : '—'} />
          </div>
          <Card padding="sm" className="col-span-12 min-w-0 sm:!p-5">
            <CardHeader title="Available credits" subtitle="Remaining credits in your organization's two pools" icon={Wallet}
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="secondary" size="sm" icon={RefreshCw} onClick={() => void loadOverview()}>Refresh</Button>
                  {canAllocate && onNavigate && <Button type="button" variant="secondary" size="sm" icon={Wallet}
                    onClick={() => onNavigate('allocation')}>Allocate credits</Button>}
                  {canSubmit && <Button type="button" variant="primary" size="sm" icon={Plus}
                    disabled={!canTopup} onClick={() => onNavigate ? onNavigate('topup') : setShowForm(true)}>Add credits</Button>}
                </div>
              } />
            <p className="text-sm text-[var(--text-secondary)]">Plan credits and approved top-up credits remain in separate pools until allocated to workspaces.</p>
            {overviewError && <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-300">Could not load credit balances: {overviewError}</p>}
          </Card>
        </>
      )}
      {view === 'topup' && (
        <Card padding="sm" className="col-span-12 min-w-0 sm:!p-5">
          <CardHeader title="Add credits" subtitle="Credits become available after your receipt is approved" icon={Wallet}
            action={<Button type="button" variant="secondary" size="sm" icon={RefreshCw} onClick={() => void refresh()}>Refresh</Button>} />
          {canSubmit && initialLoadComplete && !canTopup && <p role="status" className="text-sm text-[var(--text-secondary)]">
            Adding credits is unavailable until billing and payment review are enabled.
          </p>}
          {!canSubmit && <p className="text-sm text-[var(--text-secondary)]">Only administrators with payment-submission permission can add credits.</p>}
          {overviewError && <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">{overviewError}</p>}
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
        <Card padding="sm" className="col-span-12 min-w-0 sm:!p-5">
          <CardHeader title="Payments and workspace invoices"
            subtitle="One place to check receipts, invoices, and extra workspace charges"
            icon={ReceiptText} action={
              <Button type="button" variant="secondary" size="sm" icon={RefreshCw}
                onClick={() => void refresh()}>Refresh</Button>
            } />
          <FilterBar className="mb-4"
            search={{ value: paymentSearch, onChange: setPaymentSearch, placeholder: 'Find a payment or workspace…' }}
            hasActiveFilters={activityView !== 'all' || historyFilter !== 'all' || paymentStatus !== 'all' || Boolean(paymentSearch)}
            onClear={() => {
              setActivityView('all'); setHistoryFilter('all'); setPaymentStatus('all'); setPaymentSearch('');
            }}
            selects={[
              { key: 'Payment records', label: 'Payment records', value: activityView,
                onChange: value => {
                  const next = value as PaymentDisplayFilter;
                  setActivityView(next);
                  if (next === 'workspace' && !['all', 'workspace'].includes(historyFilter)) setHistoryFilter('workspace');
                },
                options: [
                  { label: 'All records', value: 'all' },
                  { label: 'Submitted payments only', value: 'submitted' },
                  { label: 'Workspace invoices only', value: 'workspace' },
                ] },
              { key: 'Payment type', label: 'Payment type', value: historyFilter,
                onChange: value => {
                  const next = value as PaymentHistoryType;
                  setHistoryFilter(next);
                  if (activityView === 'workspace' && next !== 'all' && next !== 'workspace') setActivityView('submitted');
                },
                options: [
                  { label: 'All types', value: 'all' },
                  { label: 'Credit top-ups', value: 'topup' },
                  { label: 'Workspace add-ons', value: 'workspace' },
                  { label: 'Subscriptions', value: 'subscription' },
                  { label: 'Other invoices', value: 'invoice' },
                ] },
              { key: 'Payment status', label: 'Payment status', value: paymentStatus,
                onChange: value => setPaymentStatus(value as PaymentStatusFilter),
                options: [
                  { label: 'All statuses', value: 'all' },
                  { label: 'Payment needed / needs attention', value: 'action' },
                  { label: 'Waiting for approval', value: 'review' },
                  { label: 'Approved / active', value: 'completed' },
                ] },
            ]}
          />
          {historyError && <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-300">
            Submitted payments could not be loaded: {historyError}. Workspace invoices may still be available.
          </p>}
          <div className="mt-4">
            <WorkspaceAddonPurchases
              canSubmit={canSubmit}
              submittedPayments={history}
              displayFilter={activityView}
              statusFilter={paymentStatus}
              showWorkspace={historyFilter === 'all' || historyFilter === 'workspace'}
              showSubmitted
              submittedLoading={historyLoading}
              searchTerm={paymentSearch}
              onChange={refresh}
            />
          </div>
          {activityView !== 'workspace' && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
            <p className="text-xs text-[var(--text-muted)]">
              Submitted receipts: page {cursorStack.length}, up to 10 per page. Workspace invoices are loaded separately.
            </p>
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
          </div>}
        </Card>
      )}

    </div>
  );
}
