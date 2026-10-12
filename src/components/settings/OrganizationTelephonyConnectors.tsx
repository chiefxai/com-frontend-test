import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { Card, CardHeader } from '../ui/Card';
import Button from '../ui/Button';

type CredentialField = { key: string; label: string; type: string; required: boolean; placeholder?: string };
type Provider = { providerKey: string; name: string; label: string; credentialSchema: CredentialField[] };
type Connector = { id: string; providerKey: string; displayName: string; providerAccountId: string | null; credentialFieldsConfigured: boolean; status: string };
type InventoryNumber = { id: string; phoneNumberE164: string; displayName: string | null; inventoryStatus: string; provisioningStatus?: string; ownerType?: string; connectorAccountId?: string; connectorDisplayName?: string; providerKey?: string; assignedWorkspaceId?: string | null; assignedWorkspaceName?: string | null };
type Workspace = { id: string; name: string };
type Draft = { providerKey: string; displayName: string; providerAccountId: string; credentials: Record<string, string> };
const emptyDraft = (providerKey = ''): Draft => ({ providerKey, displayName: '', providerAccountId: '', credentials: {} });
const inputClass = 'mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 text-sm';

async function responseBody(response: Response) {
  return response.json().catch(() => ({} as Record<string, unknown>));
}

export default function OrganizationTelephonyConnectors() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [numbers, setNumbers] = useState<Record<string, InventoryNumber[]>>({});
  const [workspaceChoices, setWorkspaceChoices] = useState<Workspace[]>([]);
  const [assignmentDraft, setAssignmentDraft] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [editing, setEditing] = useState<string | null>(null);
  const [numberDraft, setNumberDraft] = useState<Record<string, { phoneNumberE164: string; providerNumberId: string; displayName: string }>>({});
  const [loading, setLoading] = useState(true);
  const [featureOff, setFeatureOff] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [providerResponse, connectorResponse, workspaceResponse, inventoryResponse] = await Promise.all([
        apiFetch('/api/telephony/providers'), apiFetch('/api/telephony/connectors'),
        apiFetch('/api/telephony/workspaces'), apiFetch('/api/telephony/numbers'),
      ]);
      if (providerResponse.status === 404 || connectorResponse.status === 404) { setFeatureOff(true); return; }
      const [providerBody, connectorBody] = await Promise.all([responseBody(providerResponse), responseBody(connectorResponse)]);
      if (!providerResponse.ok || !connectorResponse.ok) throw new Error(String(providerBody.error || connectorBody.error || 'Unable to load connector accounts.'));
      const nextProviders = Array.isArray(providerBody.providers) ? providerBody.providers as Provider[] : [];
      setProviders(nextProviders);
      setConnectors(Array.isArray(connectorBody.connectors) ? connectorBody.connectors as Connector[] : []);
      if (workspaceResponse.ok) {
        const workspaces = await responseBody(workspaceResponse);
        setWorkspaceChoices(Array.isArray(workspaces.workspaces) ? workspaces.workspaces as Workspace[] : []);
      }
      if (inventoryResponse.ok) {
        const inventory = await responseBody(inventoryResponse);
        const all = Array.isArray(inventory.numbers) ? inventory.numbers as InventoryNumber[] : [];
        setNumbers(Object.fromEntries(all.reduce((groups, number) => {
          const key = number.connectorAccountId || number.connectorDisplayName || 'allocated-platform';
          groups.set(key, [...(groups.get(key) || []), number]); return groups;
        }, new Map<string, InventoryNumber[]>())));
      }
      setDraft(current => current.providerKey || !nextProviders.length ? current : emptyDraft(nextProviders[0].providerKey));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load connector accounts.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const selectedProvider = useMemo(() => providers.find(provider => provider.providerKey === draft.providerKey), [providers, draft.providerKey]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy || !selectedProvider) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const payload: Record<string, unknown> = { displayName: draft.displayName.trim(), providerAccountId: draft.providerAccountId.trim() || null };
      if (!editing) payload.providerKey = draft.providerKey;
      if (Object.values(draft.credentials).some(Boolean)) payload.credentials = draft.credentials;
      const response = await apiFetch(editing ? `/api/telephony/connectors/${encodeURIComponent(editing)}` : '/api/telephony/connectors', {
        method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const body = await responseBody(response);
      if (response.status === 404) { setFeatureOff(true); return; }
      if (!response.ok) throw new Error(String(body.error || 'Unable to save connector.'));
      setDraft(emptyDraft(providers[0]?.providerKey || '')); setEditing(null); setNotice(editing ? 'Connector updated.' : 'Connector account saved.'); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save connector.'); }
    finally { setBusy(false); }
  };

  const loadNumbers = async (id: string) => {
    setError('');
    try {
      const response = await apiFetch(`/api/telephony/connectors/${encodeURIComponent(id)}/numbers`);
      const body = await responseBody(response);
      if (response.status === 404) { setFeatureOff(true); return; }
      if (!response.ok) throw new Error(String(body.error || 'Unable to load provider numbers.'));
      setNumbers(current => ({ ...current, [id]: Array.isArray(body.numbers) ? body.numbers as InventoryNumber[] : [] }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load provider numbers.'); }
  };

  const registerNumber = async (event: React.FormEvent, connector: Connector) => {
    event.preventDefault(); const item = numberDraft[connector.id] || { phoneNumberE164: '', providerNumberId: '', displayName: '' };
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await apiFetch(`/api/telephony/connectors/${encodeURIComponent(connector.id)}/numbers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumberE164: item.phoneNumberE164.trim(), providerNumberId: item.providerNumberId.trim() || null, displayName: item.displayName.trim() || null }),
      });
      const body = await responseBody(response);
      if (response.status === 404) { setFeatureOff(true); return; }
      if (!response.ok) throw new Error(String(body.error || 'Unable to register provider number.'));
      setNumberDraft(current => ({ ...current, [connector.id]: { phoneNumberE164: '', providerNumberId: '', displayName: '' } }));
      setNotice('Provider number saved to inventory. Live calling is not enabled by this record.'); await loadNumbers(connector.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to register provider number.'); }
    finally { setBusy(false); }
  };

  const markNumberReady = async (number: InventoryNumber) => {
    if (!window.confirm(`Confirm ${number.phoneNumberE164} is active in your provider account. This verification enables assignment and supported outbound routing.`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await apiFetch(`/api/telephony/numbers/${encodeURIComponent(number.id)}/mark-ready`, { method: 'POST' });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(String(body.error || 'Unable to verify number.'));
      setNotice('Number verified and ready for assignment.');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to verify number.'); }
    finally { setBusy(false); }
  };

  const assignNumber = async (number: InventoryNumber) => {
    const workspaceId = assignmentDraft[number.id];
    if (!workspaceId) { setError('Choose a workspace for this number.'); return; }
    if (number.assignedWorkspaceId === workspaceId) { setNotice('This number is already assigned to that workspace.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      if (number.assignedWorkspaceId) {
        const releaseResponse = await apiFetch(`/api/telephony/numbers/${encodeURIComponent(number.id)}/release`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId: number.assignedWorkspaceId }),
        });
        const releaseBody = await responseBody(releaseResponse);
        if (!releaseResponse.ok) throw new Error(String(releaseBody.error || 'Unable to release the current workspace assignment.'));
      }
      const response = await apiFetch(`/api/telephony/numbers/${encodeURIComponent(number.id)}/assign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId }),
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(String(body.error || 'Unable to assign number to this workspace.'));
      setNotice(`Number assigned to ${workspaceChoices.find(item => item.id === workspaceId)?.name || 'workspace'}.`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to assign number.'); }
    finally { setBusy(false); }
  };

  const releaseNumber = async (number: InventoryNumber) => {
    if (!number.assignedWorkspaceId) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await apiFetch(`/api/telephony/numbers/${encodeURIComponent(number.id)}/release`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId: number.assignedWorkspaceId }),
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(String(body.error || 'Unable to unassign number.'));
      setNotice(`Number unassigned from ${number.assignedWorkspaceName || 'workspace'}; it remains available to your organization.`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to unassign number.'); }
    finally { setBusy(false); }
  };

  if (loading) return <Card><p className="text-sm text-[var(--text-muted)]">Loading customer telephony connectors…</p></Card>;
  if (featureOff) return <Card><CardHeader title="Customer-owned provider accounts" subtitle="Manage multiple accounts for each telephony provider." /><p className="text-sm text-[var(--text-muted)]">This feature is not enabled. The existing Vobiz connection and number setup remain available above.</p></Card>;

  return <Card>
    <CardHeader title="Telephony connectors" subtitle="Manage provider accounts and assign their numbers to your workspaces." />
    <p className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-sm text-[var(--text-secondary)]">Saved credentials stay protected. Add a provider account first, then add numbers when you are ready. Each number can be assigned to one of your workspaces.</p>
    {error && <p role="alert" className="mb-3 text-sm text-rose-600">{error}</p>}{notice && <p role="status" className="mb-3 text-sm text-emerald-700">{notice}</p>}
    <form onSubmit={event => void save(event)} className="grid gap-3 md:grid-cols-2">
      {!editing && <label className="text-sm">Provider<select className={inputClass} value={draft.providerKey} onChange={event => setDraft(current => ({ ...current, providerKey: event.target.value, credentials: {} }))} required>
        {providers.map(provider => <option key={provider.providerKey} value={provider.providerKey}>{provider.label || provider.name}</option>)}
      </select></label>}
      <label className="text-sm">Connector name<input className={inputClass} value={draft.displayName} onChange={event => setDraft(current => ({ ...current, displayName: event.target.value }))} maxLength={191} required placeholder="e.g. Mumbai support account" /></label>
      <label className="text-sm">Provider account reference (optional)<input className={inputClass} value={draft.providerAccountId} onChange={event => setDraft(current => ({ ...current, providerAccountId: event.target.value }))} maxLength={191} /></label>
      {selectedProvider?.credentialSchema.map(field => <label key={field.key} className="text-sm">{field.label}{field.required && !editing ? ' *' : ''}<input className={inputClass} type={field.type === 'secret' || field.type === 'password' ? 'password' : 'text'} autoComplete="new-password" value={draft.credentials[field.key] || ''} onChange={event => setDraft(current => ({ ...current, credentials: { ...current.credentials, [field.key]: event.target.value } }))} required={!editing && field.required} placeholder={editing ? 'Leave blank to keep current value' : field.placeholder || ''} /></label>)}
      <div className="flex items-end gap-2"><Button type="submit" loading={busy}>{editing ? 'Save account' : 'Add account'}</Button>{editing && <Button type="button" disabled={busy} onClick={() => { setEditing(null); setDraft(emptyDraft(providers[0]?.providerKey || '')); }}>Cancel</Button>}</div>
    </form>
    <div className="mt-5 divide-y divide-[var(--border)]">
      {connectors.length === 0 && <p className="py-3 text-sm text-[var(--text-muted)]">No additional connector accounts configured.</p>}
      {connectors.map(connector => <section key={connector.id} className="py-4 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-medium">{connector.displayName}</h3><p className="mt-1 text-xs text-[var(--text-muted)]">{providers.find(item => item.providerKey === connector.providerKey)?.label || connector.providerKey} · {connector.credentialFieldsConfigured ? 'Credentials saved' : 'Credentials needed'}</p></div>
          <div className="flex gap-2"><Button type="button" size="sm" onClick={() => void loadNumbers(connector.id)}>Refresh numbers</Button><Button type="button" size="sm" onClick={() => { setEditing(connector.id); setDraft({ providerKey: connector.providerKey, displayName: connector.displayName, providerAccountId: connector.providerAccountId || '', credentials: {} }); }}>Edit / rotate</Button></div></div>
        <form className="mt-3 grid gap-2 md:grid-cols-4" onSubmit={event => void registerNumber(event, connector)}>
          <input aria-label={`Phone number for ${connector.displayName}`} className={inputClass} value={numberDraft[connector.id]?.phoneNumberE164 || ''} onChange={event => setNumberDraft(current => ({ ...current, [connector.id]: { ...(current[connector.id] || { phoneNumberE164: '', providerNumberId: '', displayName: '' }), phoneNumberE164: event.target.value } }))} placeholder="+14155550123" required />
          <input aria-label={`Provider number reference for ${connector.displayName}`} className={inputClass} value={numberDraft[connector.id]?.providerNumberId || ''} onChange={event => setNumberDraft(current => ({ ...current, [connector.id]: { ...(current[connector.id] || { phoneNumberE164: '', providerNumberId: '', displayName: '' }), providerNumberId: event.target.value } }))} placeholder="Provider reference (optional)" />
          <input aria-label={`Number label for ${connector.displayName}`} className={inputClass} value={numberDraft[connector.id]?.displayName || ''} onChange={event => setNumberDraft(current => ({ ...current, [connector.id]: { ...(current[connector.id] || { phoneNumberE164: '', providerNumberId: '', displayName: '' }), displayName: event.target.value } }))} placeholder="Label (optional)" />
          <Button type="submit" disabled={busy}>Add number to inventory</Button>
        </form>
        <ul className="mt-3 space-y-2 text-sm">{(numbers[connector.id] || []).map(number => <li key={number.id} className="rounded-lg border border-[var(--border)] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{number.phoneNumberE164}{number.displayName ? ` · ${number.displayName}` : ''}</span><span className="text-xs text-[var(--text-muted)]">{number.assignedWorkspaceName ? `Assigned to ${number.assignedWorkspaceName}` : 'Available to assign'}</span></div><div className="mt-2 flex flex-wrap items-center gap-2">{number.provisioningStatus !== 'ready' ? <><span className="text-xs text-[var(--text-muted)]">Confirm the number is active in your provider account to enable assignment.</span><Button type="button" size="sm" disabled={busy} onClick={() => void markNumberReady(number)}>Confirm number</Button></> : <><select aria-label={`Workspace for ${number.phoneNumberE164}`} className="h-9 min-w-48 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-2 text-sm" value={assignmentDraft[number.id] || ''} onChange={event => setAssignmentDraft(current => ({ ...current, [number.id]: event.target.value }))}><option value="">Choose workspace</option>{workspaceChoices.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select><Button type="button" size="sm" disabled={busy || !assignmentDraft[number.id]} onClick={() => void assignNumber(number)}>{number.assignedWorkspaceId ? 'Reassign' : 'Assign to workspace'}</Button>{number.assignedWorkspaceId && <Button type="button" size="sm" disabled={busy} onClick={() => void releaseNumber(number)}>Unassign</Button>}</>}</div></li>)}</ul>
      </section>)}
      {Object.values(numbers).flat().filter(number => number.ownerType === 'platform' || number.ownerType === 'platform_managed').length > 0 && <section className="mt-4 border-t border-[var(--border)] pt-4">
        <h3 className="font-medium">Numbers provided by your platform</h3>
        <p className="mt-1 text-xs text-[var(--text-muted)]">These numbers use platform-managed provider accounts. You can assign or unassign them for your workspaces.</p>
        <ul className="mt-3 space-y-2">{Object.values(numbers).flat().filter(number => number.ownerType === 'platform' || number.ownerType === 'platform_managed').map(number => <li key={number.id} className="rounded-lg border border-[var(--border)] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{number.phoneNumberE164}{number.displayName ? ` · ${number.displayName}` : ''}</span><span className="text-xs text-[var(--text-muted)]">{number.assignedWorkspaceName ? `Assigned to ${number.assignedWorkspaceName}` : 'Available to assign'}</span></div><div className="mt-2 flex flex-wrap items-center gap-2"><select aria-label={`Workspace for ${number.phoneNumberE164}`} className="h-9 min-w-48 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-2 text-sm" value={assignmentDraft[number.id] || ''} onChange={event => setAssignmentDraft(current => ({ ...current, [number.id]: event.target.value }))}><option value="">Choose workspace</option>{workspaceChoices.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select><Button type="button" size="sm" disabled={busy || !assignmentDraft[number.id]} onClick={() => void assignNumber(number)}>{number.assignedWorkspaceId ? 'Reassign' : 'Assign to workspace'}</Button>{number.assignedWorkspaceId && <Button type="button" size="sm" disabled={busy} onClick={() => void releaseNumber(number)}>Unassign</Button>}</div></li>)}</ul>
      </section>}
    </div>
  </Card>;
}
