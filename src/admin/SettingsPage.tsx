import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Blocks, Bot, CheckCircle2, Cpu, Edit3, Layers3,
  Plus, RefreshCw, Save, Search,
  SlidersHorizontal, Trash2, Users2,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import Widget from '../components/ui/Widget';
import KpiCard from '../components/ui/KpiCard';
import { Card, CardHeader } from '../components/ui/Card';
import FilterBar from '../components/ui/FilterBar';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import IconButton from '../components/ui/IconButton';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';

type FeatureScope = 'app' | 'capability';
type FeatureFlag = {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  scope?: FeatureScope;
  globallyEnabled?: boolean;
};
type FeatureGroup = {
  key: string;
  label: string;
  description: string;
  featureKeys: string[];
  system?: boolean;
};
type ScopeFilter = 'all' | 'app' | 'capability' | 'other';
type StatusFilter = 'all' | 'enabled' | 'disabled';

const inputClass = 'w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-blue-500/15';
const labelClass = 'block text-xs font-semibold text-[var(--text-secondary)]';

async function requireJson<T>(response: Response, fallback: string): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || fallback);
  return data as T;
}

function scopeLabel(scope?: FeatureScope): string {
  if (scope === 'app') return 'Product feature';
  if (scope === 'capability') return 'AI capability';
  return 'Other feature';
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [groups, setGroups] = useState<FeatureGroup[]>([]);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [featureQuery, setFeatureQuery] = useState('');
  const [groupQuery, setGroupQuery] = useState('');
  const [groupDraft, setGroupDraft] = useState<FeatureGroup | null>(null);
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);
  const [groupFeatureQuery, setGroupFeatureQuery] = useState('');
  const [groupError, setGroupError] = useState('');
  const [savingGroup, setSavingGroup] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [featuresRes, groupsRes] = await Promise.all([
        apiFetch('/api/platform/features'),
        apiFetch('/api/platform/feature-groups'),
      ]);
      const [features, featureGroups] = await Promise.all([
        requireJson<FeatureFlag[]>(featuresRes, 'Unable to load feature switches.'),
        requireJson<FeatureGroup[]>(groupsRes, 'Unable to load feature groups.'),
      ]);
      if (!Array.isArray(features) || !Array.isArray(featureGroups)) {
        throw new Error('The platform returned an unexpected features response.');
      }
      setFlags(features);
      setGroups(featureGroups);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'Unable to load platform features.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggleFlag = async (flag: FeatureFlag) => {
    if (togglingKey || loading) return;
    const nextEnabled = !flag.enabled;
    setTogglingKey(flag.key);
    setLoadError('');
    setNotice('');
    setFlags(current => current.map(item =>
      item.key === flag.key ? { ...item, enabled: nextEnabled } : item));
    try {
      const response = await apiFetch('/api/platform/features/' + encodeURIComponent(flag.key), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      await requireJson<unknown>(response, 'Unable to update ' + flag.label + '.');
      setNotice(flag.label + ' ' + (nextEnabled ? 'enabled' : 'disabled') + ' globally.');
    } catch (cause) {
      setFlags(current => current.map(item =>
        item.key === flag.key ? { ...item, enabled: flag.enabled } : item));
      setLoadError(cause instanceof Error ? cause.message : 'Unable to update the feature.');
    } finally {
      setTogglingKey(null);
    }
  };

  const appFeatures = useMemo(() => flags.filter(flag => flag.scope === 'app'), [flags]);
  const capabilityFlags = useMemo(() => flags.filter(flag => flag.scope === 'capability'), [flags]);
  const otherFlags = useMemo(() => flags.filter(flag => flag.scope !== 'app' && flag.scope !== 'capability'), [flags]);
  const enabledCount = flags.filter(flag => flag.enabled).length;
  const filteredFlags = useMemo(() => {
    const term = featureQuery.trim().toLowerCase();
    return flags.filter(flag => {
      if (scopeFilter === 'app' && flag.scope !== 'app') return false;
      if (scopeFilter === 'capability' && flag.scope !== 'capability') return false;
      if (scopeFilter === 'other' && (flag.scope === 'app' || flag.scope === 'capability')) return false;
      if (statusFilter === 'enabled' && !flag.enabled) return false;
      if (statusFilter === 'disabled' && flag.enabled) return false;
      return !term || (flag.label + ' ' + flag.key + ' ' + flag.description).toLowerCase().includes(term);
    });
  }, [flags, scopeFilter, statusFilter, featureQuery]);
  const filteredGroups = useMemo(() => {
    const term = groupQuery.trim().toLowerCase();
    return !term ? groups : groups.filter(group =>
      (group.label + ' ' + group.key + ' ' + group.description).toLowerCase().includes(term));
  }, [groups, groupQuery]);

  const startNewGroup = () => {
    setEditingGroupKey(null);
    setGroupDraft({ key: '', label: '', description: '', featureKeys: [] });
    setGroupError('');
    setGroupFeatureQuery('');
    setNotice('');
  };
  const startEditGroup = (group: FeatureGroup) => {
    setEditingGroupKey(group.key);
    setGroupDraft({ ...group, featureKeys: [...group.featureKeys] });
    setGroupError('');
    setGroupFeatureQuery('');
    setNotice('');
  };
  const closeGroupEditor = () => {
    if (!savingGroup) { setGroupDraft(null); setGroupError(''); }
  };
  const toggleGroupFeature = (key: string) => {
    setGroupDraft(current => current
      ? { ...current, featureKeys: current.featureKeys.includes(key)
        ? current.featureKeys.filter(item => item !== key)
        : [...current.featureKeys, key] }
      : current);
  };

  const saveGroup = async () => {
    if (!groupDraft || savingGroup) return;
    const normalizedKey = groupDraft.key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    const label = groupDraft.label.trim();
    if (!normalizedKey || !label) {
      setGroupError('Enter a group name and unique group key.');
      return;
    }
    if (editingGroupKey === null && groups.some(item => item.key === normalizedKey)) {
      setGroupError('A feature group already uses this key.');
      return;
    }
    setSavingGroup(true);
    setGroupError('');
    try {
      const response = await apiFetch('/api/platform/feature-groups', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...groupDraft, key: normalizedKey, label, description: groupDraft.description.trim() }),
      });
      const saved = await requireJson<FeatureGroup[]>(response, 'Unable to save the feature group.');
      if (!Array.isArray(saved)) throw new Error('Unexpected feature group response.');
      setGroups(saved);
      setNotice(label + ' saved successfully.');
      setGroupDraft(null);
      setEditingGroupKey(null);
    } catch (cause) {
      setGroupError(cause instanceof Error ? cause.message : 'Unable to save the group.');
    } finally {
      setSavingGroup(false);
    }
  };

  const deleteGroup = async (group: FeatureGroup) => {
    if (group.system || deletingKey) return;
    if (!window.confirm('Delete "' + group.label + '"? Organizations using this bundle may be affected.')) return;
    setDeletingKey(group.key);
    setLoadError('');
    setNotice('');
    try {
      const response = await apiFetch('/api/platform/feature-groups/' + encodeURIComponent(group.key), {
        method: 'DELETE',
      });
      const saved = await requireJson<FeatureGroup[]>(response, 'Unable to delete the feature group.');
      if (!Array.isArray(saved)) throw new Error('Unexpected feature group response.');
      setGroups(saved);
      setNotice(group.label + ' deleted.');
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'Unable to delete the group.');
    } finally {
      setDeletingKey(null);
    }
  };

  const hasFlagFilters = Boolean(featureQuery.trim() || scopeFilter !== 'all' || statusFilter !== 'all');
  const clearFlagFilters = () => {
    setFeatureQuery('');
    setScopeFilter('all');
    setStatusFilter('all');
  };
  const groupFeatures = appFeatures.filter(feature =>
    (feature.label + ' ' + feature.key).toLowerCase().includes(groupFeatureQuery.trim().toLowerCase()));

  return (
    <div className="grid grid-cols-12 gap-4 md:gap-5">
      <KpiCard colSpan={3} label="Enabled flags" value={loading ? '—' : enabledCount}
        sub={loading ? '' : flags.length + ' total platform flags'} icon={CheckCircle2}
        iconBg="#05966918" iconColor="#059669" />
      <KpiCard colSpan={3} label="Product features" value={loading ? '—' : appFeatures.length}
        icon={Blocks} iconBg="#2563eb18" iconColor="#2563eb" />
      <KpiCard colSpan={3} label="AI capabilities" value={loading ? '—' : capabilityFlags.length}
        icon={Bot} iconBg="#7c3aed18" iconColor="#7c3aed" />
      <KpiCard colSpan={3} label="Feature groups" value={loading ? '—' : groups.length}
        icon={Users2} iconBg="#0891b218" iconColor="#0891b2" />

      {(loadError || notice) && <div className="col-span-12" role={loadError ? 'alert' : 'status'}>
        <div className={'flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-xs ' +
          (loadError
            ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300')}>
          <span>{loadError || notice}</span>
          {loadError && <Button type="button" size="xs" onClick={() => void load()}>Reload</Button>}
        </div>
      </div>}

      <Widget colSpan={12} title="Feature controls"
        subtitle="Global availability for product modules and AI capabilities. Changes affect feature access across organizations."
        icon={SlidersHorizontal} accent="#2563eb" padding="none"
        action={<Button type="button" size="sm" variant="secondary" icon={RefreshCw}
          disabled={loading || Boolean(togglingKey)} onClick={() => void load()}>Refresh</Button>}>
        <div className="border-b border-[var(--border)] px-4 pt-4">
          <div className="flex flex-wrap gap-1 pb-4" aria-label="Feature category">
            {([
              ['all', 'All features', flags.length],
              ['app', 'Product features', appFeatures.length],
              ['capability', 'AI capabilities', capabilityFlags.length],
              ...(otherFlags.length ? [['other', 'Other', otherFlags.length] as const] : []),
            ] as [ScopeFilter, string, number][]).map(([key, label, count]) => (
              <button key={key} type="button" aria-pressed={scopeFilter === key}
                onClick={() => setScopeFilter(key)}
                className={'rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ' +
                  (scopeFilter === key
                    ? 'border-[var(--accent)] bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                    : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]')}>
                {label} <span className="ml-1 text-[10px] font-normal">{count}</span>
              </button>
            ))}
          </div>
          <div className="border-t border-[var(--border)] py-3">
            <FilterBar
              search={{ value: featureQuery, onChange: setFeatureQuery,
                placeholder: 'Search features, descriptions, or keys…' }}
              selects={[{
                key: 'status', label: 'Availability', value: statusFilter,
                onChange: value => setStatusFilter(value as StatusFilter),
                options: [{ label: 'All statuses', value: 'all' },
                  { label: 'Enabled', value: 'enabled' },
                  { label: 'Disabled', value: 'disabled' }],
              }]}
              hasActiveFilters={hasFlagFilters}
              onClear={clearFlagFilters}
              resultCount={{ filtered: filteredFlags.length, total: flags.length, label: 'features' }}
            />
          </div>
        </div>
        {loading && flags.length === 0 ? (
          <div role="status" className="p-8 text-sm text-[var(--text-muted)]">Loading features…</div>
        ) : filteredFlags.length === 0 ? (
          <EmptyState icon={Search} heading={flags.length ? 'No matching features' : 'No features available'}
            message={flags.length ? 'Try another category, search, or availability filter.' : 'Refresh to load the global feature catalog.'}
            action={hasFlagFilters ? <Button size="sm" onClick={clearFlagFilters}>Clear filters</Button> : undefined} />
        ) : (
          <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredFlags.map(flag => {
              const isBusy = togglingKey === flag.key;
              const Icon = flag.scope === 'app' ? Blocks : flag.scope === 'capability' ? Cpu : Layers3;
              return (
                <Card key={flag.key} padding="none" hover
                  className="relative flex min-w-0 flex-col overflow-hidden">
                  <div aria-hidden="true" className={'h-1 w-full ' +
                    (flag.scope === 'app' ? 'bg-blue-500'
                      : flag.scope === 'capability' ? 'bg-violet-500' : 'bg-slate-400')} />
                  <div className="flex flex-1 flex-col gap-4 p-4">
                    <CardHeader
                      title={flag.label}
                      subtitle={scopeLabel(flag.scope)}
                      icon={Icon}
                      accent={flag.scope === 'app' ? '#2563eb' : flag.scope === 'capability' ? '#7c3aed' : '#64748b'}
                      border={false}
                      action={<Badge color={flag.enabled ? 'green' : 'slate'}>
                        {flag.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>}
                    />
                    <p className="min-h-[44px] flex-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                      {flag.description || 'No description provided.'}
                    </p>
                    <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
                      <span className="min-w-0 truncate font-mono text-[10px] text-[var(--text-muted)]"
                        title={flag.key}>{flag.key}</span>
                      <button type="button" role="switch" aria-checked={flag.enabled}
                        aria-label={(flag.enabled ? 'Disable ' : 'Enable ') + flag.label}
                        disabled={Boolean(togglingKey) || loading}
                        onClick={() => void toggleFlag(flag)}
                        className={'relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-wait disabled:opacity-50 ' +
                          (flag.enabled ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600')}>
                        <span aria-hidden="true"
                          className={'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ' +
                            (flag.enabled ? 'translate-x-5' : 'translate-x-0')} />
                        {isBusy && <span className="sr-only">Updating</span>}
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Widget>

      <Widget colSpan={12} title="Feature groups"
        subtitle="Reusable bundles for organization and team access. Groups can include only globally available product features."
        icon={Users2} accent="#0891b2" padding="none"
        action={<IconButton icon={Plus} label="Create feature group"
          onClick={startNewGroup} disabled={loading || savingGroup} />}>
        <div className="border-b border-[var(--border)] px-4 py-3">
          <FilterBar
            search={{ value: groupQuery, onChange: setGroupQuery, placeholder: 'Search feature groups…' }}
            hasActiveFilters={Boolean(groupQuery.trim())}
            onClear={() => setGroupQuery('')}
            resultCount={{ filtered: filteredGroups.length, total: groups.length, label: 'groups' }}
            actions={<Button size="sm" variant="secondary" type="button" icon={Plus}
              disabled={loading} onClick={startNewGroup}>New group</Button>}
          />
        </div>
        {loading && groups.length === 0 ? (
          <div role="status" className="p-8 text-sm text-[var(--text-muted)]">Loading groups…</div>
        ) : filteredGroups.length === 0 ? (
          <EmptyState icon={Users2} heading={groups.length ? 'No matching groups' : 'No feature groups yet'}
            message={groups.length ? 'Try a different search.' : 'Create a feature group to reuse access settings.'}
            action={groups.length
              ? <Button size="sm" onClick={() => setGroupQuery('')}>Clear search</Button>
              : <Button size="sm" variant="primary" icon={Plus} onClick={startNewGroup}>New group</Button>} />
        ) : (
          <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredGroups.map(group => {
              const linked = group.featureKeys.map(key =>
                appFeatures.find(feature => feature.key === key)).filter((feature): feature is FeatureFlag => Boolean(feature));
              const unavailable = linked.filter(feature => !feature.enabled).length;
              return (
                <Card key={group.key} padding="none" hover className="flex min-w-0 flex-col overflow-hidden">
                  <div aria-hidden="true" className="h-1 bg-gradient-to-r from-cyan-500 to-blue-600" />
                  <div className="flex flex-1 flex-col gap-4 p-4">
                    <CardHeader title={group.label}
                      subtitle={<span className="font-mono text-[11px]">{group.key}</span>}
                      icon={Users2} accent="#0891b2" border={false}
                      action={group.system ? <Badge color="blue">System</Badge> : <Badge color="slate">Custom</Badge>}
                    />
                    <p className="min-h-[32px] text-xs leading-relaxed text-[var(--text-secondary)]">
                      {group.description || 'No description provided.'}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge color="teal">{group.featureKeys.length} features</Badge>
                      {unavailable > 0 && <Badge color="amber">{unavailable} globally disabled</Badge>}
                    </div>
                    <div className="min-h-[56px] rounded-lg bg-[var(--bg-subtle)] p-3">
                      {linked.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {linked.slice(0, 3).map(feature =>
                            <span key={feature.key} className="max-w-full truncate rounded-md border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1 text-[10px] text-[var(--text-secondary)]">
                              {feature.label}
                            </span>)}
                          {linked.length > 3 && <span className="px-1 py-1 text-[10px] text-[var(--text-muted)]">
                            +{linked.length - 3} more
                          </span>}
                        </div>
                      ) : <p className="text-xs text-[var(--text-muted)]">No features assigned</p>}
                    </div>
                    <div className="mt-auto flex items-center justify-end gap-2 border-t border-[var(--border)] pt-3">
                      {!group.system && <Button type="button" size="xs" variant="danger" icon={Trash2}
                        loading={deletingKey === group.key} disabled={Boolean(deletingKey)}
                        onClick={() => void deleteGroup(group)}>Delete</Button>}
                      <Button type="button" size="sm" variant="secondary" icon={Edit3}
                        disabled={Boolean(deletingKey)} onClick={() => startEditGroup(group)}>Edit group</Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Widget>

      {groupDraft && <Modal open maxWidth="max-w-3xl"
        title={editingGroupKey !== null ? 'Edit feature group' : 'Create feature group'}
        subtitle="Choose the globally available product features to include in this reusable bundle."
        onClose={closeGroupEditor}
        footer={<>
          <Button type="button" variant="secondary" disabled={savingGroup} onClick={closeGroupEditor}>Cancel</Button>
          <Button type="button" variant="primary" icon={Save} loading={savingGroup}
            disabled={!groupDraft.key.trim() || !groupDraft.label.trim()}
            onClick={() => void saveGroup()}>Save group</Button>
        </>}>
        <div className="space-y-5">
          {groupError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
            {groupError}
          </div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>Group name
              <input className={inputClass + ' mt-1.5'} required value={groupDraft.label}
                disabled={savingGroup} placeholder="e.g. Growth Team"
                onChange={event => setGroupDraft(current => current ? { ...current, label: event.target.value } : current)} />
            </label>
            <label className={labelClass}>Group key
              <input className={inputClass + ' mt-1.5'} required value={groupDraft.key}
                disabled={editingGroupKey !== null || savingGroup} placeholder="e.g. growth_team"
                onChange={event => setGroupDraft(current => current
                  ? { ...current, key: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') } : current)} />
            </label>
          </div>
          <label className={labelClass}>Description
            <textarea className={inputClass + ' mt-1.5 resize-y'} rows={2} value={groupDraft.description}
              disabled={savingGroup} placeholder="Describe who this bundle is for"
              onChange={event => setGroupDraft(current => current ? { ...current, description: event.target.value } : current)} />
          </label>
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-[var(--text-primary)]">Included features</p>
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                  {groupDraft.featureKeys.length} selected · Globally disabled features cannot be added.
                </p>
              </div>
              <Badge color="blue">{groupDraft.featureKeys.length} selected</Badge>
            </div>
            <input className={inputClass} value={groupFeatureQuery} placeholder="Find product features…"
              onChange={event => setGroupFeatureQuery(event.target.value)} aria-label="Search group features" />
            <div className="mt-3 grid max-h-64 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              {groupFeatures.map(feature => {
                const selected = groupDraft.featureKeys.includes(feature.key);
                const cannotAdd = !feature.enabled && !selected;
                return (
                  <button key={feature.key} type="button" disabled={savingGroup || cannotAdd}
                    aria-pressed={selected} onClick={() => toggleGroupFeature(feature.key)}
                    className={'flex min-w-0 items-start gap-3 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ' +
                      (selected
                        ? 'border-[var(--accent)] bg-[var(--bg-subtle)]'
                        : 'border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]')}>
                    <span className={'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ' +
                      (selected ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--border)]')}>
                      {selected ? '✓' : ''}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-[var(--text-primary)]">{feature.label}</span>
                      <span className="mt-1 block text-[10px] text-[var(--text-muted)]">
                        {feature.enabled ? 'Available' : 'Globally disabled'}
                      </span>
                    </span>
                  </button>
                );
              })}
              {groupFeatures.length === 0 && <p className="col-span-full py-4 text-center text-xs text-[var(--text-muted)]">
                No matching product features.
              </p>}
            </div>
          </div>
        </div>
      </Modal>}
    </div>
  );
}
