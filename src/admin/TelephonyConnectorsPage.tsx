import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Phone, Plus, RefreshCw, Settings2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { Card, CardHeader } from '../components/ui/Card';
import Modal from '../components/ui/Modal';

type CredentialField = { key: string; label: string; type: string; required: boolean; placeholder?: string; options?: Array<string | { value: string; label: string }> };
type Provider = { providerKey: string; name: string; label: string; credentialSchema: CredentialField[]; capabilities?: Record<string, boolean> };
type Connector = { id: string; providerKey: string; displayName: string; providerAccountId?: string | null; credentialFieldsConfigured: boolean; status: string };
type ConnectorDraft = { providerKey: string; displayName: string; credentials: Record<string, string> };
type InventoryNumber = { id: string; phoneNumberE164: string; displayName?: string | null; inventoryStatus: string; provisioningStatus?: string; allocatedOrgId?: string | null; allocatedOrgName?: string | null; assignedOrgId?: string | null; assignedWorkspaceId?: string | null; assignedWorkspaceName?: string | null; assignedAt?: string | null };
type Organization = { id: string; name: string; slug?: string };
type NumberDraft = { phoneNumber: string; displayName: string };

const FIELD_CLASS = 'h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]';
const emptyDraft = (providerKey = ''): ConnectorDraft => ({ providerKey, displayName: '', credentials: {} });

async function bodyOf(response: Response) { return response.json().catch(() => ({} as Record<string, unknown>)); }

export default function TelephonyConnectorsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [featureOff, setFeatureOff] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState<ConnectorDraft>(emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  const [numbersByConnector, setNumbersByConnector] = useState<Record<string, InventoryNumber[]>>({});
  const [numberDrafts, setNumberDrafts] = useState<Record<string, NumberDraft>>({});
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [allocationDrafts, setAllocationDrafts] = useState<Record<string, string>>({});
  const [organizationSearchDrafts, setOrganizationSearchDrafts] = useState<Record<string, string>>({});
  const [releaseReasons, setReleaseReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true); setError(''); setFeatureOff(false);
    try {
      const [providerResponse, connectorResponse] = await Promise.all([
        apiFetch('/api/platform/telephony/providers'), apiFetch('/api/platform/telephony/connectors'),
      ]);
      if (providerResponse.status === 404 || connectorResponse.status === 404) { setFeatureOff(true); setProviders([]); setConnectors([]); return; }
      const [providerBody, connectorBody] = await Promise.all([bodyOf(providerResponse), bodyOf(connectorResponse)]);
      if (!providerResponse.ok || !connectorResponse.ok) throw new Error(String((!providerResponse.ok ? providerBody.error : connectorBody.error) || 'Unable to load telephony connectors.'));
      const nextProviders = Array.isArray(providerBody.providers) ? providerBody.providers as Provider[] : [];
      setProviders(nextProviders); setConnectors(Array.isArray(connectorBody.connectors) ? connectorBody.connectors as Connector[] : []);
      setDraft(current => current.providerKey || !nextProviders.length ? current : emptyDraft(nextProviders[0].providerKey));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load telephony connectors.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const selectedProvider = useMemo(() => providers.find(provider => provider.providerKey === draft.providerKey), [providers, draft.providerKey]);
  const selectedConnector = connectors.find(connector => connector.id === selectedConnectorId) || null;
  const selectedNumbers = selectedConnector ? numbersByConnector[selectedConnector.id] : undefined;

  const openCreate = () => { setEditingId(null); setDraft(emptyDraft(providers[0]?.providerKey || '')); setError(''); setNotice(''); setFormOpen(true); };
  const openEdit = (connector: Connector) => { setEditingId(connector.id); setDraft({ providerKey: connector.providerKey, displayName: connector.displayName, credentials: {} }); setError(''); setNotice(''); setFormOpen(true); };
  const updateDraft = (patch: Partial<ConnectorDraft>) => setDraft(current => ({ ...current, ...patch }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy || !selectedProvider) return;
    setError(''); setNotice(''); setBusy(true);
    try {
      const method = editingId ? 'PATCH' : 'POST';
      const url = editingId ? `/api/platform/telephony/connectors/${encodeURIComponent(editingId)}` : '/api/platform/telephony/connectors';
      const payload: Record<string, unknown> = { displayName: draft.displayName.trim(), providerAccountId: null };
      if (!editingId) payload.providerKey = draft.providerKey;
      if (Object.keys(draft.credentials).some(key => draft.credentials[key])) payload.credentials = draft.credentials;
      const response = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await bodyOf(response);
      if (response.status === 404) { setFeatureOff(true); setProviders([]); setConnectors([]); return; }
      if (!response.ok) throw new Error(String(body.error || 'Unable to save connector.'));
      setFormOpen(false); setEditingId(null); setNotice(editingId ? 'Connector updated.' : 'Connector created.'); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save connector.'); }
    finally { setBusy(false); }
  };

  const setStatus = async (connector: Connector, status: 'active' | 'disabled') => {
    setError(''); setNotice(''); setBusy(true);
    try {
      const response = await apiFetch(`/api/platform/telephony/connectors/${encodeURIComponent(connector.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      const body = await bodyOf(response); if (!response.ok) throw new Error(String(body.error || 'Unable to update connector.'));
      setNotice(status === 'disabled' ? 'Connector disabled.' : 'Connector enabled.'); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update connector.'); }
    finally { setBusy(false); }
  };

  const openDetails = async (connector: Connector) => {
    setSelectedConnectorId(connector.id); setError('');
    try {
      const [numberResponse, orgResponse] = await Promise.all([
        apiFetch(`/api/platform/telephony/connectors/${encodeURIComponent(connector.id)}/numbers`),
        apiFetch('/api/platform/telephony/organizations'),
      ]);
      const [numberBody, orgBody] = await Promise.all([bodyOf(numberResponse), bodyOf(orgResponse)]);
      if (!numberResponse.ok) throw new Error(String(numberBody.error || 'Unable to load connector numbers.'));
      setNumbersByConnector(current => ({ ...current, [connector.id]: Array.isArray(numberBody.numbers) ? numberBody.numbers as InventoryNumber[] : [] }));
      if (orgResponse.ok) setOrganizations(Array.isArray(orgBody.organizations) ? orgBody.organizations as Organization[] : []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load connector details.'); }
  };

  const registerNumber = async (event: React.FormEvent, connector: Connector) => {
    event.preventDefault(); const value = numberDrafts[connector.id] || { phoneNumber: '', displayName: '' };
    setError(''); setNotice(''); setBusy(true);
    try {
      const response = await apiFetch(`/api/platform/telephony/connectors/${encodeURIComponent(connector.id)}/numbers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phoneNumberE164: value.phoneNumber.trim(), displayName: value.displayName.trim() || null }) });
      const body = await bodyOf(response); if (!response.ok) throw new Error(String(body.error || 'Unable to add number.'));
      setNumberDrafts(current => ({ ...current, [connector.id]: { phoneNumber: '', displayName: '' } }));
      setNotice('Number saved. Confirm that it is active on this provider account before allocating it.'); await openDetails(connector);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to add number.'); }
    finally { setBusy(false); }
  };

  const verifyNumber = async (number: InventoryNumber, connector: Connector) => {
    if (!window.confirm(`Confirm ${number.phoneNumberE164} is active in this provider account and ready to allocate?`)) return;
    setError(''); setNotice(''); setBusy(true);
    try {
      const response = await apiFetch(`/api/platform/telephony/numbers/${encodeURIComponent(number.id)}/mark-ready`, { method: 'POST' });
      const body = await bodyOf(response); if (!response.ok) throw new Error(String(body.error || 'Unable to confirm number.'));
      setNotice('Number confirmed and ready to allocate.'); await openDetails(connector);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to confirm number.'); }
    finally { setBusy(false); }
  };

  const allocateNumber = async (number: InventoryNumber, connector: Connector) => {
    const orgId = allocationDrafts[number.id]; if (!orgId) return;
    setError(''); setNotice(''); setBusy(true);
    try {
      const response = await apiFetch(`/api/platform/telephony/numbers/${encodeURIComponent(number.id)}/allocate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId }) });
      const body = await bodyOf(response); if (!response.ok) throw new Error(String(body.error || 'Unable to allocate number.'));
      setNotice('Number allocated to the organization. Its admin can assign it to a workspace.'); await openDetails(connector);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to allocate number.'); }
    finally { setBusy(false); }
  };

  const releaseNumber = async (number: InventoryNumber, connector: Connector) => {
    const orgId = number.allocatedOrgId || number.assignedOrgId || '';
    const reason = releaseReasons[number.id]?.trim() || '';
    if (!reason) { setError('Enter a reason before returning this number to platform inventory.'); return; }
    setError(''); setNotice(''); setBusy(true);
    try {
      const response = await apiFetch(`/api/platform/telephony/numbers/${encodeURIComponent(number.id)}/release`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, reason }) });
      const body = await bodyOf(response); if (!response.ok) throw new Error(String(body.error || 'Unable to return number to inventory.'));
      setNotice('Number returned to platform inventory.'); await openDetails(connector);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to return number to inventory.'); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="py-12 text-center text-sm text-[var(--text-muted)]">Loading telephony connectors…</div>;
  if (featureOff) return <Card><div className="space-y-2 py-5 text-center"><h2 className="text-base font-semibold">Telephony connectors are not enabled</h2><p className="mx-auto max-w-xl text-sm text-[var(--text-muted)]">Connector management is unavailable until platform operations enables the telephony connector feature.</p><Button type="button" icon={RefreshCw} onClick={() => void load()}>Refresh status</Button></div></Card>;

  if (selectedConnector) return <div className="space-y-5">
    <button type="button" className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]" onClick={() => setSelectedConnectorId(null)}><ArrowLeft size={16} /> All connectors</button>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{providers.find(item => item.providerKey === selectedConnector.providerKey)?.label || selectedConnector.providerKey}</p><h2 className="mt-1 text-xl font-semibold">{selectedConnector.displayName}</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Manage saved numbers for this provider account.</p></div><div className="flex gap-2"><Button type="button" size="sm" onClick={() => openEdit(selectedConnector)} icon={Settings2}>Connector settings</Button><Button type="button" size="sm" icon={RefreshCw} onClick={() => void openDetails(selectedConnector)}>Refresh</Button></div></div>
    {error && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}{notice && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <Card><CardHeader title="Add a number" subtitle="Save a phone number attached to this provider account. Provider account IDs are optional and not needed here." />
      <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={event => void registerNumber(event, selectedConnector)}>
        <label className="block text-sm">Phone number<input className={`${FIELD_CLASS} mt-1`} value={numberDrafts[selectedConnector.id]?.phoneNumber || ''} onChange={event => setNumberDrafts(current => ({ ...current, [selectedConnector.id]: { ...(current[selectedConnector.id] || { phoneNumber: '', displayName: '' }), phoneNumber: event.target.value } }))} required placeholder="+14155550123" /></label>
        <label className="block text-sm">Name <span className="text-[var(--text-muted)]">(optional)</span><input className={`${FIELD_CLASS} mt-1`} value={numberDrafts[selectedConnector.id]?.displayName || ''} onChange={event => setNumberDrafts(current => ({ ...current, [selectedConnector.id]: { ...(current[selectedConnector.id] || { phoneNumber: '', displayName: '' }), displayName: event.target.value } }))} placeholder="Support line" /></label>
        <div className="flex items-end"><Button type="submit" disabled={busy} icon={Plus}>Add number</Button></div>
      </form>
    </Card>
    <Card><CardHeader title="Saved numbers" subtitle={`${selectedNumbers?.length ?? 0} number${selectedNumbers?.length === 1 ? '' : 's'} on this connector`} />
      {selectedNumbers === undefined ? <p className="text-sm text-[var(--text-muted)]">Loading numbers…</p> : selectedNumbers.length === 0 ? <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center"><Phone className="mx-auto mb-3 text-[var(--text-muted)]" /><p className="font-medium">No numbers saved yet</p><p className="mt-1 text-sm text-[var(--text-muted)]">Add a number above when it is available on this provider account.</p></div> : <div className="divide-y divide-[var(--border)]">{selectedNumbers.map(number => {
        const allocatedOrgId = number.allocatedOrgId || number.assignedOrgId || null;
        const allocatedOrg = number.allocatedOrgName || organizations.find(org => org.id === allocatedOrgId)?.name || 'Organization';
        const ready = number.provisioningStatus === 'ready';
        const statusLabel = allocatedOrgId ? 'Allocated' : ready ? 'Available' : 'Needs confirmation';
        return <div key={number.id} className="grid gap-4 py-4 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)] lg:items-center">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{number.phoneNumberE164}</span><Badge color={allocatedOrgId ? 'blue' : ready ? 'green' : 'slate'}>{statusLabel}</Badge></div><p className="mt-1 text-sm text-[var(--text-muted)]">{number.displayName || 'No name'}</p>{allocatedOrgId && <p className="mt-2 text-sm">Allocated to <span className="font-medium">{allocatedOrg}</span>{number.assignedWorkspaceName ? ` · Assigned to ${number.assignedWorkspaceName}` : number.assignedWorkspaceId ? ' · Workspace assigned' : ' · Workspace selection is managed by the organization admin'}</p>}</div>
          {allocatedOrgId ? <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"><label className="block text-sm">Return reason<input aria-label={`Return reason for ${number.phoneNumberE164}`} className={`${FIELD_CLASS} mt-1`} value={releaseReasons[number.id] || ''} onChange={event => setReleaseReasons(current => ({ ...current, [number.id]: event.target.value }))} placeholder="Reason for return" /></label><div className="space-y-1"><Button size="sm" variant="danger" disabled={busy || Boolean(number.assignedWorkspaceId)} onClick={() => void releaseNumber(number, selectedConnector)}>Return to inventory</Button>{number.assignedWorkspaceId && <p className="text-xs text-[var(--text-muted)]">The organization admin must unassign this number from its workspace first.</p>}</div></div> : <div className="flex flex-wrap items-end gap-2">{!ready && <Button size="sm" disabled={busy} onClick={() => void verifyNumber(number, selectedConnector)} icon={Check}>Confirm active</Button>}{ready && <><label className="min-w-52 flex-1 text-sm">Allocate to organization<input aria-label={`Organization for ${number.phoneNumberE164}`} className={`${FIELD_CLASS} mt-1`} list={`organizations-${number.id}`} value={organizationSearchDrafts[number.id] ?? organizations.find(org => org.id === allocationDrafts[number.id])?.name ?? ''} onChange={event => { const value = event.target.value; const match = organizations.find(org => org.name === value); setOrganizationSearchDrafts(current => ({ ...current, [number.id]: value })); setAllocationDrafts(current => ({ ...current, [number.id]: match?.id || '' })); }} placeholder="Search organizations…" /><datalist id={`organizations-${number.id}`}>{organizations.map(org => <option key={org.id} value={org.name}>{org.slug || ''}</option>)}</datalist></label><Button size="sm" disabled={busy || !allocationDrafts[number.id]} onClick={() => void allocateNumber(number, selectedConnector)}>Allocate</Button></>}</div>}
        </div>;
      })}</div>}
    </Card>
    <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Connector settings" subtitle="Credentials are protected and cannot be viewed after saving. Leave a field blank to keep its current value." maxWidth="max-w-2xl" footer={<><Button type="button" disabled={busy} onClick={() => setFormOpen(false)}>Cancel</Button><Button type="submit" form="connector-form" loading={busy}>{editingId ? 'Save changes' : 'Create connector'}</Button></>}>
      <ConnectorForm providers={providers} selectedProvider={selectedProvider} draft={draft} editing={Boolean(editingId)} updateDraft={updateDraft} onSubmit={save} />
    </Modal>
  </div>;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Telephony connectors</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Manage provider accounts and the phone numbers available in each account.</p></div><div className="flex gap-2"><Button type="button" size="sm" icon={RefreshCw} disabled={busy} onClick={() => void load()}>Refresh</Button><Button type="button" icon={Plus} onClick={openCreate}>Add connector</Button></div></div>
    {error && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}{notice && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {providers.length === 0 ? <Card><div className="py-8 text-center"><Phone className="mx-auto mb-3 text-[var(--text-muted)]" /><h3 className="font-medium">No providers are available</h3><p className="mt-1 text-sm text-[var(--text-muted)]">Enable a telephony provider to create a connector.</p></div></Card> : providers.map(provider => {
      const accounts = connectors.filter(connector => connector.providerKey === provider.providerKey);
      return <section key={provider.providerKey} className="space-y-3"><div className="flex items-center justify-between"><div><h3 className="font-semibold">{provider.label || provider.name}</h3><p className="text-xs text-[var(--text-muted)]">{accounts.length} connector{accounts.length === 1 ? '' : 's'}</p></div></div>
        {accounts.length === 0 ? <Card><p className="py-2 text-sm text-[var(--text-muted)]">No accounts yet. Add a connector to save this provider’s credentials.</p></Card> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{accounts.map(connector => {
          const count = numbersByConnector[connector.id]?.length;
          return <Card key={connector.id} className="flex flex-col gap-4"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="rounded-xl bg-[var(--bg-subtle)] p-2.5"><Phone size={18} /></div><div className="min-w-0"><p className="truncate font-semibold">{connector.displayName}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{provider.label || provider.name} account</p></div></div><Badge color={connector.status === 'active' ? 'green' : 'slate'}>{connector.status === 'active' ? 'Active' : 'Disabled'}</Badge></div><div className="flex items-center justify-between border-t border-[var(--border)] pt-3 text-sm"><span className="text-[var(--text-muted)]">Saved numbers</span><span className="font-medium">{count === undefined ? 'Open details' : count}</span></div><div className="flex gap-2"><Button type="button" size="sm" className="flex-1" onClick={() => void openDetails(connector)}>View details <ChevronRight size={14} /></Button><Button type="button" size="sm" onClick={() => openEdit(connector)} aria-label={`Edit ${connector.displayName}`}><Settings2 size={15} /></Button><Button type="button" size="sm" variant={connector.status === 'active' ? 'danger' : 'success'} disabled={busy} onClick={() => void setStatus(connector, connector.status === 'active' ? 'disabled' : 'active')}>{connector.status === 'active' ? 'Disable' : 'Enable'}</Button></div></Card>;
        })}</div>}
      </section>;
    })}
    <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editingId ? 'Edit connector' : 'Add telephony connector'} subtitle={editingId ? 'Enter a credential only when you need to rotate it.' : 'Add a provider account. You can save phone numbers later from connector details.'} maxWidth="max-w-2xl" footer={<><Button type="button" disabled={busy} onClick={() => setFormOpen(false)}>Cancel</Button><Button type="submit" form="connector-form" loading={busy}>{editingId ? 'Save changes' : 'Create connector'}</Button></>}>
      <ConnectorForm providers={providers} selectedProvider={selectedProvider} draft={draft} editing={Boolean(editingId)} updateDraft={updateDraft} onSubmit={save} />
    </Modal>
  </div>;
}

function ConnectorForm({ providers, selectedProvider, draft, editing, updateDraft, onSubmit }: { providers: Provider[]; selectedProvider?: Provider; draft: ConnectorDraft; editing: boolean; updateDraft: (patch: Partial<ConnectorDraft>) => void; onSubmit: (event: React.FormEvent) => void }) {
  return <form id="connector-form" className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
    {!editing && <label className="block text-sm">Provider<select className={`${FIELD_CLASS} mt-1`} value={draft.providerKey} onChange={event => updateDraft({ providerKey: event.target.value, credentials: {} })} required>{providers.map(provider => <option key={provider.providerKey} value={provider.providerKey}>{provider.label || provider.name}</option>)}</select></label>}
    <label className="block text-sm">Connector name<input className={`${FIELD_CLASS} mt-1`} value={draft.displayName} onChange={event => updateDraft({ displayName: event.target.value })} maxLength={191} required placeholder="e.g. Primary voice account" /></label>
    {selectedProvider?.credentialSchema.map(field => <label className="block text-sm" key={field.key}>{field.label}{field.required && !editing ? ' *' : ''}
      {field.options?.length ? <select className={`${FIELD_CLASS} mt-1`} value={draft.credentials[field.key] || ''} required={!editing && field.required} onChange={event => updateDraft({ credentials: { ...draft.credentials, [field.key]: event.target.value } })}><option value="">Select…</option>{field.options.map(option => { const value = typeof option === 'string' ? option : option.value; const label = typeof option === 'string' ? option : option.label; return <option key={value} value={value}>{label}</option>; })}</select> : <input className={`${FIELD_CLASS} mt-1`} type={field.type === 'password' || field.type === 'secret' ? 'password' : 'text'} autoComplete="new-password" value={draft.credentials[field.key] || ''} onChange={event => updateDraft({ credentials: { ...draft.credentials, [field.key]: event.target.value } })} required={!editing && field.required} placeholder={editing ? 'Leave blank to keep current credential' : field.placeholder || ''} />}
    </label>)}
  </form>;
}
