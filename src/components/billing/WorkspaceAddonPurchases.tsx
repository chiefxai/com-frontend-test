import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CreditCard, RefreshCw } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { billingClient, newBillingIdempotencyKey } from '../../lib/billing/client';
import type { BillingAmount, PaymentRequest } from '../../lib/billing/types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

export type PaymentDisplayFilter = 'all' | 'submitted' | 'workspace';
export type PaymentStatusFilter = 'all' | 'action' | 'review' | 'completed';
type AddonInvoice = {id:string;status:string;paymentAmount:BillingAmount;dueAt:string|null;paymentStatus:string|null;paymentRequestId:string|null};
type Addon = {id:string;name:string;status:string;workspaceId:string|null;monthlyAmount:BillingAmount;autoRenew:boolean;periodEndsAt:string|null;graceEndsAt:string|null;invoice:AddonInvoice|null};
const money = (amount:BillingAmount) => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(Number(amount.units)/10 ** amount.scale);
const date = (value:string|null) => value ? new Date(value).toLocaleDateString('en-IN') : 'After payment approval';
const fieldClass = 'mt-1.5 block h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-subtle)]';

export default function WorkspaceAddonPurchases({
  canSubmit = false, refreshKey = 0, onChange, submittedPayments = [],
  displayFilter = 'all', statusFilter = 'all', showWorkspace = true, showSubmitted = true,
  submittedLoading = false,
}: {
  canSubmit?: boolean; refreshKey?: number; onChange?: () => Promise<void>;
  submittedPayments?: PaymentRequest[];
  displayFilter?: PaymentDisplayFilter; statusFilter?: PaymentStatusFilter;
  showWorkspace?: boolean; showSubmitted?: boolean; submittedLoading?: boolean;
}) {
  const [addons,setAddons] = useState<Addon[]>([]);
  const [available,setAvailable] = useState(false);
  const [loading,setLoading] = useState(false);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const [selected,setSelected] = useState<Addon|null>(null);
  const [reference,setReference] = useState('');
  const [proof,setProof] = useState<File|null>(null);
  const [note,setNote] = useState('');
  const [busy,setBusy] = useState(false);
  const [paymentKey,setPaymentKey] = useState(newBillingIdempotencyKey);
  const previousSignature = useRef<string|null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/billing/workspace-addons');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load workspace purchases.');
      const rows:Addon[] = data.rows || [];
      const signature = JSON.stringify(rows.map(addon=>[addon.id,addon.workspaceId,addon.status,addon.periodEndsAt]));
      const changed = previousSignature.current !== null && signature !== previousSignature.current;
      previousSignature.current = signature;
      setAddons(rows);setAvailable(data.purchasesAvailable === true);setError('');
      if(changed) {try {await onChangeRef.current?.();} catch { /* The purchase list already refreshed successfully. */ }}
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Could not load workspace purchases.');}
    finally {setLoading(false);}
  },[]);
  useEffect(() => {void refresh();},[refresh,refreshKey]);
  useEffect(() => {
    if (!addons.some(addon => addon.invoice?.paymentStatus === 'pending_verification')) return;
    const timer = window.setInterval(() => {void refresh();},30000);
    return () => window.clearInterval(timer);
  },[addons,refresh]);

  const change = async (addon:Addon) => {
    setBusy(true);setError('');setMessage('');
    try {
      const pending = addon.status === 'pending';
      const response = await apiFetch(`/api/billing/workspace-addons/${encodeURIComponent(addon.id)}${pending ? '' : '/renewal'}`,{
        method:pending ? 'DELETE' : 'PUT',headers:{'Idempotency-Key':newBillingIdempotencyKey()},
        ...(pending ? {} : {body:JSON.stringify({autoRenew:!addon.autoRenew})}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update the workspace purchase.');
      setMessage(pending ? 'Pending purchase cancelled. Its reserved workspace slot is available again.' : addon.autoRenew
        ? `Renewal stopped. This workspace remains available until ${date(addon.periodEndsAt)}.`
        : 'Monthly renewal invoices enabled. Any outstanding invoice must be paid before access resumes.');
      await refresh();
    } catch(cause) {setError(cause instanceof Error ? cause.message : 'Could not update the workspace purchase.');}
    finally {setBusy(false);}
  };

  const submit = async (event:React.FormEvent) => {
    event.preventDefault();
    if (!selected?.invoice || !proof || !reference.trim()) return;
    if (!['application/pdf','image/jpeg','image/png','image/webp'].includes(proof.type) || proof.size===0 || proof.size>10*1024*1024) {
      setError('Choose a PDF, JPG, PNG or WEBP receipt of up to 10 MB.');return;
    }
    setBusy(true);setError('');setMessage('');
    try {
      const clarification = ['needs_clarification','clarification_requested'].includes(selected.invoice.paymentStatus || '');
      await billingClient.submitPaymentWithProof({purpose:'invoice',invoiceId:selected.invoice.id,
        expectedAmount:selected.invoice.paymentAmount,paymentReference:reference.trim(),
        ...(clarification && selected.invoice.paymentRequestId ? {paymentRequestId:selected.invoice.paymentRequestId} : {}),
        ...(note.trim() ? {payerNote:note.trim()} : {}),
      },proof,{idempotencyKey:paymentKey});
      setMessage('Payment submitted for verification. The workspace becomes available only after the platform team approves the full payment.');
      setSelected(null);await refresh();
    } catch(cause) {setError(cause instanceof Error ? cause.message : 'Could not submit workspace payment. Retry using the same receipt.');}
    finally {setBusy(false);}
  };

  const linkedInvoiceIds = new Set(
    addons.filter(addon => addon.invoice).map(addon => addon.invoice!.id),
  );
  // Combine existing workspace invoice actions and submitted payment records in
  // one sorted activity list, without duplicating a receipt for a linked invoice.
  const activity: Array<
    { source: 'payment'; payment: PaymentRequest; timestamp: number; key: string }
    | { source: 'workspace'; addon: Addon; timestamp: number; key: string }
  > = [
    ...(showSubmitted && displayFilter !== 'workspace' ? submittedPayments
      .filter(payment => displayFilter !== 'all' || !payment.invoiceId || !linkedInvoiceIds.has(payment.invoiceId))
      .map(payment => ({
        source: 'payment' as const, payment, key: `payment-${payment.id}`,
        timestamp: Date.parse(payment.submittedAt) || 0,
      })) : []),
    ...(showWorkspace && displayFilter !== 'submitted' ? addons.map(addon => ({
      source: 'workspace' as const, addon, key: `workspace-${addon.id}`,
      timestamp: Date.parse(addon.invoice?.dueAt || addon.periodEndsAt || '') || 0,
    })) : []),
  ].filter(item => {
    if (statusFilter === 'all') return true;
    if (item.source === 'payment') {
      const state = item.payment.status;
      if (statusFilter === 'review') return state === 'pending_verification';
      if (statusFilter === 'action') return ['needs_information', 'needs_clarification', 'rejected'].includes(state);
      return state === 'approved';
    }
    const { invoice, status } = item.addon;
    const inReview = invoice?.paymentStatus === 'pending_verification';
    if (statusFilter === 'review') return inReview;
    if (statusFilter === 'action') return !inReview && Boolean(invoice && ['open', 'overdue'].includes(invoice.status));
    return !invoice || (!['open', 'overdue'].includes(invoice.status) && status === 'active');
  }).sort((first, second) => second.timestamp - first.timestamp);

  const paymentLabel = (payment: PaymentRequest) =>
    payment.purpose === 'topup' ? 'Credit top-up' : payment.purpose === 'subscription' ? 'Subscription payment'
      : payment.workspaceAddonName ? 'Workspace add-on payment' : 'Invoice payment';
  const statusLabel: Record<string, string> = {
    pending_verification: 'Waiting for approval', submitted: 'Waiting for approval',
    needs_information: 'More information needed', needs_clarification: 'More information needed',
    approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled',
  };
  const statusClass = (state: string) =>
    state === 'approved' || state === 'active'
      ? 'border-emerald-300/70 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : ['rejected', 'cancelled', 'overdue', 'suspended'].includes(state)
        ? 'border-rose-300/70 bg-rose-500/10 text-rose-700 dark:text-rose-300'
        : 'border-amber-300/70 bg-amber-500/10 text-amber-700 dark:text-amber-300';

  return <section className="space-y-3" aria-label="Payment activity">
    {message && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}
    {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
    <div role="list" aria-label="Payments and workspace invoices" className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
      {activity.map(item => {
        if (item.source === 'payment') {
          const payment = item.payment;
          return <div role="listitem" key={item.key} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--text-primary)]">{paymentLabel(payment)}</p>
              {payment.workspaceAddonName && <p className="mt-1 text-xs text-[var(--text-secondary)]">{payment.workspaceAddonName}</p>}
              <p className="mt-1 text-xs text-[var(--text-muted)]">Receipt sent {new Date(payment.submittedAt).toLocaleDateString('en-IN')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <strong className="text-sm tabular-nums text-[var(--text-primary)]">{money(payment.expectedAmount)}</strong>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(payment.status)}`}>
                {statusLabel[payment.status] || payment.status}
              </span>
            </div>
          </div>;
        }
        const addon = item.addon;
        const invoice = addon.invoice;
        const waiting = invoice?.paymentStatus === 'pending_verification';
        const payable = Boolean(invoice && ['open', 'overdue'].includes(invoice.status));
        const state = waiting ? 'pending_verification' : invoice?.status || addon.status;
        return <div role="listitem" key={item.key} className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{addon.name}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Extra workspace · {money(addon.monthlyAmount)}/month
            </p>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              {addon.status === 'pending' ? 'Reserved workspace — payment required before creation'
                : addon.status === 'suspended' ? 'Access suspended until payment'
                : addon.periodEndsAt && Date.parse(addon.periodEndsAt) <= Date.now()
                  ? `Grace period — pay before ${date(addon.graceEndsAt)}`
                  : `Paid until ${date(addon.periodEndsAt)}`}
            </p>
            {payable && <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {waiting ? 'Payment receipt awaiting approval' : `Invoice due ${date(invoice?.dueAt || null)}`}
            </p>}
            {addon.periodEndsAt && addon.autoRenew && <p className="mt-1 text-xs text-[var(--text-muted)]">
              Renewal invoices arrive seven days before expiry. An unpaid workspace has a seven-day grace period.
            </p>}
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <strong className="text-sm tabular-nums text-[var(--text-primary)]">
              {payable && invoice ? money(invoice.paymentAmount) : money(addon.monthlyAmount)}
            </strong>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(state)}`}>
              {waiting ? 'Waiting for approval' : invoice?.status === 'open' || invoice?.status === 'overdue'
                ? 'Payment due' : addon.status === 'active' ? 'Active' : addon.status}
            </span>
            {canSubmit && <div className="flex flex-wrap gap-2">
              {payable && invoice && available && !waiting && <Button type="button" variant="primary" size="sm" icon={CreditCard}
                disabled={busy} onClick={() => {
                  setSelected(addon); setProof(null); setReference(''); setNote(''); setError(''); setPaymentKey(newBillingIdempotencyKey());
                }}>
                {['needs_clarification', 'clarification_requested'].includes(invoice.paymentStatus || '') ? 'Update proof' : 'Submit payment'}
              </Button>}
              <Button type="button" variant="secondary" size="sm" disabled={busy || waiting} onClick={() => void change(addon)}>
                {addon.status === 'pending' ? 'Cancel purchase' : addon.autoRenew ? 'Stop renewal' : 'Enable renewal'}
              </Button>
            </div>}
          </div>
        </div>;
      })}
      {!activity.length && <p className="p-5 text-sm text-[var(--text-secondary)]">
        {loading || submittedLoading ? 'Loading payment records…' : 'No payments or workspace invoices match these filters.'}
      </p>}
    </div>
    {loading && <p role="status" className="text-xs text-[var(--text-muted)]">Refreshing workspace invoices…</p>}
    <Modal open={Boolean(selected)} onClose={()=>{if(!busy)setSelected(null);}} title="Pay for workspace add-on" subtitle="Pay by bank transfer or UPI, then submit your receipt for verification." maxWidth="max-w-lg">
      {selected?.invoice && <form onSubmit={submit} className="space-y-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-xs text-[var(--text-secondary)]">
          <p className="font-semibold text-[var(--text-primary)]">{selected.name} · Pay {money(selected.invoice.paymentAmount)}</p>
          <p className="mt-2">Recurring fee: {money(selected.monthlyAmount)}/month. The first month starts on approval. Future invoices are issued before expiry. No usage credits are deducted.</p>
        </div>
        <label className="block text-xs text-[var(--text-secondary)]">Bank or UPI transaction reference
          <input required maxLength={160} value={reference} onChange={e=>{setReference(e.target.value);setPaymentKey(newBillingIdempotencyKey());}} className={fieldClass}/></label>
        <label className="block text-xs text-[var(--text-secondary)]">Payment receipt
          <input required type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e=>{setProof(e.target.files?.[0] || null);setPaymentKey(newBillingIdempotencyKey());}} className="mt-2 block w-full text-xs"/>
          <span className="mt-1 block text-[var(--text-muted)]">PDF, JPG, PNG or WEBP, up to 10 MB.</span></label>
        <label className="block text-xs text-[var(--text-secondary)]">Note (optional)
          <textarea maxLength={2000} rows={2} value={note} onChange={e=>{setNote(e.target.value);setPaymentKey(newBillingIdempotencyKey());}} className={fieldClass}/></label>
        {error && <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">{error}</p>}
        <Button type="submit" variant="primary" size="sm" loading={busy} disabled={!proof || !reference.trim()}>
          Submit for verification
        </Button>
      </form>}
    </Modal>
  </section>;
}
