import React, { useEffect, useMemo, useState } from 'react';
import { Eye, Loader2, LockKeyhole, Share2, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuthorization } from '../lib/authorization';
import Widget from './ui/Widget';

interface Field { key: string; label: string }
interface ShareObject { id: string; key: string; label: string; fields: Field[] }
interface Workspace { workspaceId: string; orgId: string; workspace?: { id: string; name: string }; organization?: { name: string } }
interface Grant { id: string; sourceWorkspaceId: string; sourceWorkspaceName: string; targetWorkspaceId: string; targetWorkspaceName: string; objectKey: string; objectLabel: string; allowedFields: string[]; expiresAt: string | null; revokedAt: string | null; direction: 'incoming' | 'outgoing' }

export default function WorkspaceSharing({ enabled }: { enabled: boolean }) {
  const { can } = useAuthorization();
  const canManage = can('workspace.settings.manage');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [objects, setObjects] = useState<ShareObject[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [objectKey, setObjectKey] = useState('');
  const [targetWorkspaceId, setTargetWorkspaceId] = useState('');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [sharedRows, setSharedRows] = useState<Record<string, Record<string, unknown>[]>>({});
  const [sharedCursors, setSharedCursors] = useState<Record<string, string | null>>({});
  const activeWorkspaceId = sessionStorage.getItem('chiefx_active_workspace_id') || localStorage.getItem('chiefx_active_workspace_id') || '';
  const currentObject = objects.find(object => object.key === objectKey);
  const targets = useMemo(() => workspaces.filter(row => row.orgId === workspaces.find(item => item.workspaceId === activeWorkspaceId)?.orgId && row.workspaceId !== activeWorkspaceId), [workspaces, activeWorkspaceId]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiFetch('/api/auth/workspaces').then(async response => { if (!response.ok) throw new Error('Could not load workspaces'); return response.json(); }),
      apiFetch('/api/objects').then(async response => { if (!response.ok) throw new Error('Could not load shareable objects'); return response.json(); }),
      apiFetch('/api/workspace-sharing/grants').then(async response => { if (!response.ok) throw new Error('Could not load sharing grants'); return response.json(); }),
    ]).then(([workspaceRows, objectRows, grantRows]) => {
      if (cancelled) return;
      setWorkspaces(Array.isArray(workspaceRows) ? workspaceRows : []);
      setObjects(Array.isArray(objectRows) ? objectRows : []);
      setGrants(Array.isArray(grantRows) ? grantRows : []);
    }).catch(error => { if (!cancelled) setMessage(error.message || 'Could not load workspace sharing.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled]);

  useEffect(() => { setSelectedFields([]); }, [objectKey]);
  if (!enabled) return null;

  const createGrant = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();
      const response = await apiFetch('/api/workspace-sharing/grants', { method: 'POST', body: JSON.stringify({ targetWorkspaceId, objectKey, allowedFields: selectedFields, expiresAt }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not create sharing grant');
      setMessage('Read-only sharing grant created.');
      setGrants(await apiFetch('/api/workspace-sharing/grants').then(response => response.json()));
      setSelectedFields([]);
    } catch (error: any) { setMessage(error.message || 'Could not create sharing grant.'); }
    finally { setBusy(false); }
  };
  const revoke = async (grantId: string) => {
    setBusy(true); setMessage('');
    try {
      const response = await apiFetch(`/api/workspace-sharing/grants/${encodeURIComponent(grantId)}`, { method: 'DELETE' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not revoke sharing grant');
      setGrants(await apiFetch('/api/workspace-sharing/grants').then(response => response.json()));
      setMessage('Sharing grant revoked.');
    } catch (error: any) { setMessage(error.message || 'Could not revoke sharing grant.'); }
    finally { setBusy(false); }
  };
  const viewShared = async (grantId: string, cursor?: string | null) => {
    setBusy(true); setMessage('');
    try {
      const query = new URLSearchParams({ limit: '50' });
      if (cursor) query.set('cursor', cursor);
      const response = await apiFetch(`/api/workspace-sharing/records/${encodeURIComponent(grantId)}?${query}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not load shared records');
      setSharedRows(current => ({ ...current, [grantId]: cursor ? [...(current[grantId] || []), ...(body.records || [])] : (body.records || []) }));
      setSharedCursors(current => ({ ...current, [grantId]: body.nextCursor || null }));
    } catch (error: any) { setMessage(error.message || 'Could not load shared records.'); }
    finally { setBusy(false); }
  };

  return <Widget title="Workspace data sharing" subtitle="Share selected fields as read-only data with another workspace in this organization. Grants expire and can be revoked." icon={Share2} accent="#7c3aed" padding="md">
    {message && <p role="status" className="mb-4 rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-secondary)]">{message}</p>}
    {loading ? <div className="flex items-center gap-2 py-3 text-xs text-[var(--text-muted)]"><Loader2 className="h-4 w-4 animate-spin"/>Loading sharing settings…</div> : <>
      {canManage && <form onSubmit={createGrant} className="grid gap-3 border-b border-[var(--border)] pb-5 md:grid-cols-2">
        <label className="space-y-1 text-xs font-medium text-[var(--text-secondary)]">Target workspace
          <select required value={targetWorkspaceId} onChange={event => setTargetWorkspaceId(event.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-primary)]"><option value="">Choose workspace</option>{targets.map(row => <option key={row.workspaceId} value={row.workspaceId}>{row.workspace?.name || row.workspaceId}</option>)}</select>
        </label>
        <label className="space-y-1 text-xs font-medium text-[var(--text-secondary)]">Object
          <select required value={objectKey} onChange={event => setObjectKey(event.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-primary)]"><option value="">Choose object</option>{objects.map(object => <option key={object.id} value={object.key}>{object.label}</option>)}</select>
        </label>
        {!!currentObject?.fields.length && <fieldset className="md:col-span-2"><legend className="mb-2 text-xs font-medium text-[var(--text-secondary)]">Fields visible in the target workspace</legend><div className="flex flex-wrap gap-2">{currentObject.fields.map(field => <label key={field.key} className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-secondary)]"><input type="checkbox" checked={selectedFields.includes(field.key)} onChange={event => setSelectedFields(current => event.target.checked ? [...current,field.key] : current.filter(key => key!==field.key))}/>{field.label}</label>)}</div></fieldset>}
        <label className="space-y-1 text-xs font-medium text-[var(--text-secondary)]">Expires in (days)<input type="number" min={1} max={365} required value={expiresInDays} onChange={event => setExpiresInDays(Number(event.target.value))} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-primary)]"/></label>
        <div className="flex items-end"><button type="submit" disabled={busy || !targetWorkspaceId || !objectKey || !selectedFields.length} className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><LockKeyhole className="h-3.5 w-3.5"/>Grant read access</button></div>
      </form>}
      <div className="mt-4 space-y-3">{grants.map(grant => <div key={grant.id} className="rounded-lg border border-[var(--border)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold text-[var(--text-primary)]">{grant.direction === 'outgoing' ? `Shared with ${grant.targetWorkspaceName}` : `Shared by ${grant.sourceWorkspaceName}`} · {grant.objectLabel}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">Fields: {grant.allowedFields.join(', ')} · {grant.revokedAt ? 'Revoked' : Date.parse(grant.expiresAt || '') <= Date.now() ? 'Expired' : `Expires ${new Date(grant.expiresAt || '').toLocaleDateString()}`}</p></div><div className="flex gap-2">{grant.direction === 'incoming' && !grant.revokedAt && Date.parse(grant.expiresAt || '') > Date.now() && <button onClick={() => void viewShared(grant.id)} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-secondary)]"><Eye className="h-3 w-3"/>View records</button>}{grant.direction === 'outgoing' && !grant.revokedAt && canManage && <button onClick={() => void revoke(grant.id)} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-[11px] text-rose-600"><X className="h-3 w-3"/>Revoke</button>}</div></div>
        {sharedRows[grant.id] && <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-[11px]"><thead><tr>{grant.allowedFields.map(field => <th key={field} className="px-2 py-1 font-semibold">{field}</th>)}</tr></thead><tbody>{sharedRows[grant.id].map((row,index)=><tr key={index} className="border-t border-[var(--border)]">{grant.allowedFields.map(field=><td key={field} className="max-w-48 truncate px-2 py-1">{String((row.data as any)?.[field] ?? '')}</td>)}</tr>)}</tbody></table>{sharedCursors[grant.id] && <button onClick={() => void viewShared(grant.id,sharedCursors[grant.id])} disabled={busy} className="mt-2 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-secondary)]">Load more</button>}</div>}
      </div>)}{!grants.length && <p className="text-xs text-[var(--text-muted)]">No incoming or outgoing shares for this workspace.</p>}</div>
    </>}
  </Widget>;
}
