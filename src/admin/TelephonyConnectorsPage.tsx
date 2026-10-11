import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { apiFetch } from '../lib/api';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { Card, CardHeader } from '../components/ui/Card';

type CredentialField = { key: string; label: string; type: string; required: boolean; placeholder?: string; options?: Array<string | { value: string; label: string }> };
type Provider = { providerKey: string; name: string; label: string; credentialSchema: CredentialField[]; capabilities?: Record<string, boolean> };
type Connector = { id: string; providerKey: string; displayName: string; providerAccountId: string | null; credentialFieldsConfigured: boolean; status: string; createdAt?: string; updatedAt?: string };
type ConnectorDraft = { providerKey: string; displayName: string; providerAccountId: string; credentials: Record<string, string> };
type InventoryNumber = { id: string; connectorAccountId?: string; providerKey?: string; connectorDisplayName?: string; ownerType?: string; ownerOrgId?: string | null; providerNumberId?: string | null; phoneNumberE164: string; displayName?: string | null; inventoryStatus: string; provisioningStatus?: string; assignedOrgId?: string | null; assignedWorkspaceId?: string | null; assignedAt?: string | null };
type NumberDraft = { phoneNumber: string; providerNumberId: string; displayName: string };

const FIELD_CLASS = 'h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]';
const emptyDraft = (providerKey = ''): ConnectorDraft => ({ providerKey, displayName: '', providerAccountId: '', credentials: {} });

async function bodyOf(response: Response) {
  return response.json().catch(() => ({} as Record<string, unknown>));
}

export default function TelephonyConnectorsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [featureOff, setFeatureOff] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState<ConnectorDraft>(emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expandedConnectorId, setExpandedConnectorId] = useState<string | null>(null);
  const [numbersByConnector, setNumbersByConnector] = useState<Record<string, InventoryNumber[]>>({});
  const [numberDrafts, setNumberDrafts] = useState<Record<string, NumberDraft>>({});
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, { orgId: string; workspaceId: string }>>({});
  const [releaseReasons, setReleaseReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true); setError(''); setFeatureOff(false);
    try {
      const [providerResponse, connectorResponse] = await Promise.all([
        apiFetch('/api/platform/telephony/providers'),
        apiFetch('/api/platform/telephony/connectors'),
      ]);
      if (providerResponse.status === 404 || connectorResponse.status === 404) {
        setFeatureOff(true); setProviders([]); setConnectors([]); return;
      }
      const [providerBody, connectorBody] = await Promise.all([bodyOf(providerResponse), bodyOf(connectorResponse)]);
      if (!providerResponse.ok || !connectorResponse.ok) {
        throw new Error(String((!providerResponse.ok ? providerBody.error : connectorBody.error) || 'Unable to load telephony connectors.'));
      }
      const nextProviders = Array.isArray(providerBody.providers) ? providerBody.providers as Provider[] : [];
      setProviders(nextProviders);
      setConnectors(Array.isArray(connectorBody.connectors) ? connectorBody.connectors as Connector[] : []);
      setDraft(current => current.providerKey || !nextProviders.length ? current : emptyDraft(nextProviders[0].providerKey));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load telephony connectors.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectedProvider = useMemo(() => providers.find(provider => provider.providerKey === draft.providerKey), [providers, draft.providerKey]);
  const grouped = useMemo(() => providers.map(provider => ({
    provider,
    accounts: connectors.filter(connector => connector.providerKey === provider.providerKey),
  })), [providers, connectors]);

  const startCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft(providers[0]?.providerKey || ''));
    setError(''); setNotice('');
  };

  const startEdit = (connector: Connector) => {
    setEditingId(connector.id);
    setDraft({ providerKey: connector.providerKey, displayName: connector.displayName, providerAccountId: connector.providerAccountId || '', credentials: {} });
    setError(''); setNotice('');
  };

  const updateDraft = (patch: Partial<ConnectorDraft>) => setDraft(current => ({ ...current, ...patch }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !selectedProvider) return;
    setError(''); setNotice(''); setBusy(true);
    try {
      const method = editingId ? 'PATCH' : 'POST';
      const url = editingId ? `/api/platform/telephony/connectors/${encodeURIComponent(editingId)}` : '/api/platform/telephony/connectors';
      const payload: Record<string, unknown> = {
        displayName: draft.displayName.trim(),
        providerAccountId: draft.providerAccountId.trim() || null,
      };
      if (!editingId) payload.providerKey = draft.providerKey;
      if (Object.keys(draft.credentials).some(key => draft.credentials[key])) payload.credentials = draft.credentials;
      const response = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await bodyOf(response);
      if (response.status === 404) { setFeatureOff(true); setProviders([]); setConnectors([]); return; }
      if (!response.ok) throw new Error(String(body.error || 'Unable to save connector.'));
      setDraft(emptyDraft(providers[0]?.providerKey || '')); setEditingId(null);
      setNotice(editingId ? 'Connector updated.' : 'Connector account created.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save connector.');
    } finally { setBusy(false); }
  };

  const setStatus = async (connector: Connector, status: 'active' | 'disabled') => {
    setError(''); setNotice(''); setBusy(true);
    try {
      const response = await apiFetch(`/api/platform/telephony/connectors/${encodeURIComponent(connector.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      });
      const body = await bodyOf(response);
      if (response.status === 404) { setFeatureOff(true); setProviders([]); setConnectors([]); return; }
      if (!response.ok) throw new Error(String(body.error || 'Unable to update connector status.'));
      setNotice(status === 'disabled' ? 'Connector disabled.' : 'Connector reactivated.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update connector status.');
    } finally { setBusy(false); }
  };

  const loadNumbers = async (connectorId: string) => {
    setError('');
    try {
      const response = await apiFetch(`/api/platform/telephony/connectors/${encodeURIComponent(connectorId)}/numbers`);
      const body = await bodyOf(response);
      if (response.status === 404) { setFeatureOff(true); setProviders([]); setConnectors([]); return; }
      if (!response.ok) throw new Error(String(body.error || 'Unable to load connector numbers.'));
      setNumbersByConnector(current => ({ ...current, [connectorId]: Array.isArray(body.numbers) ? body.numbers as InventoryNumber[] : [] }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load connector numbers.'); }
  };

  const toggleInventory = async (connectorId: string) => {
    if (expandedConnectorId === connectorId) { setExpandedConnectorId(null); return; }
    setExpandedConnectorId(connectorId);
    if (!Object.prototype.hasOwnProperty.call(numbersByConnector, connectorId)) await loadNumbers(connectorId);
  };

  const registerNumber = async (event: React.FormEvent, connectorId: string) => {
    event.preventDefault();
    const draft = numberDrafts[connectorId] || { phoneNumber: '', providerNumberId: '', displayName: '' };
    setError(''); setNotice(''); setBusy(true);
    try {
      const response = await apiFetch(`/api/platform/telephony/connectors/${encodeURIComponent(connectorId)}/numbers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumberE164: draft.phoneNumber.trim(), providerNumberId: draft.providerNumberId.trim() || null, displayName: draft.displayName.trim() || null }),
      });
      const body = await bodyOf(response);
      if (response.status === 404) { setFeatureOff(true); setProviders([]); setConnectors([]); return; }
      if (!response.ok) throw new Error(String(body.error || 'Unable to register number.'));
      setNumberDrafts(current => ({ ...current, [connectorId]: { phoneNumber: '', providerNumberId: '', displayName: '' } }));
      setNotice('Provider number added. Verify it is active on the account before assignment.');
      await loadNumbers(connectorId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to register number.'); }
    finally { setBusy(false); }
  };

  const assignNumber = async (number: InventoryNumber, connectorId: string) => {
    const draft = assignmentDrafts[number.id] || { orgId: '', workspaceId: '' };
    setError(''); setNotice(''); setBusy(true);
    try {
      const response = await apiFetch(`/api/platform/telephony/numbers/${encodeURIComponent(number.id)}/assign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: draft.orgId.trim(), workspaceId: draft.workspaceId.trim() }),
      });
      const body = await bodyOf(response);
      if (response.status === 404) { setFeatureOff(true); setProviders([]); setConnectors([]); return; }
      if (!response.ok) throw new Error(String(body.error || 'Unable to assign number.'));
      setNotice('Number assigned in inventory. Live dialing and routing are not enabled by this assignment.');
      await loadNumbers(connectorId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to assign number.'); }
    finally { setBusy(false); }
  };

  const markNumberReady = async (number: InventoryNumber, connectorId: string) => {
    if (!window.confirm(`Confirm ${number.phoneNumberE164} is active in this provider account. This verification enables it for assignment and supported outbound routing.`)) return;
    setError(''); setNotice(''); setBusy(true);
    try {
      const response = await apiFetch(`/api/platform/telephony/numbers/${encodeURIComponent(number.id)}/mark-ready`, { method: 'POST' });
      const body = await bodyOf(response);
      if (!response.ok) throw new Error(String(body.error || 'Unable to verify number.'));
      setNotice('Number verified and ready for assignment.');
      await loadNumbers(connectorId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to verify number.'); }
    finally { setBusy(false); }
  };

  const releaseNumber = async (number: InventoryNumber, connectorId: string) => {
    const orgId = number.assignedOrgId || '';
    const reason = releaseReasons[number.id]?.trim() || '';
    if (!reason) { setError('Enter a release reason before releasing this number.'); return; }
    setError(''); setNotice(''); setBusy(true);
    try {
      const response = await apiFetch(`/api/platform/telephony/numbers/${encodeURIComponent(number.id)}/release`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, reason }),
      });
      const body = await bodyOf(response);
      if (response.status === 404) { setFeatureOff(true); setProviders([]); setConnectors([]); return; }
      if (!response.ok) throw new Error(String(body.error || 'Unable to release number.'));
      setNotice('Number released to connector inventory.');
      await loadNumbers(connectorId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to release number.'); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="py-12 text-center text-sm text-[var(--text-muted)]">Loading telephony connectors…</div>;
  if (featureOff) return <Card><div className="space-y-2 py-5 text-center">
    <h2 className="text-base font-semibold">Telephony connectors are not enabled</h2>
    <p className="mx-auto max-w-xl text-sm text-[var(--text-muted)]">Connector management is unavailable until platform operations enables the telephony connector feature.</p>
    <Button type="button" icon={RefreshCw} onClick={() => void load()}>Refresh status</Button>
  </div></Card>;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Telephony connectors</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Manage provider accounts. A provider can have multiple connector accounts.</p></div>
      <Button type="button" icon={Plus} onClick={startCreate}>Add connector</Button>
    </div>
    {error && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

    <Card>
      <CardHeader title={editingId ? 'Edit connector account' : 'Create connector account'} subtitle={editingId ? 'Credential fields left blank remain unchanged. Enter a value only to rotate that credential.' : 'Credentials are stored securely and are never shown again after saving.'} />
      {providers.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No telephony providers are currently available.</p> : <form className="grid gap-4 md:grid-cols-2" onSubmit={event => void save(event)}>
        {!editingId && <label className="block text-sm">Provider<select className={`${FIELD_CLASS} mt-1`} value={draft.providerKey} onChange={event => updateDraft({ providerKey: event.target.value, credentials: {} })} required>
          {providers.map(provider => <option key={provider.providerKey} value={provider.providerKey}>{provider.label || provider.name}</option>)}
        </select></label>}
        <label className="block text-sm">Connector name<input className={`${FIELD_CLASS} mt-1`} value={draft.displayName} onChange={event => updateDraft({ displayName: event.target.value })} maxLength={191} required placeholder="e.g. Primary voice account" /></label>
        <label className="block text-sm">Provider account ID <span className="text-[var(--text-muted)]">(optional)</span><input className={`${FIELD_CLASS} mt-1`} value={draft.providerAccountId} onChange={event => updateDraft({ providerAccountId: event.target.value })} maxLength={191} /></label>
        {selectedProvider?.credentialSchema.map(field => <label className="block text-sm" key={field.key}>{field.label}{field.required && !editingId ? ' *' : ''}
          {field.options?.length ? <select className={`${FIELD_CLASS} mt-1`} value={draft.credentials[field.key] || ''} required={!editingId && field.required} onChange={event => updateDraft({ credentials: { ...draft.credentials, [field.key]: event.target.value } })}>
            <option value="">Select…</option>{field.options.map(option => { const value = typeof option === 'string' ? option : option.value; const label = typeof option === 'string' ? option : option.label; return <option key={value} value={value}>{label}</option>; })}
          </select> : <input className={`${FIELD_CLASS} mt-1`} type={field.type === 'password' || field.type === 'secret' ? 'password' : field.type === 'number' ? 'text' : 'text'} autoComplete="new-password" value={draft.credentials[field.key] || ''} onChange={event => updateDraft({ credentials: { ...draft.credentials, [field.key]: event.target.value } })} required={!editingId && field.required} placeholder={editingId ? 'Leave blank to keep current credential' : field.placeholder || ''} />}
        </label>)}
        <div className="flex flex-wrap gap-2 md:col-span-2"><Button type="submit" variant="primary" loading={busy}>{editingId ? 'Save connector' : 'Create connector'}</Button>{editingId && <Button type="button" disabled={busy} onClick={startCreate}>Cancel edit</Button>}</div>
      </form>}
    </Card>

    <div className="space-y-4">
      {grouped.map(({ provider, accounts }) => <Card key={provider.providerKey}>
        <CardHeader title={provider.label || provider.name} subtitle={`${accounts.length} connector account${accounts.length === 1 ? '' : 's'}`} />
        {accounts.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No accounts configured for this provider.</p> : <div className="divide-y divide-[var(--border)]">
          {accounts.map(connector => <div key={connector.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{connector.displayName}</span><Badge color={connector.status === 'active' ? 'green' : 'slate'}>{connector.status}</Badge></div>
              <div className="mt-1 text-xs text-[var(--text-muted)]">Account ID: {connector.providerAccountId || 'Not provided'} · Credentials {connector.credentialFieldsConfigured ? 'configured' : 'incomplete'}</div>
              <div className="font-mono text-[10px] text-[var(--text-muted)]">{connector.id}</div></div>
            <div className="flex gap-2"><Button type="button" size="sm" disabled={busy} onClick={() => void toggleInventory(connector.id)}>{expandedConnectorId === connector.id ? 'Hide numbers' : 'Manage numbers'}</Button><Button type="button" size="sm" disabled={busy} onClick={() => startEdit(connector)}>Edit / rotate credentials</Button><Button type="button" size="sm" variant={connector.status === 'active' ? 'danger' : 'success'} disabled={busy} onClick={() => void setStatus(connector, connector.status === 'active' ? 'disabled' : 'active')}>{connector.status === 'active' ? 'Disable' : 'Reactivate'}</Button></div>
            {expandedConnectorId === connector.id && <div className="w-full basis-full border-t border-[var(--border)] pt-4">
              <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Confirm each number is active on this provider account before marking it ready. Ready numbers can be assigned; live routing still requires both telephony connector feature flags.</p>
              <form className="grid gap-3 md:grid-cols-4" onSubmit={event => void registerNumber(event, connector.id)}>
                <label className="block text-sm">Provider-owned E.164 number<input className={`${FIELD_CLASS} mt-1`} value={numberDrafts[connector.id]?.phoneNumber || ''} onChange={event => setNumberDrafts(current => ({ ...current, [connector.id]: { ...(current[connector.id] || { phoneNumber: '', providerNumberId: '', displayName: '' }), phoneNumber: event.target.value } }))} required placeholder="+14155550123" /></label>
                <label className="block text-sm">Provider number ID <span className="text-[var(--text-muted)]">(optional)</span><input className={`${FIELD_CLASS} mt-1`} value={numberDrafts[connector.id]?.providerNumberId || ''} onChange={event => setNumberDrafts(current => ({ ...current, [connector.id]: { ...(current[connector.id] || { phoneNumber: '', providerNumberId: '', displayName: '' }), providerNumberId: event.target.value } }))} /></label>
                <label className="block text-sm">Number name <span className="text-[var(--text-muted)]">(optional)</span><input className={`${FIELD_CLASS} mt-1`} value={numberDrafts[connector.id]?.displayName || ''} onChange={event => setNumberDrafts(current => ({ ...current, [connector.id]: { ...(current[connector.id] || { phoneNumber: '', providerNumberId: '', displayName: '' }), displayName: event.target.value } }))} /></label>
                <div className="flex items-end"><Button type="submit" size="sm" disabled={busy}>Add to inventory</Button></div>
              </form>
              <div className="mt-4 space-y-3">{!Object.prototype.hasOwnProperty.call(numbersByConnector, connector.id) ? <p className="text-sm text-[var(--text-muted)]">Loading numbers…</p> : (numbersByConnector[connector.id] || []).length === 0 ? <p className="text-sm text-[var(--text-muted)]">No numbers registered for this connector.</p> : (numbersByConnector[connector.id] || []).map(number => {
                const assigned = number.inventoryStatus === 'assigned' && Boolean(number.assignedOrgId);
                return <div key={number.id} className="grid gap-3 rounded-lg border border-[var(--border)] p-3 md:grid-cols-4 md:items-end">
                  <div><div className="font-medium">{number.phoneNumberE164}</div><div className="mt-1 text-xs text-[var(--text-muted)]">{number.displayName || 'No name'} · Provider ID: {number.providerNumberId || 'Not provided'}</div><Badge color={assigned ? 'blue' : 'slate'}>{number.inventoryStatus || 'Unknown'}</Badge><div className="mt-1 text-xs text-[var(--text-muted)]">Provisioning: {number.provisioningStatus || 'Unknown'}</div>{assigned && <div className="mt-1 text-xs text-[var(--text-muted)]">Org {number.assignedOrgId} · Workspace {number.assignedWorkspaceId || 'Not set'}{number.assignedAt ? ` · Assigned ${new Date(number.assignedAt).toLocaleString()}` : ''}</div>}</div>
                  {assigned ? <><label className="block text-sm">Release reason<input aria-label={`Release reason for ${number.phoneNumberE164}`} className={`${FIELD_CLASS} mt-1`} value={releaseReasons[number.id] || ''} onChange={event => setReleaseReasons(current => ({ ...current, [number.id]: event.target.value }))} required placeholder="Reason for returning to inventory" /></label><div className="md:col-span-2"><Button size="sm" variant="danger" disabled={busy} onClick={() => void releaseNumber(number, connector.id)}>Release assignment</Button></div></> : <><label className="block text-sm">Organization ID<input aria-label={`Organization ID for ${number.phoneNumberE164}`} className={`${FIELD_CLASS} mt-1`} value={assignmentDrafts[number.id]?.orgId || ''} onChange={event => setAssignmentDrafts(current => ({ ...current, [number.id]: { ...(current[number.id] || { orgId: '', workspaceId: '' }), orgId: event.target.value } }))} placeholder="Exact organization ID" /></label><label className="block text-sm">Workspace ID<input aria-label={`Workspace ID for ${number.phoneNumberE164}`} className={`${FIELD_CLASS} mt-1`} value={assignmentDrafts[number.id]?.workspaceId || ''} onChange={event => setAssignmentDrafts(current => ({ ...current, [number.id]: { ...(current[number.id] || { orgId: '', workspaceId: '' }), workspaceId: event.target.value } }))} placeholder="Exact workspace ID" /></label>{number.provisioningStatus !== 'ready' && <Button size="sm" disabled={busy} onClick={() => void markNumberReady(number, connector.id)}>Verify number</Button>}<Button size="sm" aria-label={`Assign ${number.phoneNumberE164}`} disabled={busy || number.provisioningStatus !== 'ready' || !assignmentDrafts[number.id]?.orgId?.trim() || !assignmentDrafts[number.id]?.workspaceId?.trim()} onClick={() => void assignNumber(number, connector.id)}>Assign number</Button></>}
                </div>;
              })}</div>
            </div>}
          </div>)}
        </div>}
      </Card>)}
    </div>
    <div className="flex justify-end"><Button type="button" size="sm" icon={RefreshCw} disabled={busy} onClick={() => void load()}>Refresh list</Button></div>
  </div>;
}
