import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, ToggleLeft, ToggleRight, ListChecks, Users2, Plus, Trash2, Save, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { apiFetch } from '../lib/api';
import Widget from '../components/ui/Widget';
import KpiCard from '../components/ui/KpiCard';

type FeatureFlag = { key: string; label: string; description: string; enabled: boolean; scope?: 'app' | 'capability'; globallyEnabled?: boolean };
type FeatureGroup = { key: string; label: string; description: string; featureKeys: string[]; system?: boolean };

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [groups, setGroups] = useState<FeatureGroup[]>([]);
  const [savingGroup, setSavingGroup] = useState(false);
  const [groupDraft, setGroupDraft] = useState<FeatureGroup | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [featuresRes, groupsRes] = await Promise.all([apiFetch('/api/platform/features'), apiFetch('/api/platform/feature-groups')]);
      const [features, featureGroups] = await Promise.all([featuresRes.json(), groupsRes.json()]);
      setFlags(Array.isArray(features) ? features : []);
      setGroups(Array.isArray(featureGroups) ? featureGroups : []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const toggleFlag = async (flag: FeatureFlag) => {
    setTogglingKey(flag.key);
    const nextEnabled = !flag.enabled;
    setFlags(prev => prev.map(f => f.key === flag.key ? { ...f, enabled: nextEnabled } : f));
    try {
      const res = await apiFetch('/api/platform/features/' + encodeURIComponent(flag.key), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: nextEnabled }) });
      if (!res.ok) throw new Error('Failed to update feature');
    } catch {
      setFlags(prev => prev.map(f => f.key === flag.key ? { ...f, enabled: flag.enabled } : f));
    } finally { setTogglingKey(null); }
  };

  const appFeatures = useMemo(() => flags.filter(f => f.scope === 'app'), [flags]);
  const capabilityFlags = useMemo(() => flags.filter(f => f.scope === 'capability'), [flags]);
  const unknownFlags = useMemo(() => flags.filter(f => f.scope !== 'app' && f.scope !== 'capability'), [flags]);
  const enabledCount = flags.filter(f => f.enabled).length;

  if (loading) return <div className="flex items-center justify-center py-16 text-[var(--text-muted)]"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading features…</div>;

  const renderFlags = (items: FeatureFlag[]) => (
    <div className="divide-y divide-[var(--border)]">
      {items.map(flag => (
        <div key={flag.key} className="flex items-center justify-between gap-4 rounded-xl px-3 py-4 transition-colors hover:bg-[var(--bg-subtle)]">
          <div className="min-w-0 pr-4">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-sm font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)]">{flag.label}</div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--text-muted)] dark:bg-[var(--bg-subtle)] dark:text-[var(--text-muted)]">{flag.key}</span>
            </div>
            <div className="mt-0.5 text-xs text-[var(--text-muted)] dark:text-[var(--text-muted)]">{flag.description}</div>
          </div>
          <button type="button" onClick={() => toggleFlag(flag)} disabled={togglingKey === flag.key} className="shrink-0 rounded-lg disabled:opacity-50" aria-label={'Toggle ' + flag.label}>
            {flag.enabled ? <ToggleRight className="h-8 w-8 text-emerald-500" /> : <ToggleLeft className="h-8 w-8 text-slate-300" />}
          </button>
        </div>
      ))}
      {items.length === 0 && <div className="py-8 text-center text-xs text-[var(--text-muted)]">No flags in this category.</div>}
    </div>
  );

  return (
    <div className="grid grid-cols-12 gap-5">
      <KpiCard colSpan={3} label="Enabled" value={`${enabledCount} / ${flags.length}`} icon={ListChecks} iconBg="#1baf7a1a" iconColor="#1baf7a" />
      <KpiCard colSpan={3} label="Product features" value={appFeatures.length} icon={SlidersHorizontal} iconBg="#6366f11a" iconColor="#6366f1" />
      <KpiCard colSpan={3} label="AI capabilities" value={capabilityFlags.length} icon={ShieldCheck} iconBg="#f59e0b1a" iconColor="#f59e0b" />
      <KpiCard colSpan={3} label="Disabled" value={flags.filter(f => !f.enabled).length} icon={ToggleLeft} iconBg="#ef44441a" iconColor="#ef4444" />

      <Widget colSpan={12} title="Product features" subtitle="Global switches for features that can be assigned to organizations and teams." padding="md">{renderFlags(appFeatures)}</Widget>
      <Widget colSpan={12} title="AI capability flags" subtitle="Global runtime controls. Disabling a capability removes it from product behavior even if an organization previously had access." padding="md">{renderFlags(capabilityFlags)}</Widget>
      {unknownFlags.length > 0 && <Widget colSpan={12} title="Other feature flags" subtitle="Flags returned by the platform API that do not have a recognized scope." padding="md">{renderFlags(unknownFlags)}</Widget>}

      <Widget colSpan={12} title="Feature groups" subtitle="Reusable organization/team bundles. Globally disabled product features cannot be selected." padding="md">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]"><Users2 className="h-4 w-4" /> Groups</div>
          <button type="button" onClick={() => setGroupDraft({ key: '', label: '', description: '', featureKeys: [] })} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white"><Plus className="h-3.5 w-3.5" /> New group</button>
        </div>
        <div className="space-y-2">
          {groups.map(group => (
            <div key={group.key} className="flex items-center justify-between rounded-2xl border border-[var(--border)] dark:border-[var(--border)] px-3 py-3">
              <div><div className="text-sm font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)]">{group.label}</div><div className="text-xs text-[var(--text-muted)]">{group.description || 'No description'} · {group.featureKeys.length} features</div></div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setGroupDraft({ ...group })} className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs">Edit</button>
                {!group.system && <button type="button" onClick={async () => { await apiFetch('/api/platform/feature-groups/' + encodeURIComponent(group.key), { method: 'DELETE' }); load(); }} className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
          ))}
        </div>
        {groupDraft && (
          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] dark:bg-[var(--bg-subtle)] p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <input value={groupDraft.key} disabled={!!groupDraft.system} onChange={e => setGroupDraft({ ...groupDraft, key: e.target.value })} placeholder="Group key" className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs" />
              <input value={groupDraft.label} onChange={e => setGroupDraft({ ...groupDraft, label: e.target.value })} placeholder="Group name" className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs" />
            </div>
            <input value={groupDraft.description} onChange={e => setGroupDraft({ ...groupDraft, description: e.target.value })} placeholder="Description" className="mt-3 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs" />
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {appFeatures.map(feature => {
                const selected = groupDraft.featureKeys.includes(feature.key);
                return <button type="button" key={feature.key} onClick={() => setGroupDraft({ ...groupDraft, featureKeys: selected ? groupDraft.featureKeys.filter(k => k !== feature.key) : [...groupDraft.featureKeys, feature.key] })} disabled={!feature.enabled} className={`rounded-lg border px-3 py-2 text-left text-xs ${selected ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'} ${!feature.enabled ? 'opacity-40' : ''}`}><div className="font-semibold">{feature.label}</div><div className="mt-0.5 text-[10px] text-[var(--text-muted)]">{feature.enabled ? 'Available' : 'Globally disabled'}</div></button>;
              })}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setGroupDraft(null)} className="rounded-lg px-3 py-2 text-xs text-[var(--text-muted)]">Cancel</button>
              <button type="button" disabled={savingGroup || !groupDraft.key || !groupDraft.label} onClick={async () => { setSavingGroup(true); try { await apiFetch('/api/platform/feature-groups', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(groupDraft) }); setGroupDraft(null); await load(); } finally { setSavingGroup(false); } }} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Save className="h-3.5 w-3.5" /> Save group</button>
            </div>
          </div>
        )}
      </Widget>
    </div>
  );
}
