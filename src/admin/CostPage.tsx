import React, { useEffect, useState } from 'react';
import { Loader2, Save, Phone, Cpu, Archive, Zap } from 'lucide-react';
import { apiFetch } from '../lib/api';
import Widget from '../components/ui/Widget';
import KpiCard from '../components/ui/KpiCard';
import DataTable, { Column } from '../components/ui/DataTable';
import FilterBar from '../components/ui/FilterBar';

// Every provider's identity (key/kind/label) is defined in code — see the
// backend's platform/costProviders.js KNOWN_PROVIDERS. This page can only
// adjust an existing provider's rate/tax/active state, never add or
// remove one: support for a new provider (Twilio, etc.) is a code
// change, and it then just shows up here with a zero rate to fill in.
type CostProvider = {
  key: string;
  kind: 'call' | 'ai';
  label: string;
  active: boolean;
  taxPercent: number;
  // call kind
  rateUnit?: 'minute' | 'hour';
  rateAmount?: number;
  // ai kind — ratePer1kTokens is "the rate, quoted per tokenUnit tokens"
  // (name kept for backward compat; tokenUnit itself is configurable now,
  // not fixed at 1,000).
  pricingMode?: 'token' | 'time';
  ratePer1kTokens?: number;
  tokenUnit?: number;
  timeRateAmount?: number;
  timeUnit?: 'minute' | 'second';
  updatedAt?: string;
};

const TOKEN_UNIT_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'token' },
  { value: 100, label: '100 tokens' },
  { value: 1000, label: '1,000 tokens' },
  { value: 1000000, label: '1,000,000 tokens' },
];

// Mirrors the backend's costProviders.getPrimaryCallProviderRate — a call
// provider's rate normalized to per-minute (halved from an hourly rate)
// with tax applied, so the admin's KPI matches what org-facing billing
// screens actually show.
function perMinuteRate(p: CostProvider): number {
  const base = p.rateUnit === 'hour' ? (p.rateAmount ?? 0) / 60 : (p.rateAmount ?? 0);
  const withTax = base * (1 + (p.taxPercent ?? 0) / 100);
  return Math.round(withTax * 100) / 100;
}

// A permanent cost snapshot taken right before an org was deleted — see
// backend platform/admin.js's deleteOrganization + db.archiveOrgCost.
// The org itself, its call logs, and its accrued counters are gone; this
// is the only place that org's final cost figures still exist.
type CostArchiveEntry = {
  id: string;
  orgId: string;
  orgName: string | null;
  workspaceName: string | null;
  industry: string | null;
  deletedAt: string;
  deletedByEmail: string | null;
  aiMinutesUsed: number | null;
  aiMinutesCostInr: number | null;
  phoneCharges: number | null;
  callProviderLabel: string | null;
  aiTotalTokens: number | null;
  aiTokenProviderLabel: string | null;
  aiTokenTotalCostInr: number | null;
};

export default function CostPage() {
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<CostProvider[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [archive, setArchive] = useState<CostArchiveEntry[]>([]);
  const [loadingArchive, setLoadingArchive] = useState(true);
  const [archiveQuery, setArchiveQuery] = useState('');

  const load = () => {
    setLoading(true);
    apiFetch('/api/platform/cost-providers')
      .then((r) => r.json())
      .then((data) => setProviders(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));

    setLoadingArchive(true);
    apiFetch('/api/platform/cost-archive')
      .then((r) => r.json())
      .then((data) => setArchive(Array.isArray(data) ? data : []))
      .finally(() => setLoadingArchive(false));
  };

  useEffect(load, []);

  const callProviders = providers.filter((p) => p.kind === 'call');
  const aiProviders = providers.filter((p) => p.kind === 'ai');

  const updateLocal = (key: string, patch: Partial<CostProvider>) => {
    setProviders((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  };

  const saveProvider = async (provider: CostProvider) => {
    setSavingKey(provider.key);
    setError('');
    try {
      const res = await apiFetch(`/api/platform/cost-providers/${provider.key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(provider),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      updateLocal(provider.key, data);
      setSavedKey(provider.key);
      setTimeout(() => setSavedKey((k) => (k === provider.key ? null : k)), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to save provider');
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-[var(--text-muted)]"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>;
  }

  const filteredArchive = archive.filter((row) => {
    const q = archiveQuery.trim().toLowerCase();
    if (!q) return true;
    return (row.orgName || '').toLowerCase().includes(q)
      || (row.workspaceName || '').toLowerCase().includes(q)
      || (row.industry || '').toLowerCase().includes(q)
      || (row.deletedByEmail || '').toLowerCase().includes(q);
  });

  const archiveColumns: Column<CostArchiveEntry>[] = [
    { key: 'organization', header: 'Organization', cell: (row) => <><p className="font-semibold text-[var(--text-primary)]">{row.orgName || row.orgId}</p><p className="text-[10px] text-[var(--text-muted)]">{row.industry || '—'}</p></> },
    { key: 'deleted', header: 'Deleted', cell: (row) => <><span className="text-[var(--text-secondary)]">{new Date(row.deletedAt).toLocaleDateString()}</span>{row.deletedByEmail && <p className="text-[10px] text-[var(--text-muted)]">{row.deletedByEmail}</p>}</> },
    { key: 'minutes', header: 'AI Minutes', cell: (row) => <span className="font-mono">{(row.aiMinutesUsed ?? 0).toFixed(2)}</span> },
    { key: 'callCost', header: 'Call Cost', cell: (row) => <span className="font-mono">₹{(row.phoneCharges ?? 0).toFixed(2)}{row.callProviderLabel && <span className="text-[10px] text-[var(--text-muted)] ml-1">({row.callProviderLabel})</span>}</span> },
    { key: 'tokens', header: 'Tokens', cell: (row) => <span className="font-mono">{(row.aiTotalTokens ?? 0).toLocaleString()}</span> },
    { key: 'tokenCost', header: 'Token Cost', cell: (row) => <span className="font-mono">{row.aiTokenTotalCostInr != null ? `₹${row.aiTokenTotalCostInr.toFixed(2)}` : '—'}{row.aiTokenProviderLabel && <span className="text-[10px] text-[var(--text-muted)] ml-1">({row.aiTokenProviderLabel})</span>}</span> },
  ];

  const activeCallProviderCount = callProviders.filter((p) => p.active).length;
  const activeAiProviderCount = aiProviders.filter((p) => p.active).length;

  // The org-facing "AI voice cost per minute" (Billing & Usage, Reports,
  // Dashboard, etc.) is no longer a separate manually-set number — it's
  // this same active call provider's own rate (tax included, converted to
  // per-minute if quoted per-hour). Only Vobiz exists today; once a
  // second call provider is added, whichever is marked active here
  // becomes this figure automatically.
  const primaryCallProvider = callProviders.find((p) => p.active && (p.rateAmount ?? 0) > 0);
  const costPerMinuteInr = primaryCallProvider ? perMinuteRate(primaryCallProvider) : 0;

  return (
    <div className="grid grid-cols-12 gap-5">
      {error && (
        <div className="col-span-12 bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-xl px-4 py-3">{error}</div>
      )}

      <KpiCard colSpan={3} label="Cost per minute" value={`₹${costPerMinuteInr || 0}`} icon={Zap} iconBg="#f59e0b1a" iconColor="#f59e0b" />
      <KpiCard colSpan={3} label="Active call providers" value={activeCallProviderCount} icon={Phone} iconBg="#0d94881a" iconColor="#0d9488" />
      <KpiCard colSpan={3} label="Active AI providers" value={activeAiProviderCount} icon={Cpu} iconBg="#4a3aa71a" iconColor="#4a3aa7" />
      <KpiCard colSpan={3} label="Deleted orgs archived" value={archive.length} icon={Archive} iconBg="#b453091a" iconColor="#b45309" />

      <ProviderSection
        title="Call providers"
        description="Telephony providers this codebase integrates with, billed per minute/hour plus tax. The AI voice cost per minute shown across Billing & Usage, Reports, and Dashboard is derived live from whichever provider here is active — Vobiz is the only one wired up today; a future provider becomes that source the moment it's marked active with a rate set."
        icon={Phone}
        kind="call"
        providers={callProviders}
        savingKey={savingKey}
        savedKey={savedKey}
        onChange={updateLocal}
        onSave={saveProvider}
      />

      <ProviderSection
        title="AI providers"
        description="AI-model providers this codebase integrates with, billed either by token count or by elapsed time (minute/second), plus tax. Live-voice and post-call-agent usage are priced separately since they're different models — applied against each org's actual Gemini token usage for the current billing period."
        icon={Cpu}
        kind="ai"
        providers={aiProviders}
        savingKey={savingKey}
        savedKey={savedKey}
        onChange={updateLocal}
        onSave={saveProvider}
      />

      <Widget
        colSpan={12}
        title="Deleted organizations"
        subtitle="Final cost snapshot taken right before each org was deleted — the org, its call data, and its live counters are gone, but the cost/billing record is kept permanently."
        icon={Archive}
        accent="#b45309"
        padding="none"
      >
        <div className="p-4 pb-0">
        <FilterBar
          search={{ value: archiveQuery, onChange: setArchiveQuery, placeholder: 'Search deleted organizations…' }}
          resultCount={{ filtered: filteredArchive.length, total: archive.length, label: 'archived organizations' }}
        />
        </div>
        <div className="mt-3 min-w-0">
          <DataTable
            bare
            resizable
            columns={archiveColumns}
            rows={filteredArchive}
            rowKey={(row) => row.id}
            loading={loadingArchive}
            emptyMessage={archiveQuery ? `No deleted organizations match "${archiveQuery}"` : 'No organizations have been deleted yet.'}
            paginated
            defaultPageSize={25}
          />
        </div>
      </Widget>
    </div>
  );
}

function ProviderSection({
  title, description, icon: Icon, kind, providers, savingKey, savedKey, onChange, onSave,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  kind: 'call' | 'ai';
  providers: CostProvider[];
  savingKey: string | null;
  savedKey: string | null;
  onChange: (key: string, patch: Partial<CostProvider>) => void;
  onSave: (provider: CostProvider) => void;
}) {
  return (
    <Widget colSpan={12} title={title} subtitle={description} icon={Icon} accent="#f59e0b" padding="md">
      <div className="space-y-3">
        {providers.map((p) => (
          <ProviderRow
            key={p.key}
            kind={kind}
            provider={p}
            savingKey={savingKey}
            savedKey={savedKey}
            onChange={onChange}
            onSave={onSave}
          />
        ))}

        {providers.length === 0 && (
          <div className="py-8 text-center text-[var(--text-muted)] dark:text-[var(--text-muted)] text-xs">
            No {kind === 'call' ? 'call' : 'AI'} providers are integrated in code yet.
          </div>
        )}
      </div>
    </Widget>
  );
}

function ProviderRow({
  kind, provider: p, savingKey, savedKey, onChange, onSave,
}: {
  kind: 'call' | 'ai';
  provider: CostProvider;
  savingKey: string | null;
  savedKey: string | null;
  onChange: (key: string, patch: Partial<CostProvider>) => void;
  onSave: (provider: CostProvider) => void;
}) {
  return (
    <div className="my-3 flex flex-wrap items-end gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] p-5">
      <div className="min-w-[160px] flex-1">
        <p className="text-sm font-semibold text-slate-800 dark:text-[var(--text-primary)]">{p.label}</p>
        <p className="text-[10px] text-[var(--text-muted)] dark:text-[var(--text-muted)] font-mono">{p.key}</p>
      </div>

      {kind === 'call' ? (
        <>
          <Field label="Rate (INR)">
            <input
              type="number" min="0" step="0.01"
              value={p.rateAmount ?? 0}
              onChange={(e) => onChange(p.key, { rateAmount: Number(e.target.value) })}
              className="w-32 bg-[var(--bg-surface)] dark:bg-[var(--bg-subtle)] border border-[var(--border)] dark:border-[var(--border)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </Field>
          <Field label="Per">
            <select
              value={p.rateUnit ?? 'minute'}
              onChange={(e) => onChange(p.key, { rateUnit: e.target.value as 'minute' | 'hour' })}
              className="bg-slate-50 dark:bg-[var(--bg-subtle)] border border-[var(--border)] dark:border-[var(--border)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="minute">Minute</option>
              <option value="hour">Hour</option>
            </select>
          </Field>
        </>
      ) : (
        <>
          <Field label="Billing">
            <select
              value={p.pricingMode ?? 'token'}
              onChange={(e) => onChange(p.key, { pricingMode: e.target.value as 'token' | 'time' })}
              className="bg-slate-50 dark:bg-[var(--bg-subtle)] border border-[var(--border)] dark:border-[var(--border)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="token">Token based</option>
              <option value="time">Time based</option>
            </select>
          </Field>
          {p.pricingMode === 'time' ? (
            <>
              <Field label="Cost (INR)">
                <input
                  type="number" min="0" step="0.0001"
                  value={p.timeRateAmount ?? 0}
                  onChange={(e) => onChange(p.key, { timeRateAmount: Number(e.target.value) })}
                  className="w-32 bg-[var(--bg-surface)] dark:bg-[var(--bg-subtle)] border border-[var(--border)] dark:border-[var(--border)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </Field>
              <Field label="Per">
                <select
                  value={p.timeUnit ?? 'minute'}
                  onChange={(e) => onChange(p.key, { timeUnit: e.target.value as 'minute' | 'second' })}
                  className="bg-slate-50 dark:bg-[var(--bg-subtle)] border border-[var(--border)] dark:border-[var(--border)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="minute">Minute</option>
                  <option value="second">Second</option>
                </select>
              </Field>
            </>
          ) : (
            <>
              <Field label="Cost (INR)">
                <input
                  type="number" min="0" step="0.0001"
                  value={p.ratePer1kTokens ?? 0}
                  onChange={(e) => onChange(p.key, { ratePer1kTokens: Number(e.target.value) })}
                  className="w-32 bg-[var(--bg-surface)] dark:bg-[var(--bg-subtle)] border border-[var(--border)] dark:border-[var(--border)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </Field>
              <Field label="Per">
                <select
                  value={p.tokenUnit ?? 1000}
                  onChange={(e) => onChange(p.key, { tokenUnit: Number(e.target.value) })}
                  className="bg-slate-50 dark:bg-[var(--bg-subtle)] border border-[var(--border)] dark:border-[var(--border)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  {TOKEN_UNIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            </>
          )}
        </>
      )}

      <Field label="Tax %">
        <input
          type="number" min="0" max="100" step="0.01"
          value={p.taxPercent ?? 0}
          onChange={(e) => onChange(p.key, { taxPercent: Number(e.target.value) })}
          className="w-24 bg-[var(--bg-surface)] dark:bg-[var(--bg-subtle)] border border-[var(--border)] dark:border-[var(--border)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </Field>

      <Field label="Active">
        <select
          value={p.active ? '1' : '0'}
          onChange={(e) => onChange(p.key, { active: e.target.value === '1' })}
          className="bg-slate-50 dark:bg-[var(--bg-subtle)] border border-[var(--border)] dark:border-[var(--border)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
        >
          <option value="1">Active</option>
          <option value="0">Inactive</option>
        </select>
      </Field>

      <div className="flex items-center gap-2 ml-auto">
        {savedKey === p.key && <span className="text-xs text-emerald-600 font-medium">Saved</span>}
        <button
          type="button"
          onClick={() => onSave(p)}
          disabled={savingKey === p.key}
          className="flex items-center gap-1.5 bg-[var(--accent)] text-white text-xs font-medium px-3 py-2 rounded-xl hover:bg-slate-800 disabled:opacity-50"
        >
          {savingKey === p.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-[var(--text-muted)] dark:text-[var(--text-muted)] uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  );
}
