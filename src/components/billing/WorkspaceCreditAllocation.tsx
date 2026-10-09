import React from 'react';
import { billingClient, createBillingMutation } from '../lib/billing/client';
import type { AllocationRule } from '../lib/billing/types';

/** Organization-admin allocation editor. Writes are versioned and idempotent. */
export default function WorkspaceCreditAllocation() {
  const [kind, setKind] = React.useState<'subscription' | 'topup'>('subscription');
  const [rules, setRules] = React.useState<AllocationRule[]>([]);
  const [version, setVersion] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [pending, setPending] = React.useState<ReturnType<typeof createBillingMutation> | null>(null);

  const load = React.useCallback(async () => {
    setBusy(true); setError(''); setNotice(''); setPending(null);
    try {
      const result = await billingClient.allocationRules(kind);
      setRules(result.rules); setVersion(result.version);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load allocation rules.'); }
    finally { setBusy(false); }
  }, [kind]);
  React.useEffect(() => { void load(); }, [load]);

  const change = (index: number, patch: Partial<AllocationRule>) => {
    setPending(null);
    setRules(current => current.map((rule, i) => i === index ? { ...rule, ...patch } : rule));
  };
  const save = async () => {
    setError(''); setNotice('');
    if (rules.some(rule => !rule.workspaceId.trim())) { setError('Each allocation needs a workspace ID.'); return; }
    if (new Set(rules.map(rule => rule.workspaceId.trim())).size !== rules.length) { setError('Workspace IDs must be unique.'); return; }
    const percentageTotal = rules.filter(rule => rule.kind === 'percentage').reduce((sum, rule) => sum + (rule.basisPoints || 0), 0);
    if (percentageTotal > 10000) { setError('Percentage allocations cannot exceed 100%.'); return; }
    if (rules.some(rule => rule.kind === 'percentage' && (!Number.isSafeInteger(rule.basisPoints) || (rule.basisPoints || 0) < 0))) {
      setError('Enter a valid percentage between 0 and 100.'); return;
    }
    if (rules.some(rule => rule.kind === 'fixed' && (!rule.amount || !/^\\d+$/.test(rule.amount.units) || BigInt(rule.amount.units) < 0n))) {
      setError('Enter a non-negative fixed credit amount.'); return;
    }
    const mutation = pending || createBillingMutation(options => billingClient.saveAllocationRules(kind, { rules }, options), version);
    setPending(mutation);
    setBusy(true);
    try {
      const result = await mutation.execute();
      setRules(result.rules); setVersion(result.version); setPending(null);
      setNotice('Default allocation rules saved for future credits.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save allocation rules.'); }
    finally { setBusy(false); }
  };

  return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
    <div>
      <h3 className="text-sm font-semibold text-slate-900">Workspace credit allocation defaults</h3>
      <p className="mt-1 text-xs text-slate-500">Organization Admin rules for incoming credits. This does not move current balances; use manual transfers for existing grants.</p>
    </div>
    <div className="flex gap-2">
      {(['subscription', 'topup'] as const).map(value => <button key={value} type="button" onClick={() => setKind(value)} className={`rounded-lg px-3 py-2 text-xs font-medium ${kind === value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>{value === 'subscription' ? 'Subscription credits' : 'Top-up credits'}</button>)}
    </div>
    {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
    {notice && <p role="status" className="text-xs text-emerald-700">{notice}</p>}
    {rules.map((rule, index) => <div key={index} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-4">
      <label className="text-xs">Workspace ID<input aria-label="Workspace ID" className="mt-1 w-full rounded border p-2" value={rule.workspaceId} onChange={e => change(index, { workspaceId: e.target.value })} /></label>
      <label className="text-xs">Method<select className="mt-1 w-full rounded border p-2" value={rule.kind} onChange={e => change(index, e.target.value === 'fixed' ? { kind: 'fixed', basisPoints: undefined, amount: { asset: 'CREDIT', units: '0', scale: 0 } } : { kind: 'percentage', amount: undefined, basisPoints: 0 })}><option value="percentage">Percentage</option><option value="fixed">Fixed credits</option></select></label>
      <label className="text-xs">{rule.kind === 'percentage' ? 'Percentage (%)' : 'Credit units'}
        <input className="mt-1 w-full rounded border p-2" type="number" min="0" step={rule.kind === 'percentage' ? '0.01' : '1'} value={rule.kind === 'percentage' ? (rule.basisPoints || 0) / 100 : rule.amount?.units || '0'} onChange={e => change(index, rule.kind === 'percentage' ? { basisPoints: Math.round(Number(e.target.value) * 100) } : { amount: { asset: rule.amount?.asset || 'CREDIT', scale: rule.amount?.scale ?? 0, units: e.target.value } })} />
      </label>
      <button type="button" onClick={() => { setPending(null); setRules(current => current.filter((_, i) => i !== index)); }} className="self-end rounded border px-3 py-2 text-xs">Remove</button>
    </div>)}
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => { setPending(null); setRules(current => [...current, { workspaceId: '', kind: 'percentage', basisPoints: 0 }]); }} className="rounded border px-3 py-2 text-xs">Add workspace rule</button>
      <button type="button" disabled={busy} onClick={() => void save()} className="rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Save defaults</button>
      <button type="button" disabled={busy} onClick={() => void load()} className="rounded border px-3 py-2 text-xs">Reload</button>
    </div>
  </section>;
}
