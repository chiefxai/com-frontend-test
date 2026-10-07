import React, { useEffect, useState } from 'react';
import { Building2, Loader2, Plus } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuthorization } from '../lib/authorization';
import Widget from './ui/Widget';

interface IndustryOption { key: string; label: string }
interface WorkspaceRow { id: string; name: string; industry: string; branchName?: string | null; status: string }

export default function WorkspaceManagement({
  enabled,
  onWorkspaceCreated,
}: {
  enabled: boolean;
  onWorkspaceCreated: () => Promise<void>;
}) {
  const { can } = useAuthorization();
  const canManage = can('organization.manage');
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [industries, setIndustries] = useState<IndustryOption[]>([]);
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [branchName, setBranchName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!enabled || !canManage) return;
    let cancelled = false;
    Promise.all([
      apiFetch('/api/settings/workspaces').then(async response => {
        const body = await response.json().catch(() => []);
        if (!response.ok) throw new Error(body.error || 'Could not load workspaces');
        return body as WorkspaceRow[];
      }),
      apiFetch('/api/auth/industries').then(async response => {
        if (!response.ok) throw new Error('Could not load industries');
        return response.json() as Promise<IndustryOption[]>;
      }),
    ]).then(([rows, options]) => {
      if (cancelled) return;
      setWorkspaces(Array.isArray(rows) ? rows : []);
      setIndustries(Array.isArray(options) ? options : []);
      setIndustry(current => current || options[0]?.key || '');
    }).catch(error => {
      if (!cancelled) setMessage({ type: 'error', text: error.message || 'Could not load workspace setup.' });
    }).finally(() => { if (!cancelled) setLoading(false); });
    setLoading(true);
    return () => { cancelled = true; };
  }, [enabled, canManage]);

  if (!enabled || !canManage) return null;

  const createWorkspace = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await apiFetch('/api/settings/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), industry, branchName: branchName.trim() || null }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not create workspace');
      setWorkspaces(current => [...current, body as WorkspaceRow]);
      setName('');
      setBranchName('');
      setMessage({ type: 'success', text: 'Workspace created and assigned to you as Workspace Admin.' });
      await onWorkspaceCreated();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Could not create workspace.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Widget title="Organization Workspaces" subtitle="Create separate workspaces for teams, industries, or branches. Data stays isolated by workspace." icon={Building2} accent="#0891b2" padding="md">
      {message && <div role="status" className={`mb-4 rounded-lg border px-3 py-2 text-xs ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>{message.text}</div>}
      <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {workspaces.map(workspace => (
          <div key={workspace.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2.5">
            <p className="truncate text-xs font-semibold text-[var(--text-primary)]">{workspace.name}{workspace.status !== 'Active' ? ' · Inactive' : ''}</p>
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">{workspace.branchName ? `${workspace.branchName} · ` : ''}{workspace.industry.replaceAll('_', ' ')}</p>
          </div>
        ))}
        {!loading && workspaces.length === 0 && <p className="text-xs text-[var(--text-muted)]">No workspaces available.</p>}
      </div>
      <form onSubmit={createWorkspace} className="grid gap-3 border-t border-[var(--border)] pt-4 md:grid-cols-3">
        <label className="space-y-1 text-xs font-medium text-[var(--text-secondary)]">
          Workspace name
          <input required maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="Sales - Mumbai" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-primary)]" />
        </label>
        <label className="space-y-1 text-xs font-medium text-[var(--text-secondary)]">
          Industry
          <select required value={industry} onChange={event => setIndustry(event.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-primary)]">
            {industries.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-[var(--text-secondary)]">
          Branch (optional)
          <input maxLength={160} value={branchName} onChange={event => setBranchName(event.target.value)} placeholder="Mumbai" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-primary)]" />
        </label>
        <div className="md:col-span-3">
          <button type="submit" disabled={saving || loading || !industries.length || !name.trim()} className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Create workspace
          </button>
        </div>
      </form>
    </Widget>
  );
}
