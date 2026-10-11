import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Users, PhoneCall, ScrollText, Pencil, Ban, PlayCircle, Trash2, Hash, Plus, X, LayoutDashboard, ShieldCheck, Settings2, Activity, CreditCard, RefreshCw, Bot } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { OrgDetail } from './types';
import { callCostInr, formatInr } from '../lib/pricing';
import SlideOver from '../components/ui/SlideOver';
import Modal from '../components/ui/Modal';
import { Card, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { FEATURE_REGISTRY } from '../features/feature-flags/registry';
import FeatureAccessSelector from '../components/ui/FeatureAccessSelector';
import OrgBillingConsole from './OrgBillingConsole';
import OrganizationWorkspaceSetup from './OrganizationWorkspaceSetup';

type DetailSection = 'overview' | 'people' | 'access';

const PANEL_CLASS = 'min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-card)] sm:p-5';
const FIELD_CLASS = 'w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-60';

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0 space-y-1.5">
    <span className="block text-[11px] font-semibold text-[var(--text-secondary)]">{label}</span>
    {children}
  </label>;
}

export default function OrgDetailPanel({ orgId, onClose, onChanged }: { orgId: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [activeSection, setActiveSection] = useState<DetailSection>('overview');
  const [editForm, setEditForm] = useState({ name: '', workspaceName: '', industry: '', subscriptionPlan: '', aiMinutesLimit: '', billingMethod: 'pay_as_you_go', chargeScope: 'ai_only' });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const deleteInputRef = useRef<HTMLInputElement>(null);
  const [enabledFlags, setEnabledFlags] = useState<string[]>([]);
  const [flagsBusy, setFlagsBusy] = useState(false);
  const [flagSaveError, setFlagSaveError] = useState('');

  // Virtual numbers
  const [numbers, setNumbers] = useState<any[]>([]);
  const [numbersLoading, setNumbersLoading] = useState(false);
  const [addNumberForm, setAddNumberForm] = useState(false);
  const [newNum, setNewNum] = useState({ number: '', friendlyName: '', provider: 'Vobiz.ai' });
  const [numBusy, setNumBusy] = useState(false);
  const [gcpProject, setGcpProject] = useState<any>(null);
  const [gcpBusy, setGcpBusy] = useState(false);
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
    setActionError(null);
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
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to add this virtual number.');
    } finally {
      setNumBusy(false);
    }
  };

  const handleDeleteNumber = async (numberId: string) => {
    if (!window.confirm('Remove this virtual number?')) return;
    setActionError(null);
    try {
      const response = await apiFetch(`/api/platform/organizations/${orgId}/numbers/${encodeURIComponent(numberId)}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Unable to remove this virtual number.');
      }
      setNumbers(previous => previous.filter(number => number.id !== numberId));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to remove this virtual number.');
    }
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
    setFlagSaveError('');
    apiFetch(`/api/platform/organizations/${orgId}/features`)
      .then((r) => r.json())
      .then((d) => d?.featureFlags && setEnabledFlags(d.featureFlags))
      .catch(() => {});
  };

  // Persist changes from the shared feature selector and restore on failure.
  const applyFlagGroup = async (keys: string[]) => {
    if (flagsBusy) return;
    const previous = enabledFlags;
    setEnabledFlags(keys);
    setFlagsBusy(true);
    setFlagSaveError('');
    try {
      const response = await apiFetch(`/api/platform/organizations/${orgId}/features`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureFlags: keys }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not save organization feature access.');
      setEnabledFlags(Array.isArray(body.featureFlags) ? body.featureFlags : keys);
    } catch (cause) {
      setEnabledFlags(previous);
      setFlagSaveError(cause instanceof Error ? cause.message : 'Could not save organization feature access.');
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
      .catch(error => setActionError(error instanceof Error ? error.message : 'Unable to load organization details.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setDetail(null);
    setNumbers([]);
    setEnabledFlags([]);
    setActiveSection('overview');
    setEditing(false);
    setActionError(null);
    load();
    loadFlags();
    loadNumbers();
    loadGcpProject();
  }, [orgId]);

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
        {!detail ? (
          <div className="flex items-center justify-center h-64 text-[var(--text-muted)]"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
        ) : (
          <>
            <header className="sticky -top-5 z-30 border-b border-[var(--border)] bg-[var(--bg-surface)] px-4 pt-4 shadow-sm sm:px-6">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                  <Building2 className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="min-w-0 break-words text-base font-semibold text-[var(--text-primary)] sm:text-lg">{detail.name}</h2>
                    <Badge color={String(detail.status || '').toLowerCase() === 'suspended' ? 'rose' : 'green'}>
                      {String(detail.status || '').toLowerCase() === 'suspended' ? 'Suspended' : 'Active'}
                    </Badge>
                  </div>
                  <p className="mt-1 break-all text-xs text-[var(--text-muted)]">
                    {detail.workspaceName} <span aria-hidden="true">·</span> {detail.industry}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button type="button" variant="secondary" size="sm" icon={Pencil} disabled={busy}
                  onClick={() => { setActionError(null); setEditing(true); }}>Edit details</Button>
                <Button type="button" size="sm" icon={String(detail.status || '').toLowerCase() === 'suspended' ? PlayCircle : Ban}
                  variant="secondary" disabled={busy} onClick={() => void handleToggleSuspend()}>
                  {String(detail.status || '').toLowerCase() === 'suspended' ? 'Reactivate' : 'Suspend'}
                </Button>
                <Button type="button" size="sm" variant="ghost" icon={RefreshCw} disabled={loading}
                  onClick={() => { load(); loadFlags(); loadNumbers();  }}>
                  Refresh
                </Button>
                <Button type="button" size="sm" variant="danger" icon={Trash2}
                  className="ml-auto" disabled={busy} onClick={openDeleteModal}>Delete</Button>
              </div>
              {actionError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-500/10 dark:text-rose-300">
                {actionError}
              </p>}
              <nav aria-label="Organization detail sections"
                className="mt-4 flex min-w-0 gap-1 overflow-x-auto">
                {([
                  ['overview', 'Overview', LayoutDashboard],
                  ['people', 'People & Activity', Activity],
                  ['access', 'Access & Settings', ShieldCheck],
                ] as const).map(([key, label, Icon]) => (
                  <button key={key} type="button" aria-pressed={activeSection === key}
                    onClick={() => setActiveSection(key)}
                    className={'inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/25 ' +
                      (activeSection === key
                        ? 'border-[var(--accent)] text-[var(--accent)]'
                        : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]')}>
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
                  </button>
                ))}
              </nav>
            </header>

            <div className="space-y-5 px-4 pb-6 pt-4 sm:px-6">
              {activeSection === 'overview' && (
                <section id="org-detail-overview" aria-label="Organization overview" className="space-y-4">

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {([
                  ['Members', detail.counts.members, Users],
                  ['Workspaces', detail.counts.workspaces ?? '—', Building2],
                  ['Workflows', detail.counts.workflows, Settings2],
                  ['AI Agents', detail.counts.agents ?? '—', Bot],
                ] as const).map(([label, count, Icon]) => (
                  <Card key={label} padding="sm" className="min-w-0">
                    <div className="flex items-center gap-2 text-[var(--text-muted)]">
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="text-[11px] font-semibold">{label}</span>
                    </div>
                    <p className="mt-2 text-xl font-semibold tabular-nums text-[var(--text-primary)]">{count}</p>
                  </Card>
                ))}
              </div>

              <OrganizationWorkspaceSetup key={orgId} orgId={orgId} />

              <div className={PANEL_CLASS}>
                <CardHeader title="Billing" subtitle="How this organization is charged and what it has spent" icon={CreditCard} accent="#2563eb" />
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]/50 px-3.5 py-3">
                    <p className="text-[11px] font-medium text-[var(--text-muted)]">Billing method</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                      {detail.billingMethod === 'recharge_based' ? 'Prepaid / recharge' : 'Pay as you go'}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                      {detail.billingMethod === 'recharge_based' ? 'Call charges use an available prepaid balance.' : 'Usage is billed as charges are recorded.'}
                    </p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]/50 px-3.5 py-3">
                    <p className="text-[11px] font-medium text-[var(--text-muted)]">Charge scope</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                      {detail.chargeScope === 'ai_and_call_provider' ? 'AI + phone provider' : 'AI only'}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                      {detail.chargeScope === 'ai_and_call_provider' ? 'Includes AI processing and phone-provider costs.' : 'Only AI usage is charged by the platform.'}
                    </p>
                  </div>
                </div>
                {detail.billingMethod === 'recharge_based' && (
                  <div className="mt-4 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]/40 p-3.5 sm:p-4">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-[var(--text-secondary)]">Available prepaid balance</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-[var(--text-primary)]">
                          {formatInr(Number(detail.rechargeAvailableInr ?? detail.rechargeBalanceInr ?? 0))}
                        </p>
                      </div>
                      <span className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)]">
                        Shared organization balance
                      </span>
                    </div>
                    <p className="text-xs leading-5 text-[var(--text-muted)]">
                      {Number(detail.rechargeAvailableInr ?? detail.rechargeBalanceInr ?? 0) > 0
                        ? 'Available balance can be used for calls. Active call reservations are already excluded.'
                        : 'No available balance. Calls may be blocked until the balance is replenished.'}
                    </p>
                    <div className="border-t border-[var(--border)] pt-3">
                      <h5 className="text-xs font-semibold text-[var(--text-primary)]">Add prepaid balance</h5>
                      <p className="mt-1 text-[11px] leading-5 text-[var(--text-muted)]">
                        Platform adjustment: funds are credited immediately, without a payment-review request.
                      </p>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                        <label className="block min-w-0 flex-1 text-xs font-medium text-[var(--text-secondary)]">
                          Amount (INR)
                          <input
                            type="number"
                            min="1"
                            step="0.01"
                            placeholder="e.g. 1000"
                            value={rechargeAmount}
                            onChange={event => setRechargeAmount(event.target.value)}
                            disabled={rechargeBusy}
                            className={FIELD_CLASS + ' mt-1.5 h-10'}
                          />
                        </label>
<button type="button"
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
                        className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      >{rechargeBusy ? 'Adding…' : 'Add balance'}</button>
                      </div>
                    </div>
                  </div>
                )}
                <div className="mt-5 border-t border-[var(--border)] pt-4">
                  <OrgBillingConsole orgId={orgId} onRecharge={() => { load(); onChanged(); }} />
                </div>
              </div>

              <div className={PANEL_CLASS}>
                <CardHeader title="Plan & usage" subtitle="Subscription and accumulated AI usage" icon={Activity} accent="#2563eb" />
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]/50 p-3">
                    <p className="text-[11px] font-medium text-[var(--text-secondary)]">AI call time</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--text-primary)]">{detail.aiMinutesUsed}</p>
                    <p className="mt-1 text-[10px] text-[var(--text-muted)]">Minutes recorded</p>
                  </div>
                  <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]/50 p-3">
                    <p className="text-[11px] font-medium text-[var(--text-secondary)]">AI voice cost</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--text-primary)]">{formatInr(detail.totalCostInr)}</p>
                    <p className="mt-1 text-[10px] text-[var(--text-muted)]">Recorded charges</p>
                  </div>
                </div>
                <div className="mt-3 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] px-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs">
                    <span className="text-[var(--text-muted)]">Subscription plan</span>
                    <span className="font-semibold text-[var(--text-primary)]">{detail.subscriptionPlan}</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs">
                    <span className="text-[var(--text-muted)]">Signed up</span>
                    <span className="font-medium text-[var(--text-primary)]">{new Date(detail.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              <div className={PANEL_CLASS}>
                <CardHeader title="Vertex AI project" subtitle="Cloud project connected to this organization"
                  icon={Cloud} accent="#7c3aed"
                  action={
                    gcpProject?.mode !== 'existing' && gcpProject?.status !== 'ready' && gcpProject?.status !== 'retained'
                      ? <Button type="button" size="xs" variant="secondary" loading={gcpBusy}
                          onClick={() => void retryGcpProject()}>Retry</Button>
                      : undefined
                  }
                />
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-[var(--text-secondary)]">Status</span>
                  <span className="font-semibold text-[var(--text-primary)] capitalize">{gcpProject?.status || 'pending'}</span>
                </div>
                {gcpProject?.project_id && <div className="flex items-center justify-between text-sm mb-2"><span className="text-[var(--text-secondary)]">Project</span><span className="font-mono text-xs text-[var(--text-primary)]">{gcpProject.project_id}</span></div>}
                {gcpProject?.location && <div className="flex items-center justify-between text-sm"><span className="text-[var(--text-secondary)]">Location</span><span className="text-[var(--text-primary)]">{gcpProject.location}</span></div>}
                {gcpProject?.mode && <div className="flex items-center justify-between text-sm mt-2"><span className="text-[var(--text-secondary)]">Configuration</span><span className="text-[var(--text-primary)] capitalize">{gcpProject.mode === 'existing' ? 'Existing project' : 'Automatic provisioning'}</span></div>}
                {gcpProject?.status === 'ready' && <div className="text-xs text-emerald-600 font-medium mt-3">Vertex AI: Enabled</div>}
                {gcpProject?.error_message && <p className="text-xs text-rose-600 mt-3">{gcpProject.error_message}</p>}
              </div>


                </section>
              )}
              {activeSection === 'people' && (
                <section id="org-detail-people" aria-label="People and activity" className="space-y-4">
                  <Card padding="md">
                    <CardHeader title="Team members" subtitle={detail.members.length + ' people in this organization'} icon={Users} accent="#2563eb" />
                    {detail.members.length ? (
                      <ul className="divide-y divide-[var(--border)]">
                        {detail.members.map(member => (
                          <li key={member.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-secondary)]">
                              {(member.name || member.email || '?').trim().charAt(0).toUpperCase()}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-[var(--text-primary)]">{member.name || member.email}</p>
                              <p className="break-all text-[11px] text-[var(--text-muted)]">{member.email}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {!member.hasAccount && <Badge color="amber">Invited</Badge>}
                              <Badge color="slate">{member.role}</Badge>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="text-xs text-[var(--text-muted)]">No team members yet.</p>}
                  </Card>
                  <Card padding="md">
                    <CardHeader title="Recent calls" subtitle="Latest voice activity" icon={PhoneCall} accent="#0891b2"
                      action={<Badge color="slate">{detail.recentCalls.length}</Badge>} />
                    {detail.recentCalls.length ? (
                      <ul className="divide-y divide-[var(--border)]">
                        {detail.recentCalls.map(call => (
                          <li key={call.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                            <div className="min-w-0 flex-1">
                              <p className="break-all text-xs font-semibold text-[var(--text-primary)]">{call.callerNumber || 'Unknown number'}</p>
                              <p className="mt-1 text-[11px] text-[var(--text-muted)]">{call.agentName || 'Unassigned agent'} · {new Date(call.createdAt).toLocaleDateString()}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-xs font-semibold tabular-nums text-[var(--text-primary)]">{formatInr(callCostInr(call.durationSeconds))}</p>
                              <p className="mt-1 text-[11px] text-[var(--text-muted)]">{call.durationSeconds}s</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="text-xs text-[var(--text-muted)]">No recent calls.</p>}
                  </Card>
                  <Card padding="md">
                    <CardHeader title="Recent activity" subtitle="Changes and actions across the organization" icon={ScrollText} accent="#7c3aed" />
                    {detail.recentActivity.length ? (
                      <ul className="divide-y divide-[var(--border)]">
                        {detail.recentActivity.map(event => (
                          <li key={event.id} className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0">
                            <div className="min-w-0 flex-1">
                              <p className="break-words text-xs font-medium text-[var(--text-primary)]">{event.action}</p>
                              {event.actorEmail && <p className="mt-1 break-all text-[11px] text-[var(--text-muted)]">{event.actorEmail}</p>}
                            </div>
                            <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{new Date(event.createdAt).toLocaleDateString()}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="text-xs text-[var(--text-muted)]">No recent activity.</p>}
                  </Card>
                </section>
              )}
              {activeSection === 'access' && (
                <section id="org-detail-access" aria-label="Access and settings" className="space-y-4">
                  <Card padding="md">
                    <CardHeader title="Feature access" icon={ShieldCheck} accent="#2563eb"
                      subtitle="Control which modules this organization can use." />
                    {flagSaveError && (
                      <p role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
                        {flagSaveError}
                      </p>
                    )}
                    <FeatureAccessSelector
                      label="Granted permissions"
                      description="Select a feature group or find an individual permission. Use the information icon beside a group to inspect its included features."
                      availableKeys={FEATURE_REGISTRY.map(feature => feature.key)}
                      value={enabledFlags}
                      onChange={keys => { void applyFlagGroup(keys); }}
                      disabled={flagsBusy}
                    />
                    <p role="status" className="mt-3 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                      {flagsBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                      {flagsBusy ? 'Saving permission changes…' : 'Permission changes save automatically.'}
                    </p>
                  </Card>

                  <Card padding="md">
                    <CardHeader title="Virtual numbers" icon={Hash} accent="#0d9488"
                      subtitle="Connected call-provider phone numbers."
                      action={<Button type="button" size="sm" variant="secondary"
                        icon={addNumberForm ? X : Plus}
                        onClick={() => setAddNumberForm(previous => !previous)}>
                        {addNumberForm ? 'Cancel' : 'Add number'}
                      </Button>}
                    />
                    {addNumberForm && (
                      <div className="mb-4 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <DetailField label="Phone number (E.164)">
                            <input className={FIELD_CLASS} type="tel" autoComplete="off"
                              placeholder="+14155550123" value={newNum.number}
                              onChange={event => setNewNum(value => ({ ...value, number: event.target.value }))} />
                          </DetailField>
                          <DetailField label="Provider">
                            <select className={FIELD_CLASS} value={newNum.provider}
                              onChange={event => setNewNum(value => ({ ...value, provider: event.target.value }))}>
                              <option>Vobiz.ai</option>
                            </select>
                          </DetailField>
                        </div>
                        <DetailField label="Friendly name (optional)">
                          <input className={FIELD_CLASS} value={newNum.friendlyName}
                            placeholder="Support line" onChange={event => setNewNum(value => ({ ...value, friendlyName: event.target.value }))} />
                        </DetailField>
                        <div className="flex justify-end">
                          <Button type="button" variant="primary" size="sm" icon={Plus} loading={numBusy}
                            disabled={!newNum.number.trim()} onClick={() => void handleAddNumber()}>Add number</Button>
                        </div>
                      </div>
                    )}
                    {numbersLoading ? (
                      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading phone numbers…
                      </div>
                    ) : numbers.length ? (
                      <ul className="divide-y divide-[var(--border)]">
                        {numbers.map(number => (
                          <li key={number.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                            <div className="min-w-0">
                              <p className="break-all font-mono text-xs font-semibold text-[var(--text-primary)]">{number.number}</p>
                              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                                {number.friendlyName || 'No label'} · {number.provider}
                              </p>
                            </div>
                            <Button type="button" size="xs" variant="ghost" icon={Trash2}
                              aria-label={'Remove virtual number ' + number.number}
                              className="shrink-0 text-rose-600" onClick={() => void handleDeleteNumber(number.id)}>
                              Remove
                            </Button>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="text-xs text-[var(--text-muted)]">No virtual numbers registered.</p>}
                  </Card>

                </section>
              )}
            </div>
          </>
        )}
      </div>
    </SlideOver>

    {/* Editing is a dedicated modal rather than a form inside the sticky sidebar header. */}
    {editing && detail && (
      <Modal open title="Edit organization" subtitle={detail.name}
        maxWidth="max-w-2xl" zIndex="z-[400]"
        onClose={() => { if (!busy) setEditing(false); }}
        footer={<>
          <Button type="button" size="sm" variant="secondary" disabled={busy}
            onClick={() => setEditing(false)}>Cancel</Button>
          <Button type="button" size="sm" variant="primary" loading={busy}
            onClick={() => void handleSaveEdit()}>Save changes</Button>
        </>}>
        {actionError && (
          <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
            {actionError}
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DetailField label="Organization name">
            <input className={FIELD_CLASS} value={editForm.name} disabled={busy}
              onChange={event => setEditForm(value => ({ ...value, name: event.target.value }))} />
          </DetailField>
          <DetailField label="Workspace slug">
            <input className={FIELD_CLASS} value={editForm.workspaceName} disabled={busy}
              onChange={event => setEditForm(value => ({ ...value, workspaceName: event.target.value }))} />
          </DetailField>
          <DetailField label="Industry">
            <input className={FIELD_CLASS} value={editForm.industry} disabled={busy}
              onChange={event => setEditForm(value => ({ ...value, industry: event.target.value }))} />
          </DetailField>
          <DetailField label="Subscription plan">
            <input className={FIELD_CLASS} value={editForm.subscriptionPlan} disabled={busy}
              onChange={event => setEditForm(value => ({ ...value, subscriptionPlan: event.target.value }))} />
          </DetailField>
          <DetailField label="AI minutes limit">
            <input className={FIELD_CLASS} type="number" min="0" step="1"
              placeholder="Unlimited" value={editForm.aiMinutesLimit} disabled={busy}
              onChange={event => setEditForm(value => ({ ...value, aiMinutesLimit: event.target.value }))} />
          </DetailField>
          <DetailField label="Billing method">
            <select className={FIELD_CLASS} value={editForm.billingMethod} disabled={busy}
              onChange={event => setEditForm(value => ({ ...value, billingMethod: event.target.value }))}>
              <option value="pay_as_you_go">Pay as you go</option>
              <option value="recharge_based">Recharge based</option>
            </select>
          </DetailField>
          <DetailField label="Charge scope">
            <select className={FIELD_CLASS} value={editForm.chargeScope} disabled={busy}
              onChange={event => setEditForm(value => ({ ...value, chargeScope: event.target.value }))}>
              <option value="ai_only">AI only</option>
              <option value="ai_and_call_provider">AI + call provider</option>
            </select>
          </DetailField>
        </div>
        <p className="mt-4 text-xs text-[var(--text-muted)]">
          Changes to identity and billing will be saved to the organization's existing settings.
        </p>
      </Modal>
    )}

    {/* Destructive actions stay behind a separate name-confirmation dialog. */}
    {deleteModal && detail && (
      <Modal open maxWidth="max-w-md" zIndex="z-[400]"
        title="Delete organization"
        subtitle="This action permanently deletes the organization's data and cannot be undone."
        onClose={() => { if (!busy) setDeleteModal(false); }}
        footer={<>
          <Button type="button" size="sm" variant="secondary" disabled={busy}
            onClick={() => setDeleteModal(false)}>Cancel</Button>
          <Button type="button" size="sm" variant="danger" icon={Trash2} loading={busy}
            disabled={deleteConfirm !== detail.name}
            onClick={() => void handleDelete()}>Delete permanently</Button>
        </>}>
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
            Type <strong className="font-semibold text-[var(--text-primary)]">{detail.name}</strong> to confirm.
          </p>
          <label htmlFor="org-delete-confirm" className="block text-[11px] font-semibold text-[var(--text-secondary)]">
            Organization name
          </label>
          <input id="org-delete-confirm" ref={deleteInputRef}
            className={FIELD_CLASS} autoComplete="off" value={deleteConfirm}
            placeholder={detail.name}
            onChange={event => setDeleteConfirm(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && deleteConfirm === detail.name) void handleDelete(); }} />
        </div>
      </Modal>
    )}
    </>
  );
}
