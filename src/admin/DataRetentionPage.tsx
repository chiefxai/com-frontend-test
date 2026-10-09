import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, Database, Pencil, Plus, ShieldCheck, Trash2, HardDrive, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { usePageHeaderContext } from '../lib/PageHeaderContext';
import { Card, CardHeader } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import IconButton from '../components/ui/IconButton';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import type { WorkspacePlan } from '../lib/workspacePolicy';
import {
  BACKUP_DAY_OPTIONS, DEFAULT_BACKUP, DEFAULT_RETENTION, RETENTION_DAY_OPTIONS,
  RETENTION_FIELDS, readableBackup, readableRetention,
  type RetentionBackup, type RetentionKey,
  type RetentionPolicyCatalog, type RetentionTemplate,
} from '../lib/retentionPolicies';

const inputClass = 'mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60';
const smallLabel = 'block text-[11px] font-semibold text-[var(--text-secondary)]';

function newId(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 56);
  return /^[a-z]/.test(slug) ? slug : 'policy-' + slug;
}

export default function DataRetentionPage() {
  const header = usePageHeaderContext();
  const { showToast } = useToast();
  const [catalog, setCatalog] = useState<RetentionPolicyCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [backendNeedsUpdate, setBackendNeedsUpdate] = useState(false);
  const [linkedPlans, setLinkedPlans] = useState<WorkspacePlan[]>([]);
  const [linksLoaded, setLinksLoaded] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<RetentionTemplate | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [makeDefault, setMakeDefault] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    setLinksLoaded(false);
    try {
      // Plan associations are displayed here to avoid deleting a template
      // that is still promised by an active or archived subscription plan.
      const plansResponse = await apiFetch('/api/platform/billing/workspace-plans');
      if (plansResponse.ok) {
        const body = await plansResponse.json().catch(() => ({})) as { plans?: WorkspacePlan[] };
        setLinkedPlans(Array.isArray(body.plans) ? body.plans : []);
        setLinksLoaded(true);
      }
      const response = await apiFetch('/api/platform/data-retention/policies');
      if (response.status === 404) {
        const legacyResponse = await apiFetch('/api/platform/data-retention/defaults');
        const defaults = await legacyResponse.json().catch(() => null);
        if (!legacyResponse.ok || !defaults || typeof defaults !== 'object') {
          throw new Error('Could not load platform retention defaults.');
        }
        setCatalog({
          version: 0,
          defaultPolicyId: 'platform-default',
          policies: [{
            id: 'platform-default',
            name: 'Platform default',
            description: 'Legacy retention defaults. Multiple policy templates require the backend update.',
            retention: { ...DEFAULT_RETENTION, ...defaults },
            backup: { ...DEFAULT_BACKUP },
          }],
        });
        setBackendNeedsUpdate(true);
        return;
      }
      const data = await response.json().catch(() => null) as RetentionPolicyCatalog & { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || 'Could not load retention and backup policies.');
      if (!data || !Array.isArray(data.policies) || !data.defaultPolicyId) {
        throw new Error('Platform returned an invalid policy catalog.');
      }
      setCatalog(data);
      setBackendNeedsUpdate(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load policies.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const addPolicy = useCallback(() => {
    if (!catalog || busy || backendNeedsUpdate) return;
    const current = catalog.policies.find(row => row.id === catalog.defaultPolicyId);
    setEditingId(null);
    setMakeDefault(false);
    setDraft({
      id: '',
      name: '',
      description: '',
      retention: { ...(current?.retention || DEFAULT_RETENTION) },
      backup: { ...(current?.backup || DEFAULT_BACKUP) },
    });
    setError('');
  }, [catalog, busy, backendNeedsUpdate]);

  useEffect(() => {
    if (!header) return;
    header.setHeader({
      title: 'Data Retention & Backup',
      action: <IconButton icon={Plus} label="Create retention and backup policy"
        disabled={loading || busy || !catalog || backendNeedsUpdate} onClick={addPolicy} />,
    });
  }, [header?.setHeader, addPolicy, loading, busy, catalog]);

  const editPolicy = (policy: RetentionTemplate) => {
    if (busy || backendNeedsUpdate) return;
    setEditingId(policy.id);
    setMakeDefault(policy.id === catalog?.defaultPolicyId);
    setDraft({ ...policy, retention: { ...policy.retention }, backup: { ...policy.backup } });
    setError('');
  };

  const closeEditor = () => { if (!busy) { setDraft(null); setEditingId(null); } };
  const updateBackup = (patch: Partial<RetentionBackup>) =>
    setDraft(current => current ? { ...current, backup: { ...current.backup, ...patch } } : current);
  const updateRetention = (key: RetentionKey, value: number | null) =>
    setDraft(current => current
      ? { ...current, retention: { ...current.retention, [key]: value } } : current);

  const persist = async (policies: RetentionTemplate[], defaultPolicyId: string, success: string) => {
    if (!catalog || busy || backendNeedsUpdate) return false;
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch('/api/platform/data-retention/policies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedVersion: catalog.version, policies, defaultPolicyId }),
      });
      const data = await response.json().catch(() => null) as RetentionPolicyCatalog & { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || 'Unable to save policies.');
      if (!data || !Array.isArray(data.policies)) throw new Error('Unexpected save response.');
      setCatalog(data);
      showToast(success, 'success');
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to save policies.';
      setError(message);
      showToast(message, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async () => {
    if (!catalog || !draft || busy) return;
    const normalized: RetentionTemplate = {
      ...draft,
      id: editingId || newId(draft.name),
      name: draft.name.trim(),
      description: draft.description.trim(),
    };
    if (!normalized.name) { setError('Enter a name for this policy.'); return; }
    if (catalog.policies.some(row =>
      row.id !== editingId && (row.id === normalized.id || row.name.toLowerCase() === normalized.name.toLowerCase()))) {
      setError('A policy already uses this name or code. Choose a unique name.');
      return;
    }
    if (!normalized.backup.retentionDays || normalized.backup.retentionDays < 1) {
      setError('Choose a valid backup retention period.'); return;
    }
    const next = editingId
      ? catalog.policies.map(row => row.id === editingId ? normalized : row)
      : [...catalog.policies, normalized];
    const defaultId = makeDefault ? normalized.id : catalog.defaultPolicyId;
    if (await persist(next, defaultId, editingId ? 'Policy updated successfully.' : 'Policy created successfully.')) {
      setDraft(null);
      setEditingId(null);
    }
  };

  const setDefault = async (policy: RetentionTemplate) => {
    if (!catalog || policy.id === catalog.defaultPolicyId) return;
    await persist(catalog.policies, policy.id, policy.name + ' is now the default policy.');
  };

  const deletePolicy = async (policy: RetentionTemplate) => {
    if (!catalog || policy.id === catalog.defaultPolicyId || busy) return;
    if (!linksLoaded || linkedPlans.some(plan =>
      (plan.retentionPolicyId || catalog.defaultPolicyId) === policy.id)) {
      setError('This policy is assigned to a subscription plan or assignments could not be verified. Reassign plans before deleting.');
      return;
    }
    if (!window.confirm('Delete "' + policy.name + '"? Existing organizations keep their saved policy snapshots.')) return;
    await persist(catalog.policies.filter(row => row.id !== policy.id), catalog.defaultPolicyId,
      policy.name + ' deleted.');
  };

  const defaultPolicy = catalog?.policies.find(row => row.id === catalog.defaultPolicyId);
  return (
    <div className="w-full min-w-0 space-y-5">
      <p className="max-w-3xl text-xs leading-relaxed text-[var(--text-muted)]">
        Create reusable retention and backup policies, then assign one to each Subscription Plan.
        Every plan includes both retention and backup rules, with one platform default as the fallback.
        New organizations inherit their selected plan's policy snapshot;
        existing organization configurations do not change when a template is edited.
      </p>
      {backendNeedsUpdate && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          The platform backend has not yet been updated with policy catalog support. Existing defaults are shown read-only;
          deploy the updated backend service to create and manage reusable retention and backup policies.
        </p>
      )}
      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          <span>{error}</span>
          {!draft && <Button size="xs" type="button" variant="secondary" onClick={() => void reload()}>Reload</Button>}
        </div>
      )}

      {loading && !catalog ? (
        <p role="status" className="py-12 text-sm text-[var(--text-muted)]">Loading retention and backup policies…</p>
      ) : catalog?.policies.length ? (
        <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
          {catalog.policies.map(policy => {
            const isDefault = policy.id === catalog.defaultPolicyId;
            const assignedPlans = linkedPlans.filter(plan =>
              (plan.retentionPolicyId || catalog.defaultPolicyId) === policy.id);
            const deletionBlocked = !linksLoaded || assignedPlans.length > 0;
            return (
              <Card key={policy.id} hover padding="none" className="flex min-w-0 flex-col overflow-hidden">
                <div aria-hidden="true" className={'h-1 w-full ' +
                  (isDefault ? 'bg-blue-600' : 'bg-gradient-to-r from-violet-500 to-cyan-500')} />
                <div className="flex flex-1 flex-col gap-4 p-5">
                  <CardHeader
                    title={policy.name}
                    subtitle={<span className="font-mono text-[11px]">{policy.id}</span>}
                    icon={Database} accent={isDefault ? '#2563eb' : '#7c3aed'}
                    border={false}
                    action={isDefault ? <Badge color="blue">Default</Badge> : <Badge color="slate">Custom</Badge>}
                  />
                  <p className="min-h-[32px] text-xs leading-relaxed text-[var(--text-secondary)]">
                    {policy.description || 'Reusable retention and backup configuration.'}
                  </p>
                  <div className="space-y-2 border-t border-[var(--border)] pt-3">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-primary)]">
                      <Archive className="h-3.5 w-3.5 text-[var(--text-muted)]" /> Data retention
                    </p>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                      {RETENTION_FIELDS.slice(0, 4).map(field => (
                        <div key={field.key} className="min-w-0">
                          <dt className="truncate text-[var(--text-muted)]">{field.label}</dt>
                          <dd className="mt-0.5 font-semibold text-[var(--text-primary)]">
                            {readableRetention(policy.retention[field.key])}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <p className="text-[10px] text-[var(--text-muted)]">Plus {RETENTION_FIELDS.length - 4} additional data types</p>
                  </div>
                  {assignedPlans.length > 0 && (
                    <div className="rounded-lg border border-[var(--border)] px-3 py-2 text-[11px] text-[var(--text-secondary)]">
                      <span className="font-semibold">Used by {assignedPlans.length} subscription {assignedPlans.length === 1 ? 'plan' : 'plans'}:</span>{' '}
                      {assignedPlans.map(plan => plan.name).join(', ')}
                    </div>
                  )}
                  <div className="mt-auto rounded-lg bg-[var(--bg-subtle)] px-3 py-3">
                    <p className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                      <HardDrive className="h-4 w-4 text-[var(--text-secondary)]" />
                      {readableBackup(policy)}
                    </p>
                    {policy.backup.enabled && (
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                        Delivery to the organization admin email
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
                    <Button type="button" size="sm" variant="secondary" icon={Pencil}
                      disabled={busy || backendNeedsUpdate} onClick={() => editPolicy(policy)}>Edit</Button>
                    {!isDefault && (
                      <>
                        <Button type="button" size="sm" variant="ghost" icon={CheckCircle2}
                          disabled={busy || backendNeedsUpdate} onClick={() => void setDefault(policy)}>Set default</Button>
                        <Button type="button" size="sm" variant="ghost" icon={Trash2}
                          className="ml-auto text-rose-600 dark:text-rose-400"
                          disabled={busy || backendNeedsUpdate || deletionBlocked}
                          title={deletionBlocked ? 'Reassign linked subscription plans before deleting this policy.' : 'Delete policy'}
                          onClick={() => void deletePolicy(policy)}>Delete</Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : <EmptyState icon={ShieldCheck} heading="No policies found" message="Create a policy to get started." />}
      {defaultPolicy && (
        <p className="text-[11px] text-[var(--text-muted)]">
          Platform default: <strong className="text-[var(--text-secondary)]">{defaultPolicy.name}</strong>.
          Assign policies to <Link to="/admin/workspace-plans" className="font-semibold text-[var(--accent)] hover:underline">Subscription Plans</Link>.
          Automated backups use each organization's admin email, not a shared recipient.
        </p>
      )}

      {draft && (
        <Modal open maxWidth="max-w-4xl"
          title={editingId ? 'Edit retention & backup policy' : 'Create retention & backup policy'}
          subtitle="Define reusable retention periods and an automated backup schedule."
          onClose={closeEditor}
          footer={<>
            <Button type="button" variant="secondary" disabled={busy} onClick={closeEditor}>Cancel</Button>
            <Button type="submit" form="retention-policy-form" icon={CheckCircle2}
              variant="primary" loading={busy}>{editingId ? 'Save changes' : 'Create policy'}</Button>
          </>}>
          <form id="retention-policy-form" className="space-y-5" onSubmit={event => { event.preventDefault(); void saveDraft(); }}>
            {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={smallLabel}>Policy name *
                <input required maxLength={100} disabled={busy} className={inputClass}
                  value={draft.name}
                  onChange={event => setDraft(current => current ? { ...current, name: event.target.value } : null)}
                  placeholder="e.g. Extended retention" />
              </label>
              <label className={smallLabel}>Policy code
                <input value={editingId || newId(draft.name)} readOnly className={inputClass + ' opacity-70'} />
              </label>
              <label className={smallLabel + ' sm:col-span-2'}>Description
                <textarea maxLength={300} rows={2} disabled={busy} className={inputClass + ' resize-y'}
                  value={draft.description}
                  onChange={event => setDraft(current => current ? { ...current, description: event.target.value } : null)}
                  placeholder="When should organizations use this policy?" />
              </label>
            </div>
            <div className="border-t border-[var(--border)] pt-4">
              <h4 className="text-xs font-semibold text-[var(--text-primary)]">Data retention</h4>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                Each period defines when records are eligible for automated cleanup. Never delete disables cleanup for that data type.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {RETENTION_FIELDS.map(field => (
                  <label key={field.key} className={smallLabel}>
                    {field.label}
                    <select className={inputClass} disabled={busy}
                      value={draft.retention[field.key] ?? ''}
                      onChange={event => updateRetention(field.key, event.target.value ? Number(event.target.value) : null)}>
                      {RETENTION_DAY_OPTIONS.map(option => (
                        <option key={String(option.value)} value={option.value ?? ''}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
            <div className="border-t border-[var(--border)] pt-4">
              <h4 className="text-xs font-semibold text-[var(--text-primary)]">Automated backup</h4>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                If enabled, backup-ready links are emailed to each new organization's admin.
                Creating such an organization requires an admin email.
              </p>
              <label className="mt-3 flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-xs font-medium text-[var(--text-secondary)]">
                <input type="checkbox" checked={draft.backup.enabled} disabled={busy}
                  onChange={event => updateBackup({ enabled: event.target.checked })}
                  className="h-4 w-4 accent-blue-600" />
                Enable scheduled backups
              </label>
              {draft.backup.enabled && (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <label className={smallLabel}>Frequency
                    <select disabled={busy} className={inputClass} value={draft.backup.frequency}
                      onChange={event => updateBackup({ frequency: event.target.value as RetentionBackup['frequency'] })}>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </label>
                  <label className={smallLabel}>Keep backups for
                    <select disabled={busy} className={inputClass} value={draft.backup.retentionDays}
                      onChange={event => updateBackup({ retentionDays: Number(event.target.value) })}>
                      {BACKUP_DAY_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 rounded-lg bg-[var(--bg-subtle)] px-3 py-3 text-xs text-[var(--text-secondary)]">
              <input type="checkbox" checked={makeDefault}
                disabled={busy || editingId === catalog?.defaultPolicyId}
                onChange={event => setMakeDefault(event.target.checked)}
                className="h-4 w-4 accent-blue-600" />
              {editingId === catalog?.defaultPolicyId
                ? 'This is the platform default policy'
                : 'Make this the default for new organizations'}
            </label>
          </form>
        </Modal>
      )}
    </div>
  );
}
