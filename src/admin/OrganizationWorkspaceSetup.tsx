import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Layers3, Plus, Users } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatInr } from '../lib/pricing';
import { INDUSTRY_PROFILES } from '../lib/industry/registry';
import type { WorkspacePolicyDraft } from '../lib/workspacePolicy';
import { Card, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';

type Setup = {
  policy: WorkspacePolicyDraft & { primaryIndustry: string; planId?: string | null };
  workspaces: { id: string; name: string; industry: string }[];
  currentQuote: { totalMonthlyInr: number; seatCount: number } | null;
  addBranchQuote: { totalMonthlyInr: number; paymentRequired: boolean } | null;
};

const inputClass = 'mt-1.5 h-10 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-xs text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-subtle)] disabled:cursor-not-allowed disabled:opacity-60';

const readable = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

export default function OrganizationWorkspaceSetup({ orgId }: { orgId: string }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [branch, setBranch] = useState({ name: '', industry: '' });
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'success'>('error');

  const load = useCallback(async () => {
    const response = await apiFetch(`/api/platform/organizations/${orgId}/workspace-setup`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Could not load organization workspaces.');
    setSetup(body);
    setBranch(current => ({ ...current, industry: body.policy.primaryIndustry }));
  }, [orgId]);

  useEffect(() => {
    setSetup(null);
    setShowCreate(false);
    setMessage('');
    void load().catch(error => {
      setMessageType('error');
      setMessage(error instanceof Error ? error.message : 'Could not load organization workspaces.');
    });
  }, [load]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const response = await apiFetch(`/api/platform/organizations/${orgId}/workspaces`, {
        method: 'POST',
        body: JSON.stringify(branch),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not create workspace.');
      setBranch(current => ({ ...current, name: '' }));
      await load();
      setShowCreate(false);
      setMessageType('success');
      setMessage('Workspace created and assigned to an organization administrator.');
    } catch (error) {
      setMessageType('error');
      setMessage(error instanceof Error ? error.message : 'Could not create workspace.');
    } finally {
      setBusy(false);
    }
  }

  if (!setup) {
    return (
      <Card padding="sm" className="space-y-3">
        <CardHeader title="Subscription workspaces" subtitle="Workspace allowances and recurring costs" icon={Layers3} border={false} />
        <p role={message ? 'alert' : 'status'} className="text-xs text-[var(--text-secondary)]">
          {message || 'Loading workspace details…'}
        </p>
        {message && <Button type="button" size="sm" variant="secondary" onClick={() => {
          setMessage('');
          void load().catch(error => {
            setMessageType('error');
            setMessage(error instanceof Error ? error.message : 'Could not load workspace details.');
          });
        }}>Retry</Button>}
      </Card>
    );
  }

  const { policy, workspaces, currentQuote, addBranchQuote } = setup;
  const max = policy.mode === 'single' ? 1 : policy.pricing?.maxWorkspaces ?? null;
  const atLimit = policy.mode === 'single' || (max !== null && workspaces.length >= max);
  const requiresPayment = Boolean(addBranchQuote?.paymentRequired);
  const canCreate = !atLimit && Boolean(addBranchQuote) && !requiresPayment;

  return (
    <Card padding="sm" className="min-w-0 sm:!p-5">
      <CardHeader
        title="Subscription workspaces"
        subtitle="Workspaces and allowances on this organization's plan"
        icon={Layers3}
        action={canCreate ? (
          <Button type="button" size="sm" variant="secondary" icon={showCreate ? undefined : Plus}
            onClick={() => { setShowCreate(value => !value); setMessage(''); }}>
            {showCreate ? 'Cancel' : 'Add workspace'}
          </Button>
        ) : undefined}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="min-w-0 text-[var(--text-secondary)]">
          <span className="mr-2 text-[var(--text-muted)]">Plan</span>
          <strong className="font-semibold text-[var(--text-primary)]">{readable(policy.planId || 'Legacy')}</strong>
        </span>
        <span className="rounded-lg bg-[var(--bg-subtle)] px-2.5 py-1.5 font-medium text-[var(--text-secondary)]">
          {readable(policy.primaryIndustry)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]/50 p-3">
          <p className="text-[11px] font-medium text-[var(--text-secondary)]">Workspaces</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--text-primary)]">
            {workspaces.length}<span className="ml-1 text-xs font-medium text-[var(--text-muted)]">/ {max === null ? 'Unlimited' : max}</span>
          </p>
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">{policy.pricing?.includedWorkspaces ?? 1} included in plan</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]/50 p-3">
          <p className="text-[11px] font-medium text-[var(--text-secondary)]">Extra workspace</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--text-primary)]">
            {policy.pricing?.extraWorkspaceMonthlyInr == null ? '—' : formatInr(policy.pricing.extraWorkspaceMonthlyInr)}
          </p>
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">Per month, plus applicable taxes</p>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h5 className="text-xs font-semibold text-[var(--text-primary)]">Current workspaces</h5>
          <span className="text-[11px] font-medium tabular-nums text-[var(--text-muted)]">{workspaces.length} total</span>
        </div>
        {workspaces.length ? (
          <ul className="max-h-44 divide-y divide-[var(--border)] overflow-y-auto rounded-xl border border-[var(--border)]">
            {workspaces.map(workspace => (
              <li key={workspace.id} className="flex min-w-0 items-center gap-3 px-3 py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-subtle)] text-[var(--accent)]">
                  <Building2 className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-[var(--text-primary)]" title={workspace.name}>{workspace.name}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{readable(workspace.industry)}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="rounded-xl border border-dashed border-[var(--border)] p-4 text-xs text-[var(--text-muted)]">No workspaces have been set up yet.</p>}
      </div>

      {currentQuote && (
        <div className="mt-4 flex flex-wrap items-end justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]/50 px-3.5 py-3">
          <div className="min-w-0">
            <p className="text-[11px] text-[var(--text-secondary)]">Estimated monthly subscription</p>
            <p className="mt-1 text-[10px] text-[var(--text-muted)]"><Users className="mr-1 inline h-3 w-3" />{currentQuote.seatCount} active seats · Excludes usage and taxes</p>
          </div>
          <p className="text-lg font-semibold tabular-nums text-[var(--text-primary)]">{formatInr(currentQuote.totalMonthlyInr)}</p>
        </div>
      )}

      {message && (
        <p role={messageType === 'error' ? 'alert' : 'status'}
          className={`mt-3 rounded-lg border px-3 py-2.5 text-xs ${messageType === 'error'
            ? 'border-rose-300/50 bg-rose-500/5 text-rose-700 dark:text-rose-300'
            : 'border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]'}`}>
          {message}
        </p>
      )}

      {atLimit && <p className="mt-4 rounded-lg bg-[var(--bg-subtle)] px-3 py-2.5 text-xs text-[var(--text-secondary)]">
        This plan has reached its workspace limit. Manage the allowance in Subscription Plans.
      </p>}
      {!atLimit && requiresPayment && <p className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5 text-xs text-[var(--text-secondary)]">
        Adding a workspace requires an approved add-on payment. The organization billing administrator can purchase it in workspace billing.
      </p>}
      {!atLimit && !addBranchQuote && <p className="mt-4 text-xs text-[var(--text-muted)]">A new workspace quote is not available for this plan.</p>}

      {showCreate && canCreate && addBranchQuote && (
        <form onSubmit={create} className="mt-4 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]/40 p-3.5">
          <div>
            <h5 className="text-sm font-semibold text-[var(--text-primary)]">Add a workspace</h5>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Set up another workspace for this organization.</p>
          </div>
          <label className="block text-xs font-medium text-[var(--text-secondary)]">
            Workspace name
            <input required maxLength={120} value={branch.name} disabled={busy}
              placeholder="e.g. Downtown branch" onChange={event => setBranch(current => ({ ...current, name: event.target.value }))}
              className={inputClass} />
          </label>
          <label className="block text-xs font-medium text-[var(--text-secondary)]">
            Industry
            <select aria-label="New workspace industry" value={policy.mode === 'mixed_industry' ? branch.industry : policy.primaryIndustry}
              disabled={busy || policy.mode !== 'mixed_industry'}
              onChange={event => setBranch(current => ({ ...current, industry: event.target.value }))}
              className={inputClass}>
              {Object.values(INDUSTRY_PROFILES).map(industry => <option key={industry.key} value={industry.key}>{industry.label}</option>)}
            </select>
            {policy.mode !== 'mixed_industry' && <span className="mt-1.5 block text-[11px] font-normal text-[var(--text-muted)]">This plan uses the organization's primary industry.</span>}
          </label>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5">
            <p className="text-[11px] text-[var(--text-secondary)]">Estimated subscription after adding</p>
            <p className="mt-1 text-base font-semibold tabular-nums text-[var(--text-primary)]">
              {formatInr(addBranchQuote.totalMonthlyInr)} <span className="text-xs font-normal text-[var(--text-muted)]">/ month</span>
            </p>
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">Usage charges and taxes are additional.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm" icon={Plus} loading={busy} disabled={!branch.name.trim()}>
              Create workspace
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
