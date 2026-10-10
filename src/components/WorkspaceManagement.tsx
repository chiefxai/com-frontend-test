import React, { useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuthorization } from '../lib/authorization';
import Widget from './ui/Widget';
import DataTable, { Column } from './ui/DataTable';
import FilterBar from './ui/FilterBar';
import Modal from './ui/Modal';
import IconButton from './ui/IconButton';

interface WorkspaceSetup { policy: {mode:string;primaryIndustry:string;pricing?:{includedWorkspaces:number;maxWorkspaces:number|null}}; currentQuote: {totalMonthlyInr:number} | null; addBranchQuote: {totalMonthlyInr:number;upgradesToMultipleBranches:boolean;token:string} | null }
interface WorkspaceRow { id: string; name: string; industry: string; branchName?: string | null; status: string }

export default function WorkspaceManagement({
  enabled,
  onWorkspaceCreated,
  onSelectWorkspace,
  memberCounts = {},
  numberCounts = {},
  numberCountsAvailable = false,
}: {
  enabled: boolean;
  onWorkspaceCreated: () => Promise<void>;
  onSelectWorkspace?: (workspace: { id: string; name: string; status: string; industry: string; branchName?: string | null }) => void;
  memberCounts?: Record<string, number>;
  numberCounts?: Record<string, number>;
  numberCountsAvailable?: boolean;
}) {
  const { can } = useAuthorization();
  const canManage = can('organization.manage');
  const canRead = can('organization.read');
  const [search, setSearch] = useState('');
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [setup, setSetup] = useState<WorkspaceSetup | null>(null);
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [branchName, setBranchName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!enabled || !canRead) return;
    let cancelled = false;
    Promise.all([
      apiFetch('/api/settings/workspaces').then(async response => {
        const body = await response.json().catch(() => []);
        if (!response.ok) throw new Error(body.error || 'Could not load workspaces');
        return body as WorkspaceRow[];
      }),
      apiFetch('/api/settings/workspace-policy').then(async response => {
        const body=await response.json();
        if (!response.ok) throw new Error(body.error || 'Could not load workspace policy');
        return body as WorkspaceSetup;
      }),
    ]).then(([rows, options]) => {
      if (cancelled) return;
      setWorkspaces(Array.isArray(rows) ? rows : []);
      setSetup(options);
      setIndustry(options.policy.primaryIndustry);
    }).catch(error => {
      if (!cancelled) setMessage({ type: 'error', text: error.message || 'Could not load workspace setup.' });
    }).finally(() => { if (!cancelled) setLoading(false); });
    setLoading(true);
    return () => { cancelled = true; };
  }, [enabled, canRead]);

  if (!enabled || !canRead) return null;

  const createWorkspace = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!setup?.addBranchQuote) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await apiFetch('/api/settings/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), industry, branchName: branchName.trim() || null, pricingAcceptanceToken:setup.addBranchQuote.token }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not create workspace');
      setWorkspaces(current => [...current, body as WorkspaceRow]);
      setName('');
      setBranchName('');
      setShowCreateWorkspace(false);
      setMessage({ type: 'success', text: 'Workspace created and assigned to you as Workspace Admin.' });
      // A secondary refresh failure must never make a successful create look
      // unsuccessful (or encourage a duplicate workspace submission).
      try {
        const policyResponse = await apiFetch('/api/settings/workspace-policy');
        if (policyResponse.ok) setSetup(await policyResponse.json());
        await onWorkspaceCreated();
      } catch {
        setMessage({ type: 'success', text: 'Workspace created. Refresh the page if related workspace data has not updated yet.' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Could not create workspace.' });
      const refreshed=await apiFetch('/api/settings/workspace-policy').catch(()=>null);
      if(refreshed?.ok) { const value=await refreshed.json(); setSetup(value); setWorkspaces(value.workspaces); }
    } finally {
      setSaving(false);
    }
  };

  const filteredWorkspaces = workspaces.filter(workspace =>
    !search.trim() || `${workspace.name} ${workspace.branchName || ''} ${workspace.industry}`
      .toLowerCase().includes(search.toLowerCase().trim()));

  return (
    <Widget showHeader={false} padding="none">
      {message && <div role="status" className={`m-4 rounded-lg border px-3 py-2 text-xs ${message.type === 'success'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-rose-200 bg-rose-50 text-rose-700'}`}>{message.text}</div>}
      <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <FilterBar
          search={{ value: search, onChange: setSearch, placeholder: 'Search workspace or branch' }}
          hasActiveFilters={Boolean(search.trim())}
          onClear={() => setSearch('')}
          resultCount={{ filtered: filteredWorkspaces.length, total: workspaces.length, label: 'workspaces' }}
          actions={canManage
            ? <IconButton icon={Plus} label="Create Workspace" onClick={() => setShowCreateWorkspace(true)} />
            : undefined}
        />
      </div>
      <DataTable
        bare
        paginated
        resizable
        loading={loading}
        emptyMessage={workspaces.length ? 'No workspaces match this search.' : 'No workspaces available.'}
        columns={[
          { key: 'workspace', header: 'Workspace', cell: (workspace: WorkspaceRow) =>
            <button type="button" onClick={() => onSelectWorkspace?.(workspace)}
              className="text-left font-semibold text-[var(--accent)] hover:underline"
              aria-label={`View workspace ${workspace.name}`}>{workspace.name}</button> },
          { key: 'branch', header: 'Branch / Industry', cell: (workspace: WorkspaceRow) =>
            <span className="text-xs text-[var(--text-secondary)]">{workspace.branchName || workspace.industry.replaceAll('_', ' ')}</span> },
          { key: 'members', header: 'Members', cell: (workspace: WorkspaceRow) =>
            <span className="text-xs text-[var(--text-secondary)]">{memberCounts[workspace.id] ?? '—'}</span> },
          { key: 'numbers', header: 'Phone Numbers', cell: (workspace: WorkspaceRow) =>
            <span className="text-xs text-[var(--text-secondary)]">{numberCountsAvailable ? (numberCounts[workspace.id] ?? 0) : '—'}</span> },
          { key: 'status', header: 'Status', cell: (workspace: WorkspaceRow) =>
            <span className="text-xs text-[var(--text-secondary)]">{workspace.status}</span> },
        ] as Column<WorkspaceRow>[]}
        rows={filteredWorkspaces}
        rowKey={workspace => workspace.id}
      />
      {canManage && <Modal
        open={showCreateWorkspace}
        onClose={() => { if (!saving) setShowCreateWorkspace(false); }}
        title="Create Workspace"
        subtitle="Create a workspace within the limit included in the organization subscription."
        maxWidth="max-w-lg"
      >
        <form onSubmit={createWorkspace} className="space-y-4">
          <label className="block space-y-1 text-xs font-medium text-[var(--text-secondary)]">
            <span>Workspace name</span>
            <input required maxLength={120} autoFocus value={name} onChange={event => setName(event.target.value)}
              placeholder="Sales - Mumbai"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2.5 text-xs text-[var(--text-primary)]" />
          </label>
          <label className="block space-y-1 text-xs font-medium text-[var(--text-secondary)]">
            <span>Industry</span>
            <input readOnly value={industry.replaceAll('_', ' ')}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5 text-xs text-[var(--text-primary)]" />
          </label>
          <label className="block space-y-1 text-xs font-medium text-[var(--text-secondary)]">
            <span>Branch (optional)</span>
            <input maxLength={160} value={branchName} onChange={event => setBranchName(event.target.value)}
              placeholder="Mumbai"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2.5 text-xs text-[var(--text-primary)]" />
          </label>
          <p className="text-xs text-[var(--text-muted)]">Different industries are provisioned by a platform administrator.</p>
          {setup?.addBranchQuote
            ? <p className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-xs text-[var(--text-secondary)]">
                Workspace {workspaces.length + 1}: {workspaces.length + 1 <= (setup.policy.pricing?.includedWorkspaces ?? 1) ? 'within the included allowance' : 'priced as a workspace add-on'}. Monthly organization price after creation: ₹{setup.addBranchQuote.totalMonthlyInr.toFixed(2)}. Usage charges and applicable taxes are additional.
              </p>
            : <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                {setup?.policy.pricing && setup.policy.pricing.maxWorkspaces !== null && workspaces.length >= setup.policy.pricing.maxWorkspaces
                  ? `This subscription allows up to ${setup.policy.pricing.maxWorkspaces} workspace${setup.policy.pricing.maxWorkspaces === 1 ? '' : 's'}. Upgrade the subscription to add another workspace.`
                  : 'Ask a platform administrator to configure branch pricing before adding another workspace.'}
              </p>}
          <div className="flex items-center justify-end gap-3 border-t border-[var(--border)] pt-4">
            <button type="button" disabled={saving} onClick={() => setShowCreateWorkspace(false)}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={saving || loading || !setup?.addBranchQuote || !name.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {saving ? 'Creating…' : 'Create Workspace'}
            </button>
          </div>
        </form>
      </Modal>}
    </Widget>
  );
}
