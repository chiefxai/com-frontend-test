import React from 'react';
import { Plus, Save, Pencil } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { usePageHeaderContext } from '../lib/PageHeaderContext';
import type { WorkspaceMode, WorkspacePlan, WorkspacePlanCatalog } from '../lib/workspacePolicy';

const MODES: { value: WorkspaceMode; label: string }[] = [
  { value: 'single', label: 'One workspace only' },
  { value: 'same_industry', label: 'Multiple workspaces in one industry' },
  { value: 'mixed_industry', label: 'Multiple workspaces across industries' },
];

const blankPlan = (): WorkspacePlan => ({
  id: '', name: '', active: true, defaultMode: 'single',
  pricing: { baseMonthlyInr: 0, includedWorkspaces: 1, extraWorkspaceMonthlyInr: 0, additionalIndustryMonthlyInr: 0, monthlySubscriptionCreditsInr: 0 },
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
    const planToSave = { ...draft, pricing: {
      ...draft.pricing,
      includedWorkspaces: draft.defaultMode === 'single' ? 1 : draft.pricing.includedWorkspaces,
      extraWorkspaceMonthlyInr: draft.defaultMode === 'single' ? 0 : draft.pricing.extraWorkspaceMonthlyInr,
      additionalIndustryMonthlyInr: draft.defaultMode === 'mixed_industry' ? draft.pricing.additionalIndustryMonthlyInr : 0,
    } };
    const nextPlans = editingIndex === -1 ? [...plans, planToSave] : plans.map((plan, index) => index === editingIndex ? planToSave : plan);
    const missing = !draft.id.trim() || !draft.name.trim() || planToSave.pricing.baseMonthlyInr == null || planToSave.pricing.extraWorkspaceMonthlyInr == null || planToSave.pricing.additionalIndustryMonthlyInr == null || !Number.isFinite(planToSave.pricing.monthlySubscriptionCreditsInr ?? 0) || (planToSave.pricing.monthlySubscriptionCreditsInr ?? 0) < 0;
    if (missing) { setError('Enter a plan name, code, and valid monthly fees and credits.'); return; }
    setSaving(true);
    try {
      const response = await apiFetch('/api/platform/billing/workspace-plans', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedVersion: version, plans: nextPlans }),
      });
      const body = await response.json().catch(() => ({})) as WorkspacePlanCatalog & { error?: string; code?: string };
      if (!response.ok) throw new Error(body.error || (response.status === 409 ? 'Plan settings changed. Reload and try again.' : 'Could not save workspace plans.'));
      setPlans(body.plans || []); setExistingIds(new Set((body.plans || []).map(plan => plan.id))); setVersion(body.version || version + 1); setMessage('Plan saved. New organizations can select this plan.'); setDraft(null); setEditingIndex(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save workspace plans.'); }
    finally { setSaving(false); }
  };

  React.useEffect(() => {
    if (!headerCtx) return;
    headerCtx.setHeader({
      title: <span className="flex items-center gap-2 min-w-0">
        <span className="text-[10px] font-medium text-[var(--text-muted)]">Admin</span>
        <span className="text-[var(--border)]">/</span>
        {editingIndex !== null ? <>
          <button type="button" onClick={cancelEdit} disabled={saving}
            className="text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50">
            Subscription Plans
          </button>
          <span className="text-[var(--border)]">/</span>
          <span className="truncate">{editingIndex === -1 ? 'Create Plan' : 'Edit Plan'}</span>
        </> : <span className="truncate">Subscription Plans</span>}
      </span>,
      action: editingIndex !== null ? undefined : <button type="button" onClick={beginAdd} disabled={loading || saving} className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"><Plus className="h-4 w-4" /> Create plan</button>,
    });
  }, [headerCtx?.setHeader, beginAdd, loading, saving, editingIndex]);

  const money = (amount: number | null) => amount == null ? 'Not set' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount);
  const fieldClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500';
  const labelClass = 'block text-xs font-medium text-slate-500';

  return <div className="mx-auto w-full max-w-5xl space-y-5 text-[var(--text-primary)]">
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
            <div className="flex justify-between gap-3"><dt className="text-[var(--text-muted)]">Included workspaces</dt><dd className="font-semibold">{plan.pricing.includedWorkspaces}</dd></div>
            {plan.defaultMode !== 'single' && <div className="flex justify-between gap-3"><dt className="text-[var(--text-muted)]">Extra workspace / month</dt><dd className="font-semibold">{money(plan.pricing.extraWorkspaceMonthlyInr)}</dd></div>}
            <div className="flex justify-between gap-3"><dt className="text-[var(--text-muted)]">Included usage credits / month</dt><dd className="font-semibold">{money(plan.pricing.monthlySubscriptionCreditsInr ?? 0)}</dd></div>
            {plan.defaultMode === 'mixed_industry' && <div className="flex justify-between gap-3"><dt className="text-[var(--text-muted)]">Extra industry / month</dt><dd className="font-semibold">{money(plan.pricing.additionalIndustryMonthlyInr)}</dd></div>}
          </dl>
          <button type="button" onClick={() => beginEdit(index)} disabled={editingIndex !== null || saving} className="mt-auto inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-[var(--bg-subtle)] disabled:opacity-50"><Pencil className="h-4 w-4" /> Edit plan</button>
        </section>)}
        {!plans.length && <div className="col-span-full rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-surface)] p-10 text-center text-sm text-[var(--text-muted)]">No workspace plans yet.</div>}
      </div>
    ))}

    {draft && editingIndex !== null && (
      <div className="mx-auto w-full max-w-5xl">
        <div className="space-y-5">
        <div className="space-y-5">
          <form id="workspace-plan-form" onSubmit={event => { event.preventDefault(); void save(); }} className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <h2 id="workspace-plan-form-title" className="text-sm font-semibold text-slate-800">Subscription plan details</h2>
                <p className="mt-1 text-[11px] text-slate-500">Choose a name customers will recognize. The plan code is used internally.</p>
              </div>
            <div className="grid gap-4 md:grid-cols-2">
            <label className={labelClass}>Subscription plan name<input required value={draft.name} onChange={event => { const name = event.target.value; updateDraft({ name, ...(editingIndex === -1 && !idTouched ? { id: name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) } : {}) }); }} className={fieldClass} /></label>
            <label className={labelClass}>Plan code (auto-generated)<input required value={draft.id} onChange={event => { setIdTouched(true); updateDraft({ id: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') }); }} disabled={existingIds.has(draft.id)} placeholder="e.g. growth-plan" className={fieldClass + ' disabled:opacity-60'} /></label>
            </div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-slate-800">Monthly subscription & included credits</h2>
                <p className="mt-1 text-[11px] text-slate-500">The subscription fee is what an organization pays. Included usage credits are a separate allowance, not a discount on that fee.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className={labelClass}>Monthly subscription fee (₹)
                  <input required type="number" min="0" step="0.01" value={draft.pricing.baseMonthlyInr ?? ''} onChange={event => updatePricing('baseMonthlyInr', event.target.value === '' ? null : Number(event.target.value))} className={fieldClass} />
                  <span className="mt-1 block text-[11px] font-normal text-slate-500">Base monthly charge before extra workspaces or industries.</span>
                </label>
                <label className={labelClass}>Usage credits included each month (₹)
                  <input required type="number" min="0" step="0.01" value={draft.pricing.monthlySubscriptionCreditsInr ?? 0} onChange={event => updatePricing('monthlySubscriptionCreditsInr', Number(event.target.value))} className={fieldClass} />
                  <span className="mt-1 block text-[11px] font-normal text-slate-500">Usage allowance issued separately when the paid subscription cycle is fulfilled.</span>
                </label>
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-slate-800">Workspaces & extra monthly charges</h2>
                <p className="mt-1 text-[11px] text-slate-500">Choose what the plan permits and the additional monthly prices that apply beyond its included allowances.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className={labelClass + ' md:col-span-2'}>Which workspace setup does this plan allow?
                  <select value={draft.defaultMode} onChange={event => {
                    const mode = event.target.value as WorkspaceMode;
                    updateDraft({ defaultMode: mode, pricing: {
                      ...draft.pricing,
                      includedWorkspaces: mode === 'single' ? 1 : draft.pricing.includedWorkspaces,
                      extraWorkspaceMonthlyInr: mode === 'single' ? 0 : draft.pricing.extraWorkspaceMonthlyInr,
                      additionalIndustryMonthlyInr: mode === 'mixed_industry' ? draft.pricing.additionalIndustryMonthlyInr : 0,
                    } });
                  }} className={fieldClass}>{MODES.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select>
                  <span className="mt-1 block text-[11px] font-normal text-slate-500">One workspace, multiple locations in one industry, or workspaces across different industries.</span>
                </label>
                {draft.defaultMode !== 'single' && <>
                  <label className={labelClass}>Workspaces included in the subscription
                    <input required type="number" min="1" max="1000" step="1" value={draft.pricing.includedWorkspaces} onChange={event => updatePricing('includedWorkspaces', Number(event.target.value))} className={fieldClass} />
                    <span className="mt-1 block text-[11px] font-normal text-slate-500">These workspaces do not incur an extra workspace fee.</span>
                  </label>
                  <label className={labelClass}>Monthly fee per extra workspace (₹)
                    <input required type="number" min="0" step="0.01" value={draft.pricing.extraWorkspaceMonthlyInr ?? ''} onChange={event => updatePricing('extraWorkspaceMonthlyInr', event.target.value === '' ? null : Number(event.target.value))} className={fieldClass} />
                    <span className="mt-1 block text-[11px] font-normal text-slate-500">Charged for each workspace beyond the included number.</span>
                  </label>
                </>}
                {draft.defaultMode === 'mixed_industry' && <label className={labelClass + ' md:col-span-2'}>Monthly fee per additional industry (₹)
                  <input required type="number" min="0" step="0.01" value={draft.pricing.additionalIndustryMonthlyInr ?? ''} onChange={event => updatePricing('additionalIndustryMonthlyInr', event.target.value === '' ? null : Number(event.target.value))} className={fieldClass} />
                  <span className="mt-1 block text-[11px] font-normal text-slate-500">Charged once per distinct industry beyond the primary industry, not once per workspace.</span>
                </label>}
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800">Plan availability</h2>
              <label className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={draft.active} onChange={event => updateDraft({ active: event.target.checked })} className="h-4 w-4 accent-amber-500" />
                Allow new organizations to select this plan
              </label>
            </section>
          </form>
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <button type="button" onClick={cancelEdit} disabled={saving} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
            <button type="submit" form="workspace-plan-form" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2 text-sm font-medium text-white hover:bg-amber-400 disabled:opacity-60"><Save className="h-4 w-4" />{saving ? 'Saving…' : editingIndex === -1 ? 'Create plan' : 'Save changes'}</button>
          </div>
        </div>
      </div>
      </div>
    )}
  </div>;
}
