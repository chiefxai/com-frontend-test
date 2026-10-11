import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { Card, CardHeader } from '../ui/Card';
import Button from '../ui/Button';

type CredentialField = { key: string; label: string; type: string; required: boolean; placeholder?: string };
type Provider = { providerKey: string; name: string; label: string; credentialSchema: CredentialField[] };
type Connector = { id: string; providerKey: string; displayName: string; providerAccountId: string | null; credentialFieldsConfigured: boolean; status: string };
type InventoryNumber = { id: string; phoneNumberE164: string; displayName: string | null; inventoryStatus: string; provisioningStatus?: string; assignedWorkspaceId?: string | null };
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
      const [providerResponse, connectorResponse] = await Promise.all([
        apiFetch('/api/telephony/providers'), apiFetch('/api/telephony/connectors'),
      ]);
      if (providerResponse.status === 404 || connectorResponse.status === 404) { setFeatureOff(true); return; }
      const [providerBody, connectorBody] = await Promise.all([responseBody(providerResponse), responseBody(connectorResponse)]);
      if (!providerResponse.ok || !connectorResponse.ok) throw new Error(String(providerBody.error || connectorBody.error || 'Unable to load connector accounts.'));
      const nextProviders = Array.isArray(providerBody.providers) ? providerBody.providers as Provider[] : [];
      setProviders(nextProviders);
      setConnectors(Array.isArray(connectorBody.connectors) ? connectorBody.connectors as Connector[] : []);
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
      const connector = connectors.find(item => (numbers[item.id] || []).some(existing => existing.id === number.id));
      if (connector) await loadNumbers(connector.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to verify number.'); }
    finally { setBusy(false); }
  };

  const assignNumber = async (number: InventoryNumber) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await apiFetch(`/api/telephony/numbers/${encodeURIComponent(number.id)}/assign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(String(body.error || 'Unable to assign number to this workspace.'));
      setNotice('Number assigned to this workspace.');
      const connector = connectors.find(item => (numbers[item.id] || []).some(existing => existing.id === number.id));
      if (connector) await loadNumbers(connector.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to assign number.'); }
    finally { setBusy(false); }
  };

  if (loading) return <Card><p className="text-sm text-[var(--text-muted)]">Loading customer telephony connectors…</p></Card>;
  if (featureOff) return <Card><CardHeader title="Customer-owned provider accounts" subtitle="Manage multiple accounts for each telephony provider." /><p className="text-sm text-[var(--text-muted)]">This feature is not enabled. The existing Vobiz connection and number setup remain available above.</p></Card>;

  return <Card>
    <CardHeader title="Customer-owned provider accounts" subtitle="Store multiple provider accounts securely and keep their numbers organized." />
    <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">These accounts stay separate from the existing Vobiz setup. Confirm each number is active on its provider account before marking it ready; connector routing also requires platform operations to enable its feature flags.</p>
    {error && <p role="alert" className="mb-3 text-sm text-rose-600">{error}</p>}{notice && <p role="status" className="mb-3 text-sm text-emerald-700">{notice}</p>}
    <form onSubmit={event => void save(event)} className="grid gap-3 md:grid-cols-2">
      {!editing && <label className="text-sm">Provider<select className={inputClass} value={draft.providerKey} onChange={event => setDraft(current => ({ ...current, providerKey: event.target.value, credentials: {} }))} required>
        {providers.map(provider => <option key={provider.providerKey} value={provider.providerKey}>{provider.label || provider.name}</option>)}
      </select></label>}
      <label className="text-sm">Connector name<input className={inputClass} value={draft.displayName} onChange={event => setDraft(current => ({ ...current, displayName: event.target.value }))} maxLength={191} required placeholder="e.g. Mumbai support account" /></label>
      <label className="text-sm">Provider account ID (optional)<input className={inputClass} value={draft.providerAccountId} onChange={event => setDraft(current => ({ ...current, providerAccountId: event.target.value }))} maxLength={191} /></label>
      {selectedProvider?.credentialSchema.map(field => <label key={field.key} className="text-sm">{field.label}{field.required && !editing ? ' *' : ''}<input className={inputClass} type={field.type === 'secret' || field.type === 'password' ? 'password' : 'text'} autoComplete="new-password" value={draft.credentials[field.key] || ''} onChange={event => setDraft(current => ({ ...current, credentials: { ...current.credentials, [field.key]: event.target.value } }))} required={!editing && field.required} placeholder={editing ? 'Leave blank to keep current value' : field.placeholder || ''} /></label>)}
      <div className="flex items-end gap-2"><Button type="submit" loading={busy}>{editing ? 'Save account' : 'Add account'}</Button>{editing && <Button type="button" disabled={busy} onClick={() => { setEditing(null); setDraft(emptyDraft(providers[0]?.providerKey || '')); }}>Cancel</Button>}</div>
    </form>
    <div className="mt-5 divide-y divide-[var(--border)]">
      {connectors.length === 0 && <p className="py-3 text-sm text-[var(--text-muted)]">No additional connector accounts configured.</p>}
      {connectors.map(connector => <section key={connector.id} className="py-4 first:pt-0 last:pb-0">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-medium">{connector.displayName}</h3><p className="mt-1 text-xs text-[var(--text-muted)]">{providers.find(item => item.providerKey === connector.providerKey)?.label || connector.providerKey} · {connector.status} · Provider account: {connector.providerAccountId || 'not provided'}</p></div>
          <div className="flex gap-2"><Button type="button" size="sm" onClick={() => void loadNumbers(connector.id)}>Refresh numbers</Button><Button type="button" size="sm" onClick={() => { setEditing(connector.id); setDraft({ providerKey: connector.providerKey, displayName: connector.displayName, providerAccountId: connector.providerAccountId || '', credentials: {} }); }}>Edit / rotate</Button></div></div>
        <form className="mt-3 grid gap-2 md:grid-cols-4" onSubmit={event => void registerNumber(event, connector)}>
          <input aria-label={`Phone number for ${connector.displayName}`} className={inputClass} value={numberDraft[connector.id]?.phoneNumberE164 || ''} onChange={event => setNumberDraft(current => ({ ...current, [connector.id]: { ...(current[connector.id] || { phoneNumberE164: '', providerNumberId: '', displayName: '' }), phoneNumberE164: event.target.value } }))} placeholder="+14155550123" required />
          <input aria-label={`Provider number ID for ${connector.displayName}`} className={inputClass} value={numberDraft[connector.id]?.providerNumberId || ''} onChange={event => setNumberDraft(current => ({ ...current, [connector.id]: { ...(current[connector.id] || { phoneNumberE164: '', providerNumberId: '', displayName: '' }), providerNumberId: event.target.value } }))} placeholder="Provider number ID" />
          <input aria-label={`Number label for ${connector.displayName}`} className={inputClass} value={numberDraft[connector.id]?.displayName || ''} onChange={event => setNumberDraft(current => ({ ...current, [connector.id]: { ...(current[connector.id] || { phoneNumberE164: '', providerNumberId: '', displayName: '' }), displayName: event.target.value } }))} placeholder="Label (optional)" />
          <Button type="submit" disabled={busy}>Add number to inventory</Button>
        </form>
        <ul className="mt-3 space-y-1 text-sm">{(numbers[connector.id] || []).map(number => <li key={number.id} className="flex flex-wrap items-center gap-2">{number.phoneNumberE164}{number.displayName ? ` · ${number.displayName}` : ''} <span className="text-xs text-[var(--text-muted)]">({number.inventoryStatus}, {number.provisioningStatus || 'pending'})</span>{number.provisioningStatus !== 'ready' && <Button type="button" size="sm" disabled={busy} onClick={() => void markNumberReady(number)}>Verify number</Button>}{number.provisioningStatus === 'ready' && number.inventoryStatus === 'available' && <Button type="button" size="sm" disabled={busy} onClick={() => void assignNumber(number)}>Assign to this workspace</Button>}{number.inventoryStatus === 'assigned' && <span className="text-xs text-[var(--text-muted)]">Assigned to workspace {number.assignedWorkspaceId || ''}</span>}</li>)}</ul>
      </section>)}
    </div>
  </Card>;
}
