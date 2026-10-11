import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CreditCard, RefreshCw } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { billingClient, newBillingIdempotencyKey } from '../../lib/billing/client';
import type { BillingAmount } from '../../lib/billing/types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

type AddonInvoice = {id:string;status:string;paymentAmount:BillingAmount;dueAt:string|null;paymentStatus:string|null;paymentRequestId:string|null};
type Addon = {id:string;name:string;status:string;workspaceId:string|null;monthlyAmount:BillingAmount;autoRenew:boolean;periodEndsAt:string|null;graceEndsAt:string|null;invoice:AddonInvoice|null};
const money = (amount:BillingAmount) => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(Number(amount.units)/10 ** amount.scale);
const date = (value:string|null) => value ? new Date(value).toLocaleDateString('en-IN') : 'After payment approval';
const fieldClass = 'mt-1.5 block h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-subtle)]';

export default function WorkspaceAddonPurchases({canSubmit=false,refreshKey=0,onChange}:{canSubmit?:boolean;refreshKey?:number;onChange?:()=>Promise<void>}) {
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

  return <section className="space-y-3" aria-label="Workspace add-on invoices">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-xl text-xs leading-5 text-[var(--text-secondary)]">
        Paid workspace invoices are separate from usage credits and require payment approval.
      </p>
      <Button type="button" size="sm" variant="secondary" icon={RefreshCw}
        disabled={loading || busy} onClick={async()=>{await refresh();await onChange?.();}}>Refresh</Button>
    </div>
    {message && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">{message}</p>}
    {error && <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">{error}</p>}
    {!addons.length && <p className="text-xs text-[var(--text-muted)]">{loading ? 'Loading workspace purchases…' : 'No additional workspace purchases.'}</p>}
    <div className="space-y-3">{addons.map(addon => {
      const invoice = addon.invoice;
      const waiting = invoice?.paymentStatus === 'pending_verification';
      const payable = invoice && ['open','overdue'].includes(invoice.status);
      return <div key={addon.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{addon.name}</p>
            <p className="mt-1 text-xs font-semibold tabular-nums text-[var(--text-primary)]">{money(addon.monthlyAmount)} / month</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{addon.status === 'pending' ? 'Workspace reserved — payment required before creation' : addon.status === 'suspended' ? 'Access suspended — payment required to resume'
              : addon.periodEndsAt && Date.parse(addon.periodEndsAt) <= Date.now() ? `Grace period — arrange payment before ${date(addon.graceEndsAt)}` : `Paid access until ${date(addon.periodEndsAt)}`}</p>
            {payable && <p className="mt-1 text-xs text-[var(--text-secondary)]">{waiting ? 'Payment awaiting platform verification' : `Invoice due: ${money(invoice.paymentAmount)} · ${date(invoice.dueAt)}`}</p>}
            {addon.periodEndsAt && addon.autoRenew && <p className="mt-1 text-xs text-[var(--text-muted)]">A renewal invoice is issued seven days before expiry. Unpaid access ends after the seven-day grace period on {date(addon.graceEndsAt)}.</p>}
          </div>
          {canSubmit && <div className="flex flex-wrap gap-2">
            {payable && available && !waiting && <Button type="button" variant="primary" size="sm" icon={CreditCard}
              disabled={busy} onClick={()=>{setSelected(addon);setProof(null);setReference('');setNote('');setError('');setPaymentKey(newBillingIdempotencyKey());}}>
              {['needs_clarification','clarification_requested'].includes(invoice.paymentStatus || '') ? 'Update proof' : 'Submit payment'}
            </Button>}
            <Button type="button" variant="secondary" size="sm" disabled={busy || waiting} onClick={()=>void change(addon)}>
              {addon.status === 'pending' ? 'Cancel purchase' : addon.autoRenew ? 'Stop renewal' : 'Enable renewal'}
            </Button>
          </div>}
        </div>
      </div>;
    })}</div>
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
