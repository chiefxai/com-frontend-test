import React from 'react';
import { Plus, Save, Pencil, X, ArrowLeft, CreditCard, Building2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { usePageHeaderContext } from '../lib/PageHeaderContext';
import AwsCreateLayout from '../components/ui/AwsCreateLayout';
import type { WorkspaceMode, WorkspacePlan, WorkspacePlanCatalog } from '../lib/workspacePolicy';

const MODES: { value: WorkspaceMode; label: string }[] = [
  { value: 'single', label: 'Single workspace' },
  { value: 'same_industry', label: 'Multiple branches · same industry' },
  { value: 'mixed_industry', label: 'Multiple workspaces · multiple industries' },
];

const blankPlan = (): WorkspacePlan => ({
  id: '', name: '', active: true, defaultMode: 'single',
  pricing: { baseMonthlyInr: 0, includedWorkspaces: 1, extraWorkspaceMonthlyInr: 0, additionalIndustryMonthlyInr: 0 },
});

export default function WorkspacePlansPage() {
  const headerCtx = usePageHeaderContext();
  const [plans, setPlans] = React.useState<WorkspacePlan[]>([]);
  const [existingIds, setExistingIds] = React.useState<Set<string>>(new Set());
  const [version, setVersion] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
  const [draft, setDraft] = React.useState<WorkspacePlan | null>(null);
  const [idTouched, setIdTouched] = React.useState(false);

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

  const beginAdd = React.useCallback(() => { setDraft(blankPlan()); setIdTouched(false); setEditingIndex(-1); setError(''); setMessage(''); }, []);
  const beginEdit = (index: number) => {
    const plan = plans[index];
    setDraft({ ...plan, pricing: { ...plan.pricing } }); setIdTouched(true);
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
    const missing = !draft.id.trim() || !draft.name.trim() || draft.pricing.baseMonthlyInr == null || draft.pricing.extraWorkspaceMonthlyInr == null || draft.pricing.additionalIndustryMonthlyInr == null;
    if (missing) { setError('Enter a plan name, ID and valid monthly prices.'); return; }
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

  React.useEffect(() => {
    if (!headerCtx) return;
    headerCtx.setHeader({
      title: <span className="flex items-center gap-2"><span className="text-[10px] font-medium text-[var(--text-muted)]">Admin /</span> Workspace Plans</span>,
      action: editingIndex !== null ? undefined : <button type="button" onClick={beginAdd} disabled={loading || saving} className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"><Plus className="h-4 w-4" /> Add plan</button>,
    });
  }, [headerCtx?.setHeader, beginAdd, loading, saving, editingIndex]);

  const money = (amount: number | null) => amount == null ? 'Not set' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount);
  const fieldClass = 'mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30';
  const labelClass = 'block text-xs font-semibold text-[var(--text-secondary)]';

  return <div className="mx-auto max-w-6xl space-y-5 text-[var(--text-primary)]">
    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
    {message && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
    {!draft && (loading ? <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-6 text-sm text-[var(--text-muted)]">Loading plans…</div> : (
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
            <div className="flex justify-between gap-3"><dt className="text-[var(--text-muted)]">Workspaces included</dt><dd className="font-semibold">{plan.pricing.includedWorkspaces}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--text-muted)]">Additional workspace</dt><dd className="font-semibold">{money(plan.pricing.extraWorkspaceMonthlyInr)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--text-muted)]">Additional industry</dt><dd className="font-semibold">{money(plan.pricing.additionalIndustryMonthlyInr)}</dd></div>
          </dl>
          <button type="button" onClick={() => beginEdit(index)} disabled={editingIndex !== null || saving} className="mt-auto inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-[var(--bg-subtle)] disabled:opacity-50"><Pencil className="h-4 w-4" /> Edit plan</button>
        </section>)}
        {!plans.length && <div className="col-span-full rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-surface)] p-10 text-center text-sm text-[var(--text-muted)]">No workspace plans yet.</div>}
      </div>
    ))}

    {draft && editingIndex !== null && (
      <AwsCreateLayout breadcrumb="Workspace Plans" title={editingIndex === -1 ? "Create plan" : "Edit plan"} description="" steps={[]} activeStep={0}>
        <div className="mx-auto w-full max-w-5xl space-y-5">
        <button type="button" onClick={cancelEdit} className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><ArrowLeft className="h-4 w-4" /> Back to plans</button>
        <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-sm">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
            <div><h3 id="workspace-plan-form-title" className="text-lg font-semibold">{editingIndex === -1 ? 'Create workspace plan' : 'Edit workspace plan'}</h3></div>
            <button type="button" onClick={cancelEdit} disabled={saving} aria-label="Close plan form" className="rounded-lg p-2 hover:bg-[var(--bg-subtle)] disabled:opacity-50"><X className="h-5 w-5" /></button>
          </div>
          <form id="workspace-plan-form" onSubmit={event => { event.preventDefault(); void save(); }} className="space-y-6 p-6">
            <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3"><Building2 className="h-4 w-4 text-[var(--accent)]" /><h4 className="text-sm font-semibold">Plan identity</h4></div>
            <div className="grid gap-5 sm:grid-cols-2">
            <label className={labelClass}>Plan name<input required value={draft.name} onChange={event => { const name = event.target.value; updateDraft({ name, ...(editingIndex === -1 && !idTouched ? { id: name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) } : {}) }); }} className={fieldClass} /></label>
            <label className={labelClass}>Stable plan ID<input required value={draft.id} onChange={event => { setIdTouched(true); updateDraft({ id: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') }); }} disabled={existingIds.has(draft.id)} placeholder="e.g. scale" className={fieldClass + ' disabled:opacity-60'} /></label>
            </div>
            <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3"><CreditCard className="h-4 w-4 text-[var(--accent)]" /><h4 className="text-sm font-semibold">Workspace access & pricing</h4></div>
            <div className="grid gap-5 sm:grid-cols-2">
            <label className={labelClass + ' sm:col-span-2'}>Default workspace structure<select value={draft.defaultMode} onChange={event => { const mode = event.target.value as WorkspaceMode; updateDraft({ defaultMode: mode, pricing: { ...draft.pricing, includedWorkspaces: mode === 'single' ? 1 : draft.pricing.includedWorkspaces } }); }} className={fieldClass}>{MODES.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select></label>
            <label className={labelClass}>Organization / month (INR)<input required type="number" min="0" step="0.01" value={draft.pricing.baseMonthlyInr ?? ''} onChange={event => updatePricing('baseMonthlyInr', event.target.value === '' ? null : Number(event.target.value))} className={fieldClass} /></label>
            <label className={labelClass}>Additional workspace / month (INR)<input required type="number" min="0" step="0.01" value={draft.pricing.extraWorkspaceMonthlyInr ?? ''} onChange={event => updatePricing('extraWorkspaceMonthlyInr', event.target.value === '' ? null : Number(event.target.value))} className={fieldClass} /></label>
            {draft.defaultMode !== 'single' && <label className={labelClass}>Included workspaces<input required type="number" min="1" max="1000" step="1" value={draft.pricing.includedWorkspaces} onChange={event => updatePricing('includedWorkspaces', Number(event.target.value))} className={fieldClass} /></label>}
            <label className={labelClass}>Additional industry / month (INR)<input required type="number" min="0" step="0.01" value={draft.pricing.additionalIndustryMonthlyInr ?? ''} onChange={event => updatePricing('additionalIndustryMonthlyInr', event.target.value === '' ? null : Number(event.target.value))} className={fieldClass} /></label>
            <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2"><input type="checkbox" checked={draft.active} onChange={event => updateDraft({ active: event.target.checked })} className="h-4 w-4 accent-[var(--accent)]" /> Active plan (available for new organizations)</label>
            </div>
          </form>
          <div className="flex justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
            <button type="button" onClick={cancelEdit} disabled={saving} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--bg-subtle)]">Cancel</button>
            <button type="submit" form="workspace-plan-form" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Saving…' : editingIndex === -1 ? 'Create plan' : 'Save changes'}</button>
          </div>
        </section>
      </div>
      </AwsCreateLayout>
    )}
  </div>;
}
