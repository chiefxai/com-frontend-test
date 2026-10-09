import React from 'react';
import { Building2, CreditCard, Pencil, Plus, Save, ShieldCheck, Wallet, Layers3, ArrowUpRight } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { usePageHeaderContext } from '../lib/PageHeaderContext';
import type { WorkspaceMode, WorkspacePlan, WorkspacePlanCatalog } from '../lib/workspacePolicy';
import Widget from '../components/ui/Widget';
import { Card, CardHeader } from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import FilterBar from '../components/ui/FilterBar';
import Badge from '../components/ui/Badge';
import KpiCard from '../components/ui/KpiCard';
import Button from '../components/ui/Button';
import IconButton from '../components/ui/IconButton';

const MODES: { value: WorkspaceMode; label: string }[] = [
  { value: 'single', label: 'One workspace only' },
  { value: 'same_industry', label: 'Multiple workspaces in one industry' },
  { value: 'mixed_industry', label: 'Multiple workspaces across industries' },
];

const blankPlan = (): WorkspacePlan => ({
  id: '', name: '', active: true, defaultMode: 'single',
  pricing: { baseMonthlyInr: 0, includedWorkspaces: 1, extraWorkspaceMonthlyInr: 0, additionalIndustryMonthlyInr: 0, monthlySubscriptionCreditsInr: 0 },
});

const money = (amount: number | null | undefined) =>
  amount == null ? 'Not set' : new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 2,
  }).format(amount);

const fieldClass = 'mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-blue-500/15 disabled:cursor-not-allowed disabled:bg-[var(--bg-subtle)] disabled:opacity-60';
const labelClass = 'block min-w-0 text-xs font-semibold text-[var(--text-secondary)]';
const helpClass = 'mt-1.5 block text-[11px] font-normal leading-relaxed text-[var(--text-muted)]';

function validAmount(value: number | null | undefined) {
  return value != null && Number.isFinite(value) && value >= 0;
}

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
  const [query, setQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'active' | 'archived'>('all');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/platform/billing/workspace-plans');
      const body = await response.json().catch(() => ({})) as WorkspacePlanCatalog & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Could not load subscription plans.');
      const nextPlans = Array.isArray(body.plans) ? body.plans : [];
      setPlans(nextPlans);
      setExistingIds(new Set(nextPlans.map(plan => plan.id)));
      setVersion(body.version || 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load subscription plans.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const beginAdd = React.useCallback(() => {
    setDraft(blankPlan());
    setIdTouched(false);
    setEditingIndex(-1);
    setError('');
    setMessage('');
  }, []);

  const beginEdit = (plan: WorkspacePlan) => {
    const index = plans.findIndex(item => item.id === plan.id);
    if (index < 0) return;
    setDraft({ ...plan, pricing: { ...plan.pricing } });
    setIdTouched(true);
    setEditingIndex(index);
    setError('');
    setMessage('');
  };

  const cancelEdit = React.useCallback(() => {
    setDraft(null);
    setEditingIndex(null);
    setError('');
  }, []);

  const updateDraft = (change: Partial<WorkspacePlan>) =>
    setDraft(current => current ? { ...current, ...change } : current);

  const updatePricing = (key: keyof WorkspacePlan['pricing'], value: number | null) =>
    setDraft(current => current ? { ...current, pricing: { ...current.pricing, [key]: value } } : current);

  const save = async () => {
    if (!draft || editingIndex === null || saving) return;
    setError('');
    setMessage('');
    const planToSave: WorkspacePlan = {
      ...draft,
      id: draft.id.trim(),
      name: draft.name.trim(),
      pricing: {
        ...draft.pricing,
        includedWorkspaces: draft.defaultMode === 'single' ? 1 : draft.pricing.includedWorkspaces,
        extraWorkspaceMonthlyInr: draft.defaultMode === 'single' ? 0 : draft.pricing.extraWorkspaceMonthlyInr,
        additionalIndustryMonthlyInr: draft.defaultMode === 'mixed_industry'
          ? draft.pricing.additionalIndustryMonthlyInr : 0,
      },
    };

    if (!planToSave.id || !planToSave.name) {
      setError('Enter both a plan name and a plan code.');
      return;
    }
    if (editingIndex === -1 && existingIds.has(planToSave.id)) {
      setError('This plan code already exists. Choose a unique code.');
      return;
    }
    if (!validAmount(planToSave.pricing.baseMonthlyInr)
      || !validAmount(planToSave.pricing.extraWorkspaceMonthlyInr)
      || !validAmount(planToSave.pricing.additionalIndustryMonthlyInr)
      || !validAmount(planToSave.pricing.monthlySubscriptionCreditsInr ?? 0)
      || !Number.isInteger(planToSave.pricing.includedWorkspaces)
      || planToSave.pricing.includedWorkspaces < 1
      || planToSave.pricing.includedWorkspaces > 1000) {
      setError('Enter valid non-negative monthly fees and credits, and 1–1,000 included workspaces.');
      return;
    }

    const nextPlans = editingIndex === -1
      ? [...plans, planToSave]
      : plans.map((plan, index) => index === editingIndex ? planToSave : plan);
    setSaving(true);
    try {
      const response = await apiFetch('/api/platform/billing/workspace-plans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedVersion: version, plans: nextPlans }),
      });
      const body = await response.json().catch(() => ({})) as WorkspacePlanCatalog & { error?: string };
      if (!response.ok) throw new Error(body.error || (response.status === 409
        ? 'Plan settings changed elsewhere. Reload and try again.'
        : 'Could not save the subscription plan.'));
      const savedPlans = Array.isArray(body.plans) ? body.plans : [];
      setPlans(savedPlans);
      setExistingIds(new Set(savedPlans.map(plan => plan.id)));
      setVersion(body.version || version + 1);
      setMessage(editingIndex === -1 ? 'Subscription plan created successfully.' : 'Subscription plan updated successfully.');
      setDraft(null);
      setEditingIndex(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the subscription plan.');
    } finally {
      setSaving(false);
    }
  };

  React.useEffect(() => {
    if (!headerCtx) return;
    headerCtx.setHeader({
      title: <span className="flex min-w-0 items-center gap-2">
        <span className="text-[10px] font-medium text-[var(--text-muted)]">Admin</span>
        <span className="text-[var(--border)]">/</span>
        {editingIndex !== null ? <>
          <button type="button" disabled={saving} onClick={cancelEdit}
            className="text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50">
            Subscription Plans
          </button>
          <span className="text-[var(--border)]">/</span>
          <span className="truncate">{editingIndex === -1 ? 'Create Plan' : 'Edit Plan'}</span>
        </> : <span className="truncate">Subscription Plans</span>}
      </span>,
      action: editingIndex === null
        ? <IconButton icon={Plus} label="Create subscription plan" onClick={beginAdd} disabled={loading || saving} />
        : undefined,
    });
  }, [headerCtx?.setHeader, beginAdd, cancelEdit, editingIndex, loading, saving]);

  const filteredPlans = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    return plans.filter(plan => {
      if (statusFilter === 'active' && !plan.active) return false;
      if (statusFilter === 'archived' && plan.active) return false;
      return !term || (plan.name + ' ' + plan.id + ' ' + plan.defaultMode).toLowerCase().includes(term);
    });
  }, [plans, query, statusFilter]);

  const activeCount = plans.filter(plan => plan.active).length;
  const activeFees = plans
    .filter(plan => plan.active && validAmount(plan.pricing.baseMonthlyInr))
    .map(plan => Number(plan.pricing.baseMonthlyInr));
  const startingFee = activeFees.length ? money(Math.min(...activeFees)) : '—';

  return <div className="w-full min-w-0 space-y-5 text-[var(--text-primary)]">
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
      <span>{error}</span>
      {!draft && <Button size="xs" type="button" onClick={() => void load()}>Retry</Button>}
    </div>}
    {message && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">{message}</div>}

    {editingIndex === null ? (
      <>
        <div className="grid grid-cols-12 gap-4">
          <KpiCard colSpan={3} label="Total plans" value={loading ? '—' : plans.length} icon={CreditCard} />
          <KpiCard colSpan={3} label="Active plans" value={loading ? '—' : activeCount} icon={ShieldCheck} />
          <KpiCard colSpan={3} label="Archived plans" value={loading ? '—' : plans.length - activeCount} icon={Building2} />
          <KpiCard colSpan={3} label="Starting monthly fee" value={loading ? '—' : startingFee} icon={Wallet} />
        </div>

        <Widget title="Subscription plan catalog" subtitle="Manage plan pricing, monthly credits and workspace allowances."
          icon={CreditCard} accent="#2563eb" padding="none"
          action={<Button type="button" size="sm" variant="secondary" onClick={() => void load()} disabled={loading}>Refresh</Button>}>
          <div className="border-b border-[var(--border)] bg-[var(--bg-surface)] p-4">
            <FilterBar
              search={{ value: query, onChange: setQuery, placeholder: 'Search plans by name or code…' }}
              selects={[{
                key: 'status', label: 'Status', value: statusFilter,
                onChange: value => setStatusFilter(value as typeof statusFilter),
                options: [
                  { label: 'All statuses', value: 'all' },
                  { label: 'Active', value: 'active' },
                  { label: 'Archived', value: 'archived' },
                ],
              }]}
              onClear={() => { setQuery(''); setStatusFilter('all'); }}
              hasActiveFilters={Boolean(query.trim() || statusFilter !== 'all')}
              resultCount={{ filtered: filteredPlans.length, total: plans.length, label: 'plans' }}
              actions={<IconButton icon={Plus} label="Create subscription plan" onClick={beginAdd} disabled={loading || saving} />}
            />
          </div>
          {loading ? (
            <div role="status" className="p-6 text-sm text-[var(--text-muted)]">Loading subscription plans…</div>
          ) : filteredPlans.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              heading={plans.length ? 'No plans match your filters' : 'No subscription plans yet'}
              message={plans.length
                ? 'Try another search or status filter.'
                : 'Create a subscription plan to make it available for new organizations.'}
              action={plans.length
                ? <Button type="button" size="sm" variant="secondary"
                    onClick={() => { setQuery(''); setStatusFilter('all'); }}>Clear filters</Button>
                : <Button type="button" size="sm" variant="primary" icon={Plus} onClick={beginAdd}>Create plan</Button>}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredPlans.map(plan => (
                <Card key={plan.id} padding="none" hover
                  className="group relative flex min-w-0 flex-col overflow-hidden transition-colors hover:border-blue-300 dark:hover:border-blue-600">
                  <div aria-hidden="true"
                    className="h-1 w-full shrink-0 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500" />
                  <div className="flex flex-1 flex-col gap-4 p-5">
                    <CardHeader
                      title={plan.name}
                      subtitle={<span className="font-mono text-[11px]">{plan.id}</span>}
                      icon={CreditCard}
                      accent={plan.active ? '#2563eb' : '#64748b'}
                      border={false}
                      action={<Badge color={plan.active ? 'green' : 'slate'}>
                        {plan.active ? 'Active' : 'Archived'}
                      </Badge>}
                    />
                    <div className="border-b border-[var(--border)] pb-4">
                      <div className="flex flex-wrap items-baseline gap-1">
                        <span className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                          {money(plan.pricing.baseMonthlyInr)}
                        </span>
                        <span className="text-xs text-[var(--text-muted)]">/ month</span>
                      </div>
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                        <Layers3 className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                        {MODES.find(mode => mode.value === plan.defaultMode)?.label || plan.defaultMode}
                      </p>
                    </div>
                    <dl className="space-y-3 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-[var(--text-muted)]">Included workspaces</dt>
                        <dd className="font-semibold text-[var(--text-primary)]">
                          {plan.defaultMode === 'single' ? 1 : plan.pricing.includedWorkspaces}
                        </dd>
                      </div>
                      {plan.defaultMode !== 'single' && (
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-[var(--text-muted)]">Extra workspace / month</dt>
                          <dd className="font-semibold text-[var(--text-primary)]">
                            {money(plan.pricing.extraWorkspaceMonthlyInr)}
                          </dd>
                        </div>
                      )}
                      {plan.defaultMode === 'mixed_industry' && (
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-[var(--text-muted)]">Extra industry / month</dt>
                          <dd className="font-semibold text-[var(--text-primary)]">
                            {money(plan.pricing.additionalIndustryMonthlyInr)}
                          </dd>
                        </div>
                      )}
                    </dl>
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--bg-subtle)] px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                          Monthly usage credits
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-[var(--text-primary)]">
                          {money(plan.pricing.monthlySubscriptionCreditsInr ?? 0)}
                        </p>
                      </div>
                      <Wallet className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
                    </div>
                    <Button type="button" size="sm" variant="secondary" icon={Pencil}
                      iconRight={ArrowUpRight} className="w-full justify-center"
                      disabled={saving} onClick={() => beginEdit(plan)}>
                      Edit plan
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Widget>
      </>
    ) : draft ? (
      <form id="workspace-plan-form" onSubmit={event => { event.preventDefault(); void save(); }}
        className="grid grid-cols-12 gap-4 md:gap-5">
        <Widget colSpan={12} title="Plan identity"
          subtitle="Give this plan a recognizable name and a stable internal code."
          icon={CreditCard} padding="md">
          <div className="grid gap-4 md:grid-cols-2">
            <label className={labelClass}>Subscription plan name
              <input className={fieldClass} required maxLength={120} disabled={saving}
                autoFocus={editingIndex === -1}
                value={draft.name}
                onChange={event => {
                  const name = event.target.value;
                  updateDraft({
                    name,
                    ...(editingIndex === -1 && !idTouched
                      ? { id: name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) }
                      : {}),
                  });
                }} placeholder="e.g. Growth" />
            </label>
            <label className={labelClass}>Plan code
              <input className={fieldClass} required disabled={saving || editingIndex !== -1}
                maxLength={64} value={draft.id}
                onChange={event => {
                  setIdTouched(true);
                  updateDraft({ id: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') });
                }} placeholder="e.g. growth-plan" />
              <span className={helpClass}>Generated from the name for new plans. Existing plan codes cannot be changed.</span>
            </label>
          </div>
        </Widget>

        <Widget colSpan={12} title="Monthly subscription and credits"
          subtitle="Usage credits are allocated separately; they do not reduce the subscription fee."
          icon={Wallet} accent="#0891b2" padding="md">
          <div className="grid gap-4 md:grid-cols-2">
            <label className={labelClass}>Monthly subscription fee (₹)
              <input className={fieldClass} type="number" required min="0" step="0.01" disabled={saving}
                value={draft.pricing.baseMonthlyInr ?? ''}
                onChange={event => updatePricing('baseMonthlyInr', event.target.value === '' ? null : Number(event.target.value))} />
              <span className={helpClass}>Base monthly fee before optional workspace or industry charges.</span>
            </label>
            <label className={labelClass}>Monthly usage credits (₹)
              <input className={fieldClass} type="number" required min="0" step="0.01" disabled={saving}
                value={draft.pricing.monthlySubscriptionCreditsInr ?? 0}
                onChange={event => updatePricing('monthlySubscriptionCreditsInr', Number(event.target.value))} />
              <span className={helpClass}>Credits issued when the paid subscription cycle is fulfilled.</span>
            </label>
          </div>
        </Widget>

        <Widget colSpan={12} title="Workspace allowances and add-ons"
          subtitle="Choose allowed workspace structures and their additional monthly charges."
          icon={Building2} accent="#7c3aed" padding="md">
          <div className="grid gap-4 md:grid-cols-2">
            <label className={labelClass + ' md:col-span-2'}>Workspace setup
              <select className={fieldClass} value={draft.defaultMode} disabled={saving}
                onChange={event => {
                  const mode = event.target.value as WorkspaceMode;
                  updateDraft({
                    defaultMode: mode,
                    pricing: {
                      ...draft.pricing,
                      includedWorkspaces: mode === 'single' ? 1 : draft.pricing.includedWorkspaces,
                      extraWorkspaceMonthlyInr: mode === 'single' ? 0 : draft.pricing.extraWorkspaceMonthlyInr,
                      additionalIndustryMonthlyInr: mode === 'mixed_industry' ? draft.pricing.additionalIndustryMonthlyInr : 0,
                    },
                  });
                }}>
                {MODES.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
              </select>
            </label>
            {draft.defaultMode !== 'single' && <>
              <label className={labelClass}>Included workspaces
                <input className={fieldClass} type="number" required min="1" max="1000" step="1" disabled={saving}
                  value={draft.pricing.includedWorkspaces}
                  onChange={event => updatePricing('includedWorkspaces', Number(event.target.value))} />
                <span className={helpClass}>Extra workspace fees start after this allowance.</span>
              </label>
              <label className={labelClass}>Monthly fee per extra workspace (₹)
                <input className={fieldClass} type="number" required min="0" step="0.01" disabled={saving}
                  value={draft.pricing.extraWorkspaceMonthlyInr ?? ''}
                  onChange={event => updatePricing('extraWorkspaceMonthlyInr', event.target.value === '' ? null : Number(event.target.value))} />
              </label>
            </>}
            {draft.defaultMode === 'mixed_industry' && <label className={labelClass + ' md:col-span-2'}>Monthly fee per additional industry (₹)
              <input className={fieldClass} type="number" required min="0" step="0.01" disabled={saving}
                value={draft.pricing.additionalIndustryMonthlyInr ?? ''}
                onChange={event => updatePricing('additionalIndustryMonthlyInr', event.target.value === '' ? null : Number(event.target.value))} />
              <span className={helpClass}>Charged per additional distinct industry, not per workspace.</span>
            </label>}
          </div>
        </Widget>

        <Widget colSpan={12} title="Availability" subtitle="Control whether new organizations can select this plan."
          icon={ShieldCheck} accent="#059669" padding="md">
          <label className="inline-flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3 text-xs font-medium text-[var(--text-secondary)]">
            <input type="checkbox" checked={draft.active} disabled={saving}
              onChange={event => updateDraft({ active: event.target.checked })}
              className="h-4 w-4 accent-[var(--accent)]" />
            Available to new organizations
          </label>
        </Widget>

        <div className="col-span-12 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {draft.name || 'New plan'} · {money(draft.pricing.baseMonthlyInr)} / month
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Review the details before saving.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" disabled={saving} onClick={cancelEdit}>Cancel</Button>
            <Button type="submit" variant="primary" icon={Save} loading={saving}>
              {editingIndex === -1 ? 'Create plan' : 'Save changes'}
            </Button>
          </div>
        </div>
      </form>
    ) : null}
  </div>;
}
