import React from 'react';
import { Archive, Plus, RefreshCw, Save, Layers3 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { WorkspaceMode, WorkspacePlan, WorkspacePlanCatalog } from '../lib/workspacePolicy';

const MODES: { value: WorkspaceMode; label: string }[] = [
  { value: 'single', label: 'Single workspace' },
  { value: 'same_industry', label: 'Multiple branches · same industry' },
  { value: 'mixed_industry', label: 'Multiple workspaces · multiple industries' },
];

const blankPlan = (): WorkspacePlan => ({
  id: '', name: 'New plan', active: true, defaultMode: 'single',
  pricing: { baseMonthlyInr: null, includedWorkspaces: 1, extraWorkspaceMonthlyInr: null, additionalIndustryMonthlyInr: 0 },
});

export default function WorkspacePlansPage() {
  const [plans, setPlans] = React.useState<WorkspacePlan[]>([]);
  const [existingIds, setExistingIds] = React.useState<Set<string>>(new Set());
  const [version, setVersion] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true); setError(''); setMessage('');
    try {
      const response = await apiFetch('/api/platform/billing/workspace-plans');
      const body = await response.json().catch(() => ({})) as WorkspacePlanCatalog & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Could not load workspace plans.');
      setPlans(body.plans || []); setExistingIds(new Set((body.plans || []).map(plan => plan.id))); setVersion(body.version || 0);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load workspace plans.'); }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const update = (index: number, change: Partial<WorkspacePlan>) => setPlans(current => current.map((plan, i) => i === index ? { ...plan, ...change } : plan));
  const updatePricing = (index: number, key: keyof WorkspacePlan['pricing'], value: number | null) => setPlans(current => current.map((plan, i) => i === index ? {
    ...plan, pricing: { ...plan.pricing, [key]: value, ...(key === 'includedWorkspaces' ? {} : {}) },
  } : plan));
  const addPlan = () => setPlans(current => [...current, blankPlan()]);

  const save = async () => {
    setError(''); setMessage('');
    const missing = plans.find(plan => !plan.id.trim() || !plan.name.trim() || plan.pricing.baseMonthlyInr == null || plan.pricing.extraWorkspaceMonthlyInr == null || plan.pricing.additionalIndustryMonthlyInr == null);
    if (missing) { setError(`Complete the plan ID, name, and all monthly prices for “${missing.name || 'New plan'}”. Enter 0 when a price does not apply.`); return; }
    setSaving(true);
    try {
      const response = await apiFetch('/api/platform/billing/workspace-plans', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedVersion: version, plans }),
      });
      const body = await response.json().catch(() => ({})) as WorkspacePlanCatalog & { error?: string; code?: string };
      if (!response.ok) throw new Error(body.error || (response.status === 409 ? 'Plan settings changed. Reload and try again.' : 'Could not save workspace plans.'));
      setPlans(body.plans || []); setExistingIds(new Set((body.plans || []).map(plan => plan.id))); setVersion(body.version || version + 1); setMessage('Plan defaults saved. New organizations will use these prices.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save workspace plans.'); }
    finally { setSaving(false); }
  };

  return <div className="mx-auto max-w-6xl space-y-6 text-[var(--text-primary)]">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"><Layers3 className="h-4 w-4" /> Billing configuration</div><h2 className="text-xl font-semibold tracking-tight">Workspace plans & pricing</h2><p className="mt-1 max-w-3xl text-sm text-[var(--text-muted)]">Set the default workspace structure and INR prices used when an organization is created. Existing organizations keep their saved price snapshot.</p></div>
      <div className="flex gap-2"><button onClick={() => void load()} disabled={loading || saving} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50"><RefreshCw className="h-4 w-4"/>Reload</button><button onClick={addPlan} disabled={loading || saving} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50"><Plus className="h-4 w-4"/>Add plan</button><button onClick={() => void save()} disabled={loading || saving} className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"><Save className="h-4 w-4"/>{saving ? 'Saving…' : 'Save plans'}</button></div>
    </div>
    {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
    {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
    {loading ? <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-6 text-sm text-[var(--text-muted)]">Loading plan defaults…</div> : <div className="space-y-4">
      {plans.map((plan, index) => <section key={`${plan.id}-${index}`} className={`rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 shadow-sm ${plan.active ? '' : 'opacity-70'}`}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4"><div><h3 className="font-semibold">{plan.name || 'New plan'}</h3><p className="text-xs text-[var(--text-muted)]">Plan ID: {plan.id || 'Set a stable ID before saving'}</p></div><button onClick={() => update(index, { active: !plan.active })} className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs ${plan.active ? 'border text-[var(--text-secondary)]' : 'bg-emerald-50 text-emerald-700'}`}><Archive className="h-3.5 w-3.5"/>{plan.active ? 'Archive plan' : 'Restore plan'}</button></div>
        <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
          <label className="block text-xs font-medium text-[var(--text-secondary)]">Plan name<input value={plan.name} onChange={e => update(index, { name: e.target.value })} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50"/></label>
          <label className="block text-xs font-medium text-[var(--text-secondary)]">Stable plan ID<input value={plan.id} onChange={e => update(index, { id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })} disabled={existingIds.has(plan.id)} placeholder="e.g. scale" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 disabled:bg-slate-50"/><span className="mt-1 block font-normal text-[var(--text-muted)]">Existing IDs are fixed so organization plan references stay valid.</span></label>
          <label className="block text-xs font-medium text-[var(--text-secondary)]">Default workspace structure<select value={plan.defaultMode} onChange={e => update(index, { defaultMode: e.target.value as WorkspaceMode, pricing: { ...plan.pricing, includedWorkspaces: e.target.value === 'single' ? 1 : plan.pricing.includedWorkspaces } })} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50">{MODES.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select></label>
          <label className="block text-xs font-medium text-[var(--text-secondary)]">Organization plan / month (INR)<input type="number" min="0" step="0.01" value={plan.pricing.baseMonthlyInr ?? ''} onChange={e => updatePricing(index, 'baseMonthlyInr', e.target.value === '' ? null : Number(e.target.value))} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50"/></label>
          {plan.defaultMode !== 'single' && <label className="block text-xs font-medium text-[var(--text-secondary)]">Workspaces included in the plan<input type="number" min="1" max="1000" step="1" value={plan.pricing.includedWorkspaces} onChange={e => updatePricing(index, 'includedWorkspaces', Number(e.target.value))} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50"/></label>}
          <label className="block text-xs font-medium text-[var(--text-secondary)]">Each additional workspace / month (INR)<input type="number" min="0" step="0.01" value={plan.pricing.extraWorkspaceMonthlyInr ?? ''} onChange={e => updatePricing(index, 'extraWorkspaceMonthlyInr', e.target.value === '' ? null : Number(e.target.value))} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50"/></label>
          <label className="block text-xs font-medium text-[var(--text-secondary)]">Each additional industry / month (INR)<input type="number" min="0" step="0.01" value={plan.pricing.additionalIndustryMonthlyInr ?? ''} onChange={e => updatePricing(index, 'additionalIndustryMonthlyInr', e.target.value === '' ? null : Number(e.target.value))} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50"/><span className="mt-1 block font-normal text-[var(--text-muted)]">Used when the organization plan permits multiple industries.</span></label>
        </div>
      </section>)}
      {!plans.length && <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-surface)] p-10 text-center text-sm text-[var(--text-muted)]">No plans configured. Add a plan to get started.</div>}
    </div>}
  </div>;
}
