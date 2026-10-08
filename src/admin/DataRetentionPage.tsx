import React, { useEffect, useState } from 'react';
import { Database, Loader2, Save } from 'lucide-react';
import { apiFetch } from '../lib/api';
import Widget from '../components/ui/Widget';

const retentionTypes = [
  ['call_recordings', 'Call recordings', 365], ['transcripts', 'Transcripts', 365], ['ai_summaries', 'AI summaries', 730],
  ['call_logs', 'Call logs', 730], ['campaign_history', 'Campaign history', 365], ['audit_logs', 'Audit logs', 730],
  ['documents', 'Uploaded documents', 365], ['contacts', 'Contacts', 365],
] as const;

export default function DataRetentionPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [retention, setRetention] = useState<Record<string, number | null>>({});

  useEffect(() => {
    apiFetch('/api/platform/data-retention/defaults').then(r => r.json()).then(data => setRetention(data && typeof data === 'object' ? data : {})).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/platform/data-retention/defaults', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ policy: retention }) });
      if (!res.ok) throw new Error('Failed to save retention defaults');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-16 text-[var(--text-muted)]"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading retention policy…</div>;

  return <div className="grid grid-cols-12 gap-5">
    <Widget colSpan={12} title="Platform retention policy" subtitle="Super Admin defaults used by organizations that inherit the platform policy." padding="md">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {retentionTypes.map(([key, label, defaultDays]) => {
          const hasValue = Object.prototype.hasOwnProperty.call(retention, key);
          const value = hasValue ? retention[key] : defaultDays;
          return <div key={key} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4"><label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mb-1">{label}</label>
            <select value={value == null ? '' : String(value)} onChange={e => setRetention(prev => ({ ...prev, [key]: e.target.value === '' ? null : Number(e.target.value) }))} className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20">
              <option value="">Never</option><option value="30">30 days</option><option value="90">90 days</option><option value="180">180 days</option><option value="365">1 year</option><option value="730">2 years</option><option value="1095">3 years</option><option value="1825">5 years</option>
            </select>
          </div>;
        })}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-[var(--bg-subtle)] dark:bg-[var(--bg-subtle)] p-3">
        <div><div className="text-xs font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Platform policy</div><div className="text-[10px] text-[var(--text-muted)] mt-0.5">Organizations can override these defaults individually.</div></div>
        <button type="button" disabled={saving} onClick={save} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Save className="h-3.5 w-3.5" /> {saving ? 'Saving…' : 'Save defaults'}</button>
      </div>
    </Widget>
    <Widget colSpan={12} title="How retention works" subtitle="Platform defaults are applied when an organization uses the default retention mode. Organization-specific overrides are managed from the organization detail page." padding="md">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] dark:border-[var(--border)] p-4"><div className="text-sm font-semibold">1. Platform default</div><div className="mt-1 text-xs text-[var(--text-muted)]">Set the baseline policy here.</div></div>
        <div className="rounded-xl border border-[var(--border)] dark:border-[var(--border)] p-4"><div className="text-sm font-semibold">2. Organization override</div><div className="mt-1 text-xs text-[var(--text-muted)]">Customize individual data types from an organization.</div></div>
        <div className="rounded-xl border border-[var(--border)] dark:border-[var(--border)] p-4"><div className="text-sm font-semibold">3. Automated cleanup</div><div className="mt-1 text-xs text-[var(--text-muted)]">The retention worker enforces the resolved policy and handles configured backups.</div></div>
      </div>
    </Widget>
  </div>;
}
