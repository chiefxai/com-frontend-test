import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Users, PhoneCall, ScrollText, Pencil, Ban, PlayCircle, Trash2, AlertTriangle, ToggleLeft, ToggleRight, Hash, Plus, X, Cloud, Database, Archive } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { OrgDetail } from './types';
import { callCostInr, formatInr } from '../lib/pricing';
import SlideOver from '../components/ui/SlideOver';
import Modal from '../components/ui/Modal';
import { FEATURE_REGISTRY } from '../features/feature-flags/registry';
import FlagGroupPicker from '../components/ui/FlagGroupPicker';
import OrgBillingConsole from './OrgBillingConsole';
import OrganizationWorkspaceSetup from './OrganizationWorkspaceSetup';

export default function OrgDetailPanel({ orgId, onClose, onChanged }: { orgId: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', workspaceName: '', industry: '', subscriptionPlan: '', aiMinutesLimit: '', billingMethod: 'pay_as_you_go', chargeScope: 'ai_only' });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const deleteInputRef = useRef<HTMLInputElement>(null);
  const [enabledFlags, setEnabledFlags] = useState<string[]>([]);
  const [flagsBusy, setFlagsBusy] = useState(false);

  // Virtual numbers
  const [numbers, setNumbers] = useState<any[]>([]);
  const [numbersLoading, setNumbersLoading] = useState(false);
  const [addNumberForm, setAddNumberForm] = useState(false);
  const [newNum, setNewNum] = useState({ number: '', friendlyName: '', provider: 'Vobiz.ai' });
  const [numBusy, setNumBusy] = useState(false);
  const [gcpProject, setGcpProject] = useState<any>(null);
  const [gcpBusy, setGcpBusy] = useState(false);
  const [retentionState, setRetentionState] = useState<any>(null);
  const [retentionMode, setRetentionMode] = useState<'default' | 'custom'>('default');
  const [retentionOverrides, setRetentionOverrides] = useState<Record<string, number | null>>({});
  const [retentionBusy, setRetentionBusy] = useState(false);
  const [backupState, setBackupState] = useState<any>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [rechargeBusy, setRechargeBusy] = useState(false);

  const loadNumbers = () => {
    setNumbersLoading(true);
    apiFetch(`/api/platform/organizations/${orgId}/numbers`)
      .then(r => r.json())
      .then(d => setNumbers(Array.isArray(d) ? d : []))
      .catch(() => setNumbers([]))
      .finally(() => setNumbersLoading(false));
  };

  const handleAddNumber = async () => {
    if (!newNum.number.trim()) return;
    setNumBusy(true);
    try {
      const res = await apiFetch(`/api/platform/organizations/${orgId}/numbers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: newNum.number.trim(), friendlyName: newNum.friendlyName.trim(), provider: newNum.provider, status: 'Active' }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setNewNum({ number: '', friendlyName: '', provider: 'Vobiz.ai' });
      setAddNumberForm(false);
      loadNumbers();
    } catch { /* ignore */ } finally { setNumBusy(false); }
  };

  const handleDeleteNumber = async (numberId: string) => {
    if (!confirm('Remove this virtual number?')) return;
    await apiFetch(`/api/platform/organizations/${orgId}/numbers/${encodeURIComponent(numberId)}`, { method: 'DELETE' });
    setNumbers(prev => prev.filter(n => n.id !== numberId));
  };

  const loadRetention = () => {
    apiFetch(`/api/platform/organizations/${orgId}/data-retention`)
      .then(r => r.json())
      .then(d => {
        setRetentionState(d);
        setRetentionMode(d?.mode === 'custom' ? 'custom' : 'default');
        setRetentionOverrides(d?.overrides || {});
      }).catch(() => {});
    apiFetch(`/api/platform/organizations/${orgId}/backup`)
      .then(r => r.json()).then(d => setBackupState(d)).catch(() => {});
  };

  const saveRetention = async () => {
    setRetentionBusy(true);
    try {
      const res = await apiFetch(`/api/platform/organizations/${orgId}/data-retention`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: retentionMode, overrides: retentionOverrides }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save retention policy');
      setRetentionState(await res.json());
    } catch (err: any) { setActionError(err?.message || 'Failed to save retention policy'); }
    finally { setRetentionBusy(false); }
  };

  const saveBackup = async (patch: any) => {
    setBackupBusy(true);
    try {
      const res = await apiFetch(`/api/platform/organizations/${orgId}/backup`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save backup settings');
      setBackupState(await res.json());
    } catch (err: any) { setActionError(err?.message || 'Failed to save backup settings'); }
    finally { setBackupBusy(false); }
  };

  const requestBackup = async () => {
    setBackupBusy(true);
    try {
      const res = await apiFetch(`/api/platform/organizations/${orgId}/backup`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to queue backup');
      setBackupState((prev: any) => ({ ...prev, lastStatus: 'queued' }));
    } catch (err: any) { setActionError(err?.message || 'Failed to queue backup'); }
    finally { setBackupBusy(false); }
  };

  const loadGcpProject = () => {
    apiFetch(`/api/platform/organizations/${orgId}/gcp-project`)
      .then(r => r.json())
      .then(d => setGcpProject(d?.gcpVertexProject || null))
      .catch(() => setGcpProject(null));
  };

  const retryGcpProject = async () => {
    setGcpBusy(true);
    try {
      const res = await apiFetch(`/api/platform/organizations/${orgId}/gcp-project/provision`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to queue GCP provisioning');
      setGcpProject(data.gcpVertexProject || gcpProject);
      setTimeout(loadGcpProject, 1500);
    } catch (err: any) { setActionError(err?.message || 'Failed to queue GCP provisioning'); }
    finally { setGcpBusy(false); }
  };

  const loadFlags = () => {
    apiFetch(`/api/platform/organizations/${orgId}/features`)
      .then((r) => r.json())
      .then((d) => d?.featureFlags && setEnabledFlags(d.featureFlags))
      .catch(() => {});
  };

  const toggleFlag = async (key: string) => {
    const prev = enabledFlags;
    const updated = enabledFlags.includes(key)
      ? enabledFlags.filter((k) => k !== key)
      : [...enabledFlags, key];
    setEnabledFlags(updated);
    setFlagsBusy(true);
    try {
      await apiFetch(`/api/platform/organizations/${orgId}/features`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureFlags: updated }),
      });
    } catch {
      setEnabledFlags(prev);
    } finally {
      setFlagsBusy(false);
    }
  };

  // Applies a flag group as a full replacement of this org's granted flags
  // — same persist-with-revert pattern as toggleFlag, just for the whole set.
  const applyFlagGroup = async (keys: string[]) => {
    const prev = enabledFlags;
    setEnabledFlags(keys);
    setFlagsBusy(true);
    try {
      await apiFetch(`/api/platform/organizations/${orgId}/features`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureFlags: keys }),
      });
    } catch {
      setEnabledFlags(prev);
    } finally {
      setFlagsBusy(false);
    }
  };

  const load = () => {
    setLoading(true);
    apiFetch(`/api/platform/organizations/${orgId}`)
      .then((r) => r.json())
      .then((d) => {
        setDetail(d);
        setEditForm({
          name: d.name || '',
          workspaceName: d.workspaceName || '',
          industry: d.industry || '',
          subscriptionPlan: d.subscriptionPlan || '',
          aiMinutesLimit: d.aiMinutesLimit != null ? String(d.aiMinutesLimit) : '',
          billingMethod: d.billingMethod || 'pay_as_you_go',
          chargeScope: d.chargeScope || 'ai_only'
        });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); loadFlags(); loadNumbers(); loadGcpProject(); loadRetention(); }, [orgId]);

  const handleSaveEdit = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const res = await apiFetch(`/api/platform/organizations/${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          workspaceName: editForm.workspaceName,
          industry: editForm.industry,
          subscriptionPlan: editForm.subscriptionPlan,
          aiMinutesLimit: editForm.aiMinutesLimit ? Number(editForm.aiMinutesLimit) : null
        })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Update failed');
      const billingRes = await apiFetch(`/api/platform/organizations/${orgId}/billing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billingMethod: editForm.billingMethod, chargeScope: editForm.chargeScope }),
      });
      if (!billingRes.ok) throw new Error((await billingRes.json()).error || 'Billing update failed');
      setEditing(false);
      load();
      onChanged();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleSuspend = async () => {
    if (!detail) return;
    // Keep the action correct even if the API returns the status with a
    // different casing (for example "suspended" instead of "Suspended").
    const isSuspended = String(detail.status || '').toLowerCase() === 'suspended';
    const suspending = !isSuspended;
    if (!window.confirm(suspending ? `Suspend "${detail.name}"? Their team will be locked out immediately.` : `Revoke the suspension for "${detail.name}"?`)) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await apiFetch(`/api/platform/organizations/${orgId}/${suspending ? 'suspend' : 'reactivate'}`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error || 'Action failed');
      load();
      onChanged();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const openDeleteModal = () => {
    setDeleteConfirm('');
    setDeleteModal(true);
    setTimeout(() => deleteInputRef.current?.focus(), 50);
  };

  const handleDelete = async () => {
    if (!detail || deleteConfirm !== detail.name) return;
    setDeleteModal(false);
    setBusy(true);
    setActionError(null);
    try {
      const res = await apiFetch(`/api/platform/organizations/${orgId}?confirm=${encodeURIComponent(detail.name)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Delete failed');
      onChanged();
      onClose();
    } catch (err: any) {
      setActionError(err.message);
      setBusy(false);
    }
  };

  return (
    <>
    <SlideOver open onClose={onClose} title="Organization details">
      <div className="-mx-6 -my-5 flex min-h-full flex-col bg-[var(--bg-surface)] text-[var(--text-primary)]">
        {loading || !detail ? (
          <div className="flex items-center justify-center h-64 text-slate-400"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
        ) : (
          <>
            <div className="sticky -top-5 z-30 border-b border-[var(--border)] px-6 py-5 shadow-sm" style={{ background: 'var(--bg-surface)' }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">{detail.name}</h2>
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${String(detail.status || '').toLowerCase() === 'suspended' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                      {String(detail.status || '').toLowerCase() === 'suspended' ? 'Suspended' : 'Active'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{detail.workspaceName} · {detail.industry}</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setEditing((v) => !v)}
                  disabled={busy}
                  className="flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface)] disabled:opacity-50"
                >
                  <Pencil className="h-3.5 w-3.5" /> {editing ? 'Cancel Edit' : 'Edit'}
                </button>
                <button
                  onClick={handleToggleSuspend}
                  disabled={busy}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 ${
                    String(detail.status || '').toLowerCase() === 'suspended'
                      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                  }`}
                >
                  {String(detail.status || '').toLowerCase() === 'suspended'
                    ? <PlayCircle className="h-3.5 w-3.5" />
                    : <Ban className="h-3.5 w-3.5" />}
                  {String(detail.status || '').toLowerCase() === 'suspended' ? 'Revoke Suspension' : 'Suspend'}
                </button>
                <button
                  onClick={openDeleteModal}
                  disabled={busy}
                  className="ml-auto flex min-h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete Org
                </button>
              </div>

              {actionError && <p className="text-xs text-rose-600 mt-2">{actionError}</p>}

              {editing && (
                <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Name</label>
                      <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Workspace</label>
                      <input value={editForm.workspaceName} onChange={(e) => setEditForm((f) => ({ ...f, workspaceName: e.target.value }))} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Industry</label>
                      <input value={editForm.industry} onChange={(e) => setEditForm((f) => ({ ...f, industry: e.target.value }))} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Plan</label>
                      <input value={editForm.subscriptionPlan} onChange={(e) => setEditForm((f) => ({ ...f, subscriptionPlan: e.target.value }))} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">AI Minutes Limit</label>
                      <input value={editForm.aiMinutesLimit} onChange={(e) => setEditForm((f) => ({ ...f, aiMinutesLimit: e.target.value }))} placeholder="Unlimited" className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Billing Method</label>
                      <select value={editForm.billingMethod} onChange={(e) => setEditForm((f) => ({ ...f, billingMethod: e.target.value }))} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5">
                        <option value="pay_as_you_go">Pay as you go</option>
                        <option value="recharge_based">Recharge based</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Charge Scope</label>
                      <select value={editForm.chargeScope} onChange={(e) => setEditForm((f) => ({ ...f, chargeScope: e.target.value }))} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5">
                        <option value="ai_only">AI only</option>
                        <option value="ai_and_call_provider">AI + Call Provider</option>
                      </select>
                    </div>
                  </div>
                  <button onClick={handleSaveEdit} disabled={busy} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50">
                    {busy ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              )}
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                  <div className="text-lg font-semibold text-slate-800">{detail.counts.members}</div>
                  <div className="text-[10px] text-slate-400 uppercase">Members</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                  <div className="text-lg font-semibold text-slate-800">{detail.counts.leads}</div>
                  <div className="text-[10px] text-slate-400 uppercase">Leads</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                  <div className="text-lg font-semibold text-slate-800">{detail.counts.workflows}</div>
                  <div className="text-[10px] text-slate-400 uppercase">Workflows</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                  <div className="text-lg font-semibold text-slate-800">{detail.counts.campaigns}</div>
                  <div className="text-[10px] text-slate-400 uppercase">Campaigns</div>
                </div>
              </div>

              <OrganizationWorkspaceSetup key={orgId} orgId={orgId} />

              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Billing</h4>
                <div className="flex items-center justify-between text-sm mb-2"><span className="text-slate-500">Method</span><span className="font-semibold text-slate-800">{detail.billingMethod === 'recharge_based' ? 'Recharge based' : 'Pay as you go'}</span></div>
                <div className="flex items-center justify-between text-sm mb-2"><span className="text-slate-500">Charge scope</span><span className="font-semibold text-slate-800">{detail.chargeScope === 'ai_and_call_provider' ? 'AI + Call Provider' : 'AI only'}</span></div>
                {detail.billingMethod === 'recharge_based' && (
                  <>
                    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Available balance</div>
                          <div className="mt-1 text-2xl font-bold text-slate-900">₹{Number(detail.rechargeAvailableInr ?? detail.rechargeBalanceInr ?? 0).toFixed(2)}</div>
                        </div>
                        <div className="rounded-lg bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">Recharge</div>
                      </div>
                      <div className="mt-2 text-[10px] text-slate-500">
                        {Number(detail.rechargeAvailableInr ?? detail.rechargeBalanceInr ?? 0) > 0
                          ? 'Calls can use this prepaid balance.'
                          : 'No available balance. Calls should remain blocked until the organization is recharged.'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <input
                        type="number"
                        min="1"
                        step="0.01"
                        placeholder="Recharge amount"
                        value={rechargeAmount}
                        onChange={(e) => setRechargeAmount(e.target.value)}
                        disabled={rechargeBusy}
                        className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                      />
                      <button
                        disabled={rechargeBusy || Number(rechargeAmount) <= 0}
                        onClick={async () => {
                          const amount = Number(rechargeAmount);
                          if (!amount || rechargeBusy) return;
                          setRechargeBusy(true);
                          setActionError(null);
                          try {
                            const res = await apiFetch(`/api/platform/organizations/${orgId}/recharge`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ amount }),
                            });
                            const data = await res.json().catch(() => ({}));
                            if (!res.ok) throw new Error(data?.error || 'Recharge failed');
                            setRechargeAmount('');
                            load();
                            onChanged();
                          } catch (err: any) {
                            setActionError(err?.message || 'Recharge failed');
                          } finally {
                            setRechargeBusy(false);
                          }
                        }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                      >{rechargeBusy ? 'Recharging…' : 'Recharge'}</button>
                    </div>
                  </>
                )}
                <div className="mt-6 border-t border-slate-100 pt-4">
                  <OrgBillingConsole orgId={orgId} onRecharge={() => { load(); onChanged(); }} />
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Plan & Usage</h4>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-slate-500">Plan</span>
                  <span className="font-semibold text-slate-800">{detail.subscriptionPlan}</span>
                </div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-slate-500">AI minutes</span>
                  <span className="font-semibold text-slate-800">{detail.aiMinutesUsed}</span>
                </div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-slate-500">AI voice cost</span>
                  <span className="font-semibold text-slate-800">{formatInr(detail.totalCostInr)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Signed up</span>
                  <span className="text-slate-600">{new Date(detail.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5"><Cloud className="h-3.5 w-3.5" /> Vertex AI Project</h4>
                  {gcpProject?.mode !== 'existing' && gcpProject?.status !== 'ready' && gcpProject?.status !== 'retained' && (
                    <button onClick={retryGcpProject} disabled={gcpBusy} className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">
                      {gcpBusy ? 'Queueing…' : 'Retry'}
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-slate-500">Status</span>
                  <span className="font-semibold text-slate-800 capitalize">{gcpProject?.status || 'pending'}</span>
                </div>
                {gcpProject?.project_id && <div className="flex items-center justify-between text-sm mb-2"><span className="text-slate-500">Project</span><span className="font-mono text-xs text-slate-700">{gcpProject.project_id}</span></div>}
                {gcpProject?.location && <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Location</span><span className="text-slate-700">{gcpProject.location}</span></div>}
                {gcpProject?.mode && <div className="flex items-center justify-between text-sm mt-2"><span className="text-slate-500">Configuration</span><span className="text-slate-700 capitalize">{gcpProject.mode === 'existing' ? 'Existing project' : 'Automatic provisioning'}</span></div>}
                {gcpProject?.status === 'ready' && <div className="text-xs text-emerald-600 font-medium mt-3">Vertex AI: Enabled</div>}
                {gcpProject?.error_message && <p className="text-xs text-rose-600 mt-3">{gcpProject.error_message}</p>}
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Team</h4>
                <div className="space-y-2">
                  {detail.members.map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="font-medium text-slate-700">{m.name}</span>
                        <span className="text-slate-400 ml-2 text-xs">{m.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {!m.hasAccount && <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">invited</span>}
                        <span className="text-xs text-slate-500">{m.role}</span>
                      </div>
                    </div>
                  ))}
                  {detail.members.length === 0 && <p className="text-xs text-slate-400">No team members.</p>}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5"><PhoneCall className="h-3.5 w-3.5" /> Recent Calls</h4>
                <div className="space-y-2">
                  {detail.recentCalls.map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">{c.callerNumber || 'Unknown'} · {c.agentName}</span>
                      <span className="text-slate-400">{c.durationSeconds}s · {formatInr(callCostInr(c.durationSeconds))} · {new Date(c.createdAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                  {detail.recentCalls.length === 0 && <p className="text-xs text-slate-400">No calls yet.</p>}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5"><ScrollText className="h-3.5 w-3.5" /> Recent Activity</h4>
                <div className="space-y-2">
                  {detail.recentActivity.map((a) => (
                    <div key={a.id} className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">{a.action}</span>
                      <span className="text-slate-400">{new Date(a.createdAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                  {detail.recentActivity.length === 0 && <p className="text-xs text-slate-400">No activity yet.</p>}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5" /> Virtual Numbers
                    {numbersLoading && <Loader2 className="h-3 w-3 animate-spin ml-1 text-slate-400" />}
                  </h4>
                  <button
                    onClick={() => setAddNumberForm(v => !v)}
                    className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                  >
                    {addNumberForm ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    {addNumberForm ? 'Cancel' : 'Add'}
                  </button>
                </div>
                {addNumberForm && (
                  <div className="mb-3 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        placeholder="Phone number (E.164)"
                        value={newNum.number}
                        onChange={e => setNewNum(f => ({ ...f, number: e.target.value }))}
                        className="col-span-2 text-xs border border-slate-200 rounded-lg px-2 py-1.5 font-mono"
                      />
                      <select
                        value={newNum.provider}
                        onChange={e => setNewNum(f => ({ ...f, provider: e.target.value }))}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                      >
                        <option>Vobiz.ai</option>
                      </select>
                    </div>
                    <input
                      placeholder="Label (optional)"
                      value={newNum.friendlyName}
                      onChange={e => setNewNum(f => ({ ...f, friendlyName: e.target.value }))}
                      className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                    />
                    <button
                      onClick={handleAddNumber}
                      disabled={numBusy || !newNum.number.trim()}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {numBusy ? 'Adding…' : 'Add Number'}
                    </button>
                  </div>
                )}
                {numbers.length === 0 && !numbersLoading && (
                  <p className="text-xs text-slate-400">No virtual numbers registered.</p>
                )}
                <div className="space-y-2">
                  {numbers.map(n => (
                    <div key={n.id} className="flex items-center justify-between text-xs">
                      <div>
                        <span className="font-mono font-medium text-slate-700">{n.number}</span>
                        {n.friendlyName && <span className="text-slate-400 ml-2">{n.friendlyName}</span>}
                        <span className="ml-2 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{n.provider}</span>
                      </div>
                      <button onClick={() => handleDeleteNumber(n.id)} className="text-rose-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1.5"><Database className="h-3.5 w-3.5" /> Data Retention</h4>
                <p className="text-[10px] text-slate-400 mb-3">Source: {retentionMode === 'custom' ? 'Organization override' : 'Platform default'}</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['call_recordings', 'Call recordings'], ['transcripts', 'Transcripts'], ['ai_summaries', 'AI summaries'],
                    ['call_logs', 'Call logs'], ['campaign_history', 'Campaign history'], ['audit_logs', 'Audit logs'],
                    ['documents', 'Documents'], ['contacts', 'Contacts'],
                  ].map(([key, label]) => (
                    <div key={key}>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">{label}</label>
                      <select
                        value={retentionMode === 'custom' ? (retentionOverrides[key] == null ? '' : String(retentionOverrides[key])) : String(retentionState?.defaults?.[key] ?? '')}
                        disabled={retentionMode !== 'custom'}
                        onChange={e => setRetentionOverrides(prev => ({ ...prev, [key]: e.target.value === '' ? null : Number(e.target.value) }))}
                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 disabled:bg-slate-50"
                      >
                        <option value="">Never</option><option value="30">30 days</option><option value="90">90 days</option>
                        <option value="180">180 days</option><option value="365">1 year</option><option value="730">2 years</option>
                        <option value="1095">3 years</option><option value="1825">5 years</option>
                      </select>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button onClick={() => setRetentionMode('default')} className={`text-[10px] px-2.5 py-1.5 rounded-lg ${retentionMode === 'default' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>Use default</button>
                  <button onClick={() => setRetentionMode('custom')} className={`text-[10px] px-2.5 py-1.5 rounded-lg ${retentionMode === 'custom' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Custom policy</button>
                  <button onClick={saveRetention} disabled={retentionBusy} className="ml-auto text-[10px] font-semibold px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white disabled:opacity-50">{retentionBusy ? 'Saving…' : 'Save policy'}</button>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5"><Archive className="h-3.5 w-3.5" /> Backups</h4>
                <div className="flex items-center justify-between text-sm mb-2"><span className="text-slate-500">Status</span><span className="font-semibold text-slate-800">{backupState?.lastStatus || 'never'}</span></div>
                <div className="space-y-2">
                  <input type="email" value={backupState?.email || ''} onChange={e => setBackupState((p:any) => ({ ...p, email: e.target.value }))} placeholder="Backup administrator email" className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5" />
                  <div className="grid grid-cols-2 gap-2">
                    <select value={backupState?.frequency || 'monthly'} onChange={e => setBackupState((p:any) => ({ ...p, frequency: e.target.value }))} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select>
                    <select value={String(backupState?.retentionDays || 365)} onChange={e => setBackupState((p:any) => ({ ...p, retentionDays: Number(e.target.value) }))} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"><option value="30">30 days</option><option value="90">90 days</option><option value="180">180 days</option><option value="365">1 year</option><option value="730">2 years</option></select>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => saveBackup({ enabled: !backupState?.enabled, email: backupState?.email, frequency: backupState?.frequency, retentionDays: backupState?.retentionDays })} disabled={backupBusy} className={`text-[10px] font-semibold px-2.5 py-1.5 rounded-lg ${backupState?.enabled ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{backupState?.enabled ? 'Backups enabled' : 'Enable backups'}</button>
                    <button onClick={() => saveBackup({ enabled: !!backupState?.enabled, email: backupState?.email, frequency: backupState?.frequency, retentionDays: backupState?.retentionDays })} disabled={backupBusy} className="text-[10px] font-semibold px-2.5 py-1.5 rounded-lg bg-slate-900 text-white">Save</button>
                    <button onClick={requestBackup} disabled={backupBusy || !backupState?.email} className="ml-auto text-[10px] font-semibold px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white disabled:opacity-50">Create backup now</button>
                  </div>
                  {backupState?.lastError && <p className="text-[10px] text-rose-600">{backupState.lastError}</p>}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                  <ToggleRight className="h-3.5 w-3.5" /> Feature Access
                  {flagsBusy && <Loader2 className="h-3 w-3 animate-spin ml-1 text-slate-400" />}
                </h4>
                <p className="text-[10px] text-slate-400 mb-3">
                  Choose a complete group or individual features independently. Changes are saved automatically.
                </p>
                <FlagGroupPicker
                  availableKeys={FEATURE_REGISTRY.map((f) => f.key)}
                  value={enabledFlags}
                  onApply={applyFlagGroup}
                  className="w-full"
                  label="Feature Access"
                  description="Choose a complete group or individual features independently."
                />
              </div>
            </div>
          </>
        )}
      </div>
    </SlideOver>

    {/* Delete confirmation modal */}
    {deleteModal && detail && (
      <Modal open onClose={() => setDeleteModal(false)} maxWidth="max-w-md" zIndex="z-[400]">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-rose-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Delete organization</h3>
              <p className="text-slate-500 text-xs mt-0.5">This permanently deletes all data and cannot be undone.</p>
            </div>
          </div>

          <p className="text-xs text-slate-600 mb-3">
            Type <strong className="font-mono text-slate-900">{detail.name}</strong> to confirm:
          </p>
          <input
            ref={deleteInputRef}
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleDelete()}
            placeholder={detail.name}
            className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-rose-500"
          />

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setDeleteModal(false)}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteConfirm !== detail.name}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Delete permanently
            </button>
          </div>
        </div>
      </Modal>
    )}
    </>
  );
}
