import React, { useEffect, useMemo, useState } from 'react';
import { Check, Eye, Loader2, LockKeyhole, Pencil, Share2, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuthorization } from '../lib/authorization';
import Widget from './ui/Widget';

interface Field { key: string; label: string }
interface ShareObject { id: string; key: string; label: string; fields: Field[] }
interface Workspace { workspaceId: string; orgId: string; workspace?: { id: string; name: string }; organization?: { name: string } }
interface Grant { id: string; sourceWorkspaceId: string; sourceWorkspaceName: string; targetWorkspaceId: string; targetWorkspaceName: string; objectKey: string; objectLabel: string; allowedFields: string[]; expiresAt: string | null; revokedAt: string | null; direction: 'incoming' | 'outgoing' }
interface Proposal { id: string; objectLabel: string; recordId: string; patch: Record<string, unknown>; previousData: Record<string, unknown> | null; status: string; proposerName: string | null; targetWorkspaceName: string; createdAt: string }

export default function WorkspaceSharing({ enabled }: { enabled: boolean }) {
  const { can,authorization } = useAuthorization();
  const canManage = authorization?.workspaceRole === 'Workspace Admin';
  const canPropose = Boolean(authorization?.workspaceRole && authorization.workspaceRole !== 'Viewer' && can('workspace.share.propose'));
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [objects, setObjects] = useState<ShareObject[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [objectKey, setObjectKey] = useState('');
  const [targetWorkspaceId, setTargetWorkspaceId] = useState('');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [sharedRows, setSharedRows] = useState<Record<string, Record<string, unknown>[]>>({});
  const [sharedCursors, setSharedCursors] = useState<Record<string, string | null>>({});
  const [editingRecordRef, setEditingRecordRef] = useState<string | null>(null);
  const [proposalDrafts, setProposalDrafts] = useState<Record<string, Record<string, unknown>>>({});
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
      canManage ? apiFetch('/api/workspace-sharing/proposals').then(async response => { if (!response.ok) throw new Error('Could not load edit proposals'); return response.json(); }) : Promise.resolve([]),
    ]).then(([workspaceRows, objectRows, grantRows, proposalRows]) => {
      if (cancelled) return;
      setWorkspaces(Array.isArray(workspaceRows) ? workspaceRows : []);
      setObjects(Array.isArray(objectRows) ? objectRows : []);
      setGrants(Array.isArray(grantRows) ? grantRows : []);
      setProposals(Array.isArray(proposalRows) ? proposalRows : []);
    }).catch(error => { if (!cancelled) setMessage(error.message || 'Could not load workspace sharing.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, canManage]);

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
  const submitProposal = async (grant: Grant, row: Record<string, any>) => {
    const recordRef=String(row.recordRef||'');
    const values=proposalDrafts[recordRef]||{};
    const patch=Object.fromEntries(grant.allowedFields.filter(field=>String(values[field]??'')!==String(row.data?.[field]??'')).map(field=>[field,values[field]]));
    if (!recordRef || !Object.keys(patch).length) { setMessage('Change at least one shared field before submitting.'); return; }
    setBusy(true); setMessage('');
    try {
      const response=await apiFetch(`/api/workspace-sharing/records/${encodeURIComponent(grant.id)}/proposals`,{method:'POST',body:JSON.stringify({recordRef,patch})});
      const body=await response.json().catch(()=>({}));
      if (!response.ok) throw new Error(body.error||'Could not submit edit proposal');
      setEditingRecordRef(null); setMessage('Edit proposal sent to the source Workspace Admin for review.');
    } catch(error:any) { setMessage(error.message||'Could not submit edit proposal.'); }
    finally { setBusy(false); }
  };
  const reviewProposal = async (proposalId:string,decision:'approved'|'rejected') => {
    setBusy(true); setMessage('');
    try {
      const response=await apiFetch(`/api/workspace-sharing/proposals/${encodeURIComponent(proposalId)}/review`,{method:'POST',body:JSON.stringify({decision})});
      const body=await response.json().catch(()=>({}));
      if (!response.ok && !['stale','share_inactive'].includes(body.status)) throw new Error(body.error||'Could not review proposal');
      setProposals(await apiFetch('/api/workspace-sharing/proposals').then(response=>response.json()));
      setMessage(body.status==='stale'?'Proposal closed because its source record changed.':body.status==='share_inactive'?'Proposal closed because its sharing grant is no longer active.':`Proposal ${body.status}.`);
    } catch(error:any) { setMessage(error.message||'Could not review proposal.'); }
    finally { setBusy(false); }
  };

  return <Widget title="Workspace data sharing" subtitle="Share selected fields with another workspace. Changes are proposed for source-admin review; the original record is never edited directly." icon={Share2} accent="#7c3aed" padding="md">
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
        {sharedRows[grant.id] && <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-[11px]"><thead><tr>{grant.allowedFields.map(field => <th key={field} className="px-2 py-1 font-semibold">{field}</th>)}{canPropose&&<th className="px-2 py-1">Actions</th>}</tr></thead><tbody>{sharedRows[grant.id].map((row,index)=>{const ref=String(row.recordRef||'');const editing=editingRecordRef===ref;return <tr key={ref||index} className="border-t border-[var(--border)]">{grant.allowedFields.map(field=><td key={field} className="max-w-48 truncate px-2 py-1">{editing?<input aria-label={`Proposed ${field}`} value={String(proposalDrafts[ref]?.[field]??'')} onChange={event=>setProposalDrafts(current=>({...current,[ref]:{...(current[ref]||row.data),[field]:event.target.value}}))} className="w-full rounded border border-[var(--border)] bg-[var(--bg-base)] px-2 py-1"/>:String((row.data as any)?.[field]??'')}</td>)}{canPropose&&<td className="whitespace-nowrap px-2 py-1">{editing?<><button onClick={()=>void submitProposal(grant,row)} disabled={busy} className="mr-1 inline-flex items-center gap-1 rounded border border-emerald-200 px-2 py-1 text-emerald-700"><Check className="h-3 w-3"/>Send</button><button onClick={()=>setEditingRecordRef(null)} className="rounded border border-[var(--border)] px-2 py-1">Cancel</button></>:<button onClick={()=>{setEditingRecordRef(ref);setProposalDrafts(current=>({...current,[ref]:{...(row.data||{})}}));}} className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-2 py-1 text-[var(--text-secondary)]"><Pencil className="h-3 w-3"/>Propose edit</button>}</td>}</tr>})}</tbody></table>{sharedCursors[grant.id] && <button onClick={() => void viewShared(grant.id,sharedCursors[grant.id])} disabled={busy} className="mt-2 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-secondary)]">Load more</button>}</div>}
      </div>)}{!grants.length && <p className="text-xs text-[var(--text-muted)]">No incoming or outgoing shares for this workspace.</p>}</div>
      {canManage && <div className="mt-5 border-t border-[var(--border)] pt-4"><h3 className="mb-3 text-xs font-semibold text-[var(--text-primary)]">Edit proposals for this workspace</h3>{proposals.map(proposal=><div key={proposal.id} className="mb-2 rounded-lg border border-[var(--border)] p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[var(--text-primary)]">{proposal.objectLabel} · {proposal.targetWorkspaceName}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">{proposal.proposerName||'Workspace member'} · {new Date(proposal.createdAt).toLocaleString()} · {proposal.status}</p><p className="mt-2 text-[11px] text-[var(--text-secondary)]">{Object.entries(proposal.patch).map(([key,value])=>`${key}: ${String(value)}`).join(' · ')}</p></div>{proposal.status==='pending'&&<div className="flex gap-2"><button onClick={()=>void reviewProposal(proposal.id,'approved')} disabled={busy} className="rounded-md bg-emerald-700 px-2.5 py-1.5 text-[11px] font-semibold text-white">Approve</button><button onClick={()=>void reviewProposal(proposal.id,'rejected')} disabled={busy} className="rounded-md border border-rose-200 px-2.5 py-1.5 text-[11px] text-rose-600">Reject</button></div>}</div></div>)}{!proposals.length&&<p className="text-xs text-[var(--text-muted)]">No edit proposals yet.</p>}</div>}
    </>}
  </Widget>;
}
