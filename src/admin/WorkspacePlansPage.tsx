import React from 'react';
import { Archive, Plus, RefreshCw, Save, Layers3, Pencil, X } from 'lucide-react';
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
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
  const [draft, setDraft] = React.useState<WorkspacePlan | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true); setError(''); setMessage('');
    try {
      const response = await apiFetch('/api/platform/billing/workspace-plans');
      const body = await response.json().catch(() => ({})) as WorkspacePlanCatalog & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Could not load workspace plans.');
      setEditingIndex(null); setDraft(null);
      setPlans(body.plans || []); setExistingIds(new Set((body.plans || []).map(plan => plan.id))); setVersion(body.version || 0);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load workspace plans.'); }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const beginAdd = () => { setDraft(blankPlan()); setEditingIndex(-1); setError(''); setMessage(''); };
  const beginEdit = (index: number) => {
    const plan = plans[index];
    setDraft({ ...plan, pricing: { ...plan.pricing } });
    setEditingIndex(index); setError(''); setMessage('');
  };
  const cancelEdit = () => { setDraft(null); setEditingIndex(null); setError(''); };
  const updateDraft = (change: Partial<WorkspacePlan>) => setDraft(current => current ? { ...current, ...change } : current);
  const updatePricing = (key: keyof WorkspacePlan['pricing'], value: number | null) =>
    setDraft(current => current ? { ...current, pricing: { ...current.pricing, [key]: value } } : current);

  const save = async () => {
    setError(''); setMessage('');
    if (!draft || editingIndex === null) return;
    const nextPlans = editingIndex === -1 ? [...plans, draft] : plans.map((plan, index) => index === editingIndex ? draft : plan);
    const missing = nextPlans.find(plan => !plan.id.trim() || !plan.name.trim() || plan.pricing.baseMonthlyInr == null || plan.pricing.extraWorkspaceMonthlyInr == null || plan.pricing.additionalIndustryMonthlyInr == null);
    if (missing) { setError(`Complete the plan ID, name, and all monthly prices for “${missing.name || 'New plan'}”. Enter 0 when a price does not apply.`); return; }
    setSaving(true);
    try {
      const response = await apiFetch('/api/platform/billing/workspace-plans', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedVersion: version, plans: nextPlans }),
      });
      const body = await response.json().catch(() => ({})) as WorkspacePlanCatalog & { error?: string; code?: string };
      if (!response.ok) throw new Error(body.error || (response.status === 409 ? 'Plan settings changed. Reload and try again.' : 'Could not save workspace plans.'));
      setPlans(body.plans || []); setExistingIds(new Set((body.plans || []).map(plan => plan.id))); setVersion(body.version || version + 1); setMessage('Plan saved. New organizations will use these prices.'); setDraft(null); setEditingIndex(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save workspace plans.'); }
    finally { setSaving(false); }
  };

  const money = (amount: number | null) => amount == null ? 'Not set' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount);
  const fieldClass = 'mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30';
  const labelClass = 'block text-xs font-semibold text-[var(--text-secondary)]';

  return <div className="mx-auto max-w-6xl space-y-6 text-[var(--text-primary)]">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"><Layers3 className="h-4 w-4" /> Billing configuration</div>
        <h2 className="text-xl font-semibold tracking-tight">Workspace plans & pricing</h2>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-muted)]">Manage the workspace plans offered to new organizations. Existing organizations retain their saved pricing.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void load()} disabled={loading || saving} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--bg-subtle)] disabled:opacity-50"><RefreshCw className="h-4 w-4" /> Reload</button>
        <button type="button" onClick={beginAdd} disabled={loading || saving || editingIndex !== null} className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"><Plus className="h-4 w-4" /> Add new plan</button>
      </div>
    </div>
    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
    {message && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
    {loading ? <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-6 text-sm text-[var(--text-muted)]">Loading plans…</div> : (
      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((plan, index) => <section key={plan.id || index} className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold">{plan.name}</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">ID: {plan.id}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${plan.active ? 'bg-emerald-500/10 text-emerald-600' : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'}`}>{plan.active ? 'Active' : 'Archived'}</span>
          </div>
          <div className="mt-5 border-b border-[var(--border)] pb-4">
            <p className="text-2xl font-semibold tracking-tight">{money(plan.pricing.baseMonthlyInr)}<span className="ml-1 text-xs font-normal text-[var(--text-muted)]">/ month</span></p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{MODES.find(mode => mode.value === plan.defaultMode)?.label}</p>
          </div>
          <dl className="my-4 space-y-3 text-xs">
            <div className="flex justify-between gap-3"><dt className="text-[var(--text-muted)]">Included workspaces</dt><dd className="font-semibold">{plan.pricing.includedWorkspaces}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--text-muted)]">Extra workspace / month</dt><dd className="font-semibold">{money(plan.pricing.extraWorkspaceMonthlyInr)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--text-muted)]">Extra industry / month</dt><dd className="font-semibold">{money(plan.pricing.additionalIndustryMonthlyInr)}</dd></div>
          </dl>
          <button type="button" onClick={() => beginEdit(index)} disabled={editingIndex !== null || saving} className="mt-auto inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-[var(--bg-subtle)] disabled:opacity-50"><Pencil className="h-4 w-4" /> Edit plan</button>
        </section>)}
        {!plans.length && <div className="col-span-full rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-surface)] p-10 text-center text-sm text-[var(--text-muted)]">No plans configured. Select “Add new plan” to get started.</div>}
      </div>
    )}

    {draft && editingIndex !== null && (
      <div className="fixed inset-0 z-[350] flex items-center justify-center bg-black/50 p-4" onMouseDown={event => { if (event.target === event.currentTarget && !saving) cancelEdit(); }}>
        <div role="dialog" aria-modal="true" aria-labelledby="workspace-plan-form-title" className="flex max-h-[min(90vh,850px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
            <div><h3 id="workspace-plan-form-title" className="text-lg font-semibold">{editingIndex === -1 ? 'Create workspace plan' : 'Edit workspace plan'}</h3><p className="mt-1 text-xs text-[var(--text-muted)]">Configure workspace access and monthly pricing.</p></div>
            <button type="button" onClick={cancelEdit} disabled={saving} aria-label="Close plan form" className="rounded-lg p-2 hover:bg-[var(--bg-subtle)] disabled:opacity-50"><X className="h-5 w-5" /></button>
          </div>
          <form id="workspace-plan-form" onSubmit={event => { event.preventDefault(); void save(); }} className="grid gap-4 overflow-y-auto p-6 sm:grid-cols-2">
            <label className={labelClass}>Plan name<input required value={draft.name} onChange={event => updateDraft({ name: event.target.value })} className={fieldClass} /></label>
            <label className={labelClass}>Stable plan ID<input required value={draft.id} onChange={event => updateDraft({ id: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })} disabled={existingIds.has(draft.id)} placeholder="e.g. scale" className={fieldClass + ' disabled:opacity-60'} /><span className="mt-1 block text-[10px] font-normal text-[var(--text-muted)]">Existing IDs cannot be changed.</span></label>
            <label className={labelClass + ' sm:col-span-2'}>Default workspace structure<select value={draft.defaultMode} onChange={event => { const mode = event.target.value as WorkspaceMode; updateDraft({ defaultMode: mode, pricing: { ...draft.pricing, includedWorkspaces: mode === 'single' ? 1 : draft.pricing.includedWorkspaces } }); }} className={fieldClass}>{MODES.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select></label>
            <label className={labelClass}>Organization / month (INR)<input required type="number" min="0" step="0.01" value={draft.pricing.baseMonthlyInr ?? ''} onChange={event => updatePricing('baseMonthlyInr', event.target.value === '' ? null : Number(event.target.value))} className={fieldClass} /></label>
            <label className={labelClass}>Additional workspace / month (INR)<input required type="number" min="0" step="0.01" value={draft.pricing.extraWorkspaceMonthlyInr ?? ''} onChange={event => updatePricing('extraWorkspaceMonthlyInr', event.target.value === '' ? null : Number(event.target.value))} className={fieldClass} /></label>
            {draft.defaultMode !== 'single' && <label className={labelClass}>Included workspaces<input required type="number" min="1" max="1000" step="1" value={draft.pricing.includedWorkspaces} onChange={event => updatePricing('includedWorkspaces', Number(event.target.value))} className={fieldClass} /></label>}
            <label className={labelClass}>Additional industry / month (INR)<input required type="number" min="0" step="0.01" value={draft.pricing.additionalIndustryMonthlyInr ?? ''} onChange={event => updatePricing('additionalIndustryMonthlyInr', event.target.value === '' ? null : Number(event.target.value))} className={fieldClass} /></label>
            <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2"><input type="checkbox" checked={draft.active} onChange={event => updateDraft({ active: event.target.checked })} className="h-4 w-4 accent-[var(--accent)]" /> Active plan (available for new organizations)</label>
          </form>
          <div className="flex justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
            <button type="button" onClick={cancelEdit} disabled={saving} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--bg-subtle)]">Cancel</button>
            <button type="submit" form="workspace-plan-form" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Saving…' : editingIndex === -1 ? 'Create plan' : 'Save changes'}</button>
          </div>
        </div>
      </div>
    )}
  </div>;
}
