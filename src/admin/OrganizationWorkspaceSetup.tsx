import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { INDUSTRY_PROFILES } from '../lib/industry/registry';
import type { WorkspacePolicyDraft } from '../lib/workspacePolicy';

type Setup = {
  policy: WorkspacePolicyDraft & { primaryIndustry: string; planId?: string | null };
  workspaces: { id: string; name: string; industry: string }[];
  currentQuote: { totalMonthlyInr: number; seatCount: number } | null;
  addBranchQuote: { totalMonthlyInr: number } | null;
};

export default function OrganizationWorkspaceSetup({ orgId }: { orgId: string }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [branch, setBranch] = useState({ name: '', industry: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    const response = await apiFetch(`/api/platform/organizations/${orgId}/workspace-setup`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Could not load organization workspaces.');
    setSetup(body);
    setBranch(current => ({ ...current, industry: body.policy.primaryIndustry }));
  }, [orgId]);
  useEffect(() => { load().catch(error => setMessage(error.message)); }, [load]);

  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const response = await apiFetch(`/api/platform/organizations/${orgId}/workspaces`, {
        method: 'POST', body: JSON.stringify(branch),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not create workspace.');
      setBranch(current => ({ ...current, name: '' }));
      await load();
      setMessage('Workspace created and assigned to an organization administrator.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create workspace.'); }
    finally { setBusy(false); }
  }

  if (!setup) return <p className="text-xs text-[var(--text-secondary)]">{message || 'Loading workspace setup…'}</p>;
  const { policy } = setup;
  const max = policy.pricing?.maxWorkspaces ?? null;
  const atLimit = policy.mode === 'single' || (max !== null && setup.workspaces.length >= max);
  const estimate = setup.addBranchQuote?.totalMonthlyInr;
  return <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
    <h4 className="text-sm font-semibold text-[var(--text-primary)]">Subscription workspaces</h4>
    <p className="text-xs text-[var(--text-secondary)]">
      Plan: {policy.planId || 'Legacy'} · Primary industry: {policy.primaryIndustry.replaceAll('_', ' ')} ·
      Included workspaces: {policy.pricing?.includedWorkspaces ?? 1} ·
      Monthly price per extra workspace: ₹{policy.pricing?.extraWorkspaceMonthlyInr ?? 0}
    </p>
    <ul className="space-y-1 text-xs text-[var(--text-secondary)]">
      {setup.workspaces.map(workspace => <li key={workspace.id}>{workspace.name} · {workspace.industry.replaceAll('_', ' ')}</li>)}
    </ul>
    {setup.currentQuote && <p className="text-xs text-[var(--text-secondary)]">
      Current estimate: ₹{setup.currentQuote.totalMonthlyInr.toFixed(2)} / month with {setup.currentQuote.seatCount} active seats, plus usage and applicable taxes.
    </p>}
    {message && <p role="status" className="text-xs text-amber-600">{message}</p>}
    <form onSubmit={create} className="space-y-3 border-t border-[var(--border)] pt-4">
      <input required maxLength={120} value={branch.name} placeholder="New workspace / branch name"
        onChange={event => setBranch(current => ({ ...current, name: event.target.value }))}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)]" />
      <select aria-label="New workspace industry" value={policy.mode === 'mixed_industry' ? branch.industry : policy.primaryIndustry}
        disabled={policy.mode !== 'mixed_industry'} onChange={event => setBranch(current => ({ ...current, industry: event.target.value }))}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)]">
        {Object.values(INDUSTRY_PROFILES).map(industry => <option key={industry.key} value={industry.key}>{industry.label}</option>)}
      </select>
      {atLimit ? <p className="text-xs text-amber-600">This subscription has reached its workspace limit.</p>
        : estimate !== undefined && <p className="text-xs text-[var(--text-secondary)]">Estimate after adding: ₹{estimate.toFixed(2)} / month, plus usage and applicable taxes.</p>}
      <button disabled={busy || !setup.currentQuote || atLimit} className="rounded-lg bg-cyan-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Create workspace</button>
    </form>
  </section>;
}
