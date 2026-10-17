import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  decidePlatformPayment, listPlatformPaymentReviews, platformPaymentReceipt,
  type PlatformPaymentReview, type PaymentDecision,
} from '../lib/billing/platformDecision';
import { newBillingIdempotencyKey } from '../lib/billing/client';
import DataTable, { type Column } from '../components/ui/DataTable';
import Widget from '../components/ui/Widget';
import FilterBar from '../components/ui/FilterBar';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';

const formatAmount = (amount: PlatformPaymentReview['expectedAmount']) => {
  const digits = BigInt(amount.units);
  const factor = 10n ** BigInt(amount.scale);
  const rupees = (digits / factor).toLocaleString('en-IN');
  const paise = (digits % factor).toString().padStart(amount.scale, '0');
  return `${amount.asset === 'INR' ? '₹' : amount.asset + ' '}${rupees}${amount.scale ? '.' + paise : ''}`;
};
const paymentPurpose = (payment: PlatformPaymentReview) => payment.subscriptionUpgrade
  ? `Subscription upgrade: ${payment.subscriptionUpgrade.currentPlan.id} → ${payment.subscriptionUpgrade.targetPlan.id}`
  : payment.workspaceAddon
  ? `Workspace add-on: ${payment.workspaceAddon.name}`
  : payment.purpose === 'topup' ? 'Add usage credits (top-up)' : payment.purpose === 'subscription' ? 'Subscription' : 'Invoice payment';

export default function PaymentReviewsPage() {
  const [rows, setRows] = useState<PlatformPaymentReview[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<'pending_verification' | 'all'>('pending_verification');
  const [selected, setSelected] = useState<PlatformPaymentReview | null>(null);
  const [reviewedProof, setReviewedProof] = useState(false);
  const [receivedUnits, setReceivedUnits] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: PaymentDecision; key: string } | null>(null);
  const { showToast } = useToast();

  const load = useCallback(async (nextCursor?: string | null, append = false) => {
    setLoading(true);
    setError('');
    try {
      const page = await listPlatformPaymentReviews(nextCursor, status);
      setRows(old => append ? [...old, ...page.rows] : page.rows);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to fetch payment reviews.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const choose = (row: PlatformPaymentReview) => {
    setSelected(row);
    setReviewedProof(false);
    setReceivedUnits(row.expectedAmount.units);
    setReason('');
    setPendingAction(null);
    setError('');
  };

  const openProof = async () => {
    if (!selected) return;
    setError('');
    try {
      const { url } = await platformPaymentReceipt(selected.orgId, selected.id);
      // Opens a short-lived private signed URL. It is never persisted in app state.
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to open receipt.');
    }
  };

  const decide = async (decision: PaymentDecision) => {
    if (!selected || busy) return;
    if (decision === 'approve' && (!selected.proofAvailable || !reviewedProof ||
      !/^\d+$/.test(receivedUnits) || receivedUnits !== selected.expectedAmount.units)) {
      setError('');
      showToast('Inspect the receipt and verify the exact expected payment amount before approval.', 'error');
      return;
    }
    if (decision !== 'approve' && !reason.trim()) {
      setError('');
      showToast('A reason is required for rejection or clarification.', 'error');
      return;
    }
    // Same action reuses its stable key if a retry is necessary.
    const action = pendingAction?.type === decision ? pendingAction : { type: decision, key: newBillingIdempotencyKey() };
    setPendingAction(action);
    setBusy(true);
    setError('');
    try {
      const outcome = await decidePlatformPayment(selected.orgId, selected.id, {
        decision, expectedVersion: selected.version,
        ...(decision === 'approve' ? {
          receivedAmount: { ...selected.expectedAmount, units: receivedUnits },
        } : { reason: reason.trim() }),
      }, { idempotencyKey: action.key });
      showToast(decision === 'approve' && selected.purpose === 'topup'
        ? outcome.funding?.status === 'active'
          ? `Top-up approved. ${formatAmount(selected.expectedAmount)} in usage credits was issued to this organization's credit pool.`
          : 'Top-up approved. Verify credit funding status before communicating the new balance.'
        : decision === 'approve' && selected.workspaceAddon
          ? `Workspace payment approved for ${selected.workspaceAddon.name}. Its paid access period has been activated.`
          : `Payment ${decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'sent for clarification'}.`, 'success');
      setSelected(null);
      setPendingAction(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Payment decision failed.');
    } finally {
      setBusy(false);
    }
  };

  return <section className="space-y-5">
    {error && <p role="alert" className="rounded-lg border border-rose-200 p-3 text-xs text-rose-700">{error}</p>}
    <Widget showHeader={false} padding="none">
      <div className="border-b border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <FilterBar
          selects={[{ key: 'status', label: 'Payment status', value: status,
            onChange: value => { setStatus(value as typeof status); setSelected(null); },
            options: [
              { label: 'Pending verification', value: 'pending_verification' },
              { label: 'All payments', value: 'all' },
            ] }]}
          resultCount={{ filtered: rows.length, total: rows.length, label: 'payments loaded' }}
          actions={<Button type="button" size="sm" variant="secondary" icon={RefreshCw}
            disabled={loading} onClick={() => void load()}>Refresh</Button>}
        />
      </div>
    <DataTable<PlatformPaymentReview>
      bare
      resizable
      paginated
      loading={loading && rows.length === 0}
      emptyMessage="No matching payments."
      columns={[
        { key: 'organization', header: 'Organization', cell: row => <div><div className="font-medium">{row.organizationName || row.orgId}</div><div className="font-mono text-xs text-[var(--text-muted)]">{row.orgId}</div></div> },
        { key: 'reference', header: 'Reference', cell: row => row.paymentReference || '—' },
        { key: 'purpose', header: 'Purpose', cell: row => paymentPurpose(row) },
        { key: 'expected', header: 'Expected amount', cell: row => <span className="font-semibold">{formatAmount(row.expectedAmount)}</span>, align: 'right' },
        { key: 'status', header: 'Status', cell: row => row.status },
        { key: 'submitted', header: 'Submitted', cell: row => <span className="whitespace-nowrap text-xs">{new Date(row.submittedAt).toLocaleString()}</span> },
        { key: 'action', header: 'Action', cell: row =>
          <button type="button" onClick={() => choose(row)} aria-label={`Review payment ${row.paymentReference || row.id}`}
            className="text-[var(--accent)] underline underline-offset-2">Review</button> },
      ] satisfies Column<PlatformPaymentReview>[]}
      rows={rows}
      rowKey={row => row.id}
      rowClassName={row => selected?.id === row.id ? 'bg-[var(--bg-subtle)]' : ''}
    />
    </Widget>
    {loading && rows.length > 0 && <p role="status" className="text-xs text-[var(--text-muted)]">Loading more payment reviews…</p>}
    {cursor && <button type="button" disabled={loading} onClick={() => void load(cursor, true)}
      className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm">Load more</button>}
    {selected && <div className="space-y-4 rounded-xl border border-[var(--border)] p-5">
      <h3 className="font-semibold">Review {paymentPurpose(selected)} · {formatAmount(selected.expectedAmount)}</h3>
      <p className="text-sm">Organization: {selected.organizationName || selected.orgId} <span className="font-mono text-xs text-[var(--text-muted)]">({selected.orgId})</span> · Reference: {selected.paymentReference || '—'} ·
        Version: {selected.version}</p>
      <p className="text-sm">Expected: {formatAmount(selected.expectedAmount)}. Check the bank record independently.</p>
      {selected.subscriptionUpgrade && <section aria-label="Subscription upgrade quote details" className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
        <h4 className="text-sm font-semibold">Subscription upgrade quote</h4>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-[var(--text-muted)]">Current plan</dt><dd>{selected.subscriptionUpgrade.currentPlan.id} · version {selected.subscriptionUpgrade.currentPlan.version}</dd></div>
          <div><dt className="text-xs text-[var(--text-muted)]">Target plan</dt><dd>{selected.subscriptionUpgrade.targetPlan.id} · version {selected.subscriptionUpgrade.targetPlan.version}</dd></div>
          <div><dt className="text-xs text-[var(--text-muted)]">Proration amount</dt><dd>{formatAmount(selected.subscriptionUpgrade.prorationAmount)}</dd></div>
          <div><dt className="text-xs text-[var(--text-muted)]">Incremental included credits</dt><dd>{formatAmount(selected.subscriptionUpgrade.incrementalIncludedCredits)}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs text-[var(--text-muted)]">Renewal anchor</dt><dd>{new Date(selected.subscriptionUpgrade.renewalAnchorAt).toLocaleString()}</dd></div>
        </dl>
      </section>}
      <button type="button" onClick={() => void openProof()} disabled={!selected.proofAvailable}
        className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
        {selected.proofAvailable ? 'Open private receipt' : 'Receipt unavailable'}
      </button>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={reviewedProof} onChange={event => { setReviewedProof(event.target.checked); setPendingAction(null); }} />
        I inspected the receipt and independently verified the payment.
      </label>
      <p className="text-xs text-[var(--text-muted)]">Expected amount: {formatAmount(selected.expectedAmount)}. The value below is expressed in the smallest currency units and must match exactly.</p>
      <label className="block text-sm">Verified received amount (integer minor units)
        <input value={receivedUnits} onChange={event => { setReceivedUnits(event.target.value); setPendingAction(null); }}
          className="mt-1 block w-full max-w-xs rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2"
          inputMode="numeric" />
      </label>
      <label className="block text-sm">Reason (required for rejection or clarification)
        <textarea value={reason} onChange={event => { setReason(event.target.value); setPendingAction(null); }}
          className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2" rows={2} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || selected.status !== 'pending_verification'}
          onClick={() => void decide('approve')}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-50">Approve verified payment</button>
        <button type="button" disabled={busy || selected.status !== 'pending_verification'}
          onClick={() => void decide('reject')}
          className="rounded-lg border border-red-600 px-4 py-2 text-sm text-red-600 disabled:opacity-50">Reject</button>
        <button type="button" disabled={busy || selected.status !== 'pending_verification'}
          onClick={() => void decide('request_clarification')}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-50">Request clarification</button>
        <button type="button" disabled={busy} onClick={() => setSelected(null)}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm">Close</button>
      </div>
    </div>}
  </section>;
}
