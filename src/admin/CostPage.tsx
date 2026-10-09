import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, Cpu, Phone, RefreshCw, RotateCcw, Zap } from 'lucide-react';
import { apiFetch } from '../lib/api';
import Widget from '../components/ui/Widget';
import KpiCard from '../components/ui/KpiCard';
import DataTable, { Column } from '../components/ui/DataTable';
import FilterBar from '../components/ui/FilterBar';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { formatInr } from '../lib/pricing';

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


type PricingTab = 'call' | 'ai';
const FIELD_CLASS = 'w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60';

function providerSnapshot(provider: CostProvider): string {
  return JSON.stringify({
    active: provider.active,
    taxPercent: provider.taxPercent,
    rateUnit: provider.rateUnit,
    rateAmount: provider.rateAmount,
    pricingMode: provider.pricingMode,
    ratePer1kTokens: provider.ratePer1kTokens,
    tokenUnit: provider.tokenUnit,
    timeRateAmount: provider.timeRateAmount,
    timeUnit: provider.timeUnit,
  });
}

function validProvider(provider: CostProvider): boolean {
  const validAmount = (value: number | undefined) => value != null && Number.isFinite(value) && value >= 0;
  if (!validAmount(provider.taxPercent) || provider.taxPercent > 100) return false;
  if (provider.kind === 'call') return validAmount(provider.rateAmount);
  return (provider.pricingMode ?? 'time') === 'time'
    ? validAmount(provider.timeRateAmount)
    : validAmount(provider.ratePer1kTokens);
}

function effectiveCost(provider: CostProvider): { amount: string; unit: string } {
  const taxMultiplier = 1 + (provider.taxPercent || 0) / 100;
  const base = provider.kind === 'call'
    ? provider.rateUnit === 'hour' ? (provider.rateAmount || 0) / 60 : (provider.rateAmount || 0)
    : provider.pricingMode === 'token' ? (provider.ratePer1kTokens || 0) : (provider.timeRateAmount || 0);
  const unit = provider.kind === 'call'
    ? 'minute'
    : provider.pricingMode === 'token' ? String(provider.tokenUnit || 1000) + ' tokens' : (provider.timeUnit || 'minute');
  return {
    amount: '₹' + (base * taxMultiplier).toLocaleString('en-IN', {
      minimumFractionDigits: 2, maximumFractionDigits: 4,
    }),
    unit,
  };
}

export default function CostPage() {
  const [providers, setProviders] = useState<CostProvider[]>([]);
  const [savedProviders, setSavedProviders] = useState<CostProvider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [providersError, setProvidersError] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [pricingTab, setPricingTab] = useState<PricingTab>('call');

  const [archive, setArchive] = useState<CostArchiveEntry[]>([]);
  const [loadingArchive, setLoadingArchive] = useState(true);
  const [archiveError, setArchiveError] = useState('');
  const [archiveQuery, setArchiveQuery] = useState('');
  const [archiveIndustry, setArchiveIndustry] = useState('');

  const loadProviders = useCallback(async () => {
    setLoadingProviders(true);
    setProvidersError('');
    try {
      const response = await apiFetch('/api/platform/cost-providers');
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Unable to load provider pricing.');
      const next = Array.isArray(body) ? body as CostProvider[] : [];
      setProviders(next);
      setSavedProviders(next.map(provider => ({ ...provider })));
      setSaveErrors({});
      setSavedKey(null);
    } catch (reason) {
      setProvidersError(reason instanceof Error ? reason.message : 'Unable to load provider pricing.');
    } finally {
      setLoadingProviders(false);
    }
  }, []);

  const loadArchive = useCallback(async () => {
    setLoadingArchive(true);
    setArchiveError('');
    try {
      const response = await apiFetch('/api/platform/cost-archive');
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Unable to load deleted organizations.');
      setArchive(Array.isArray(body) ? body as CostArchiveEntry[] : []);
    } catch (reason) {
      setArchiveError(reason instanceof Error ? reason.message : 'Unable to load deleted organizations.');
    } finally {
      setLoadingArchive(false);
    }
  }, []);

  useEffect(() => {
    void loadProviders();
    void loadArchive();
  }, [loadProviders, loadArchive]);

  const updateLocal = (key: string, patch: Partial<CostProvider>) => {
    setProviders(current => current.map(provider => provider.key === key ? { ...provider, ...patch } : provider));
    setSavedKey(previous => previous === key ? null : previous);
    setSaveErrors(previous => {
      if (!previous[key]) return previous;
      const next = { ...previous };
      delete next[key];
      return next;
    });
  };

  const resetProvider = (key: string) => {
    const saved = savedProviders.find(provider => provider.key === key);
    if (!saved) return;
    updateLocal(key, { ...saved });
  };

  const saveProvider = async (provider: CostProvider) => {
    if (savingKey) return;
    if (!validProvider(provider)) {
      setSaveErrors(previous => ({ ...previous, [provider.key]: 'Enter a valid non-negative rate and a tax percentage between 0 and 100.' }));
      return;
    }
    setSavingKey(provider.key);
    setSaveErrors(previous => ({ ...previous, [provider.key]: '' }));
    try {
      const response = await apiFetch('/api/platform/cost-providers/' + encodeURIComponent(provider.key), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(provider),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to save provider pricing.');
      const saved = body as CostProvider;
      setProviders(current => current.map(row => row.key === provider.key ? saved : row));
      setSavedProviders(current => current.map(row => row.key === provider.key ? { ...saved } : row));
      setSavedKey(provider.key);
      window.setTimeout(() => setSavedKey(current => current === provider.key ? null : current), 3500);
    } catch (reason) {
      setSaveErrors(previous => ({ ...previous, [provider.key]:
        reason instanceof Error ? reason.message : 'Unable to save provider pricing.' }));
    } finally {
      setSavingKey(null);
    }
  };

  const activeCallProviders = savedProviders.filter(provider => provider.kind === 'call' && provider.active);
  const activeAiProviders = savedProviders.filter(provider => provider.kind === 'ai' && provider.active);
  const primaryCallProvider = activeCallProviders.find(provider => (provider.rateAmount ?? 0) > 0);
  const callRate = primaryCallProvider ? formatInr(perMinuteRate(primaryCallProvider)) : '—';

  const archiveIndustries = useMemo(() =>
    [...new Set(archive.map(row => row.industry).filter((industry): industry is string => Boolean(industry)))].sort(),
    [archive]);
  const filteredArchive = useMemo(() => {
    const query = archiveQuery.trim().toLowerCase();
    return archive.filter(row => {
      if (archiveIndustry && row.industry !== archiveIndustry) return false;
      if (!query) return true;
      return [row.orgName, row.workspaceName, row.industry, row.deletedByEmail, row.orgId]
        .some(value => (value || '').toLowerCase().includes(query));
    }).sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
  }, [archive, archiveQuery, archiveIndustry]);

  const archiveColumns: Column<CostArchiveEntry>[] = [
    { key: 'organization', header: 'Organization / workspace', width: '240px', cell: row =>
      <div className="min-w-0">
        <p className="truncate font-semibold text-[var(--text-primary)]" title={row.orgName || row.orgId}>{row.orgName || row.orgId}</p>
        <p className="truncate text-xs text-[var(--text-muted)]">{row.workspaceName || row.industry || row.orgId}</p>
      </div> },
    { key: 'deleted', header: 'Deleted', width: '220px', cell: row =>
      <div>
        <p className="whitespace-nowrap text-xs text-[var(--text-secondary)]">{new Date(row.deletedAt).toLocaleDateString()}</p>
        <p className="truncate text-xs text-[var(--text-muted)]" title={row.deletedByEmail || ''}>{row.deletedByEmail || '—'}</p>
      </div> },
    { key: 'minutes', header: 'AI minutes', align: 'right', width: '120px', cell: row => (row.aiMinutesUsed ?? 0).toFixed(2) },
    { key: 'aiTimeCost', header: 'AI time cost', align: 'right', width: '140px', cell: row => row.aiMinutesCostInr != null ? formatInr(row.aiMinutesCostInr) : '—' },
    { key: 'callCost', header: 'Phone cost', align: 'right', width: '150px', cell: row =>
      <span title={row.callProviderLabel || undefined}>{formatInr(row.phoneCharges ?? 0)}</span> },
    { key: 'tokens', header: 'AI tokens', align: 'right', width: '130px', cell: row => (row.aiTotalTokens ?? 0).toLocaleString('en-IN') },
    { key: 'tokenCost', header: 'AI token cost', align: 'right', width: '150px', cell: row =>
      <span title={row.aiTokenProviderLabel || undefined}>
        {row.aiTokenTotalCostInr != null ? formatInr(row.aiTokenTotalCostInr) : '—'}
      </span> },
  ];

  const displayedProviders = providers.filter(provider => provider.kind === pricingTab);
  const dirtyCount = providers.filter(provider => {
    const saved = savedProviders.find(row => row.key === provider.key);
    return saved && providerSnapshot(saved) !== providerSnapshot(provider);
  }).length;

  return (
    <div className="grid grid-cols-12 gap-4 md:gap-5">
      <KpiCard colSpan={3} label="Effective call rate" value={loadingProviders ? '—' : callRate}
        sub="Per minute · tax included" icon={Zap} iconBg="#f59e0b1a" iconColor="#d97706" />
      <KpiCard colSpan={3} label="Active call providers" value={loadingProviders ? '—' : activeCallProviders.length}
        icon={Phone} iconBg="#0d94881a" iconColor="#0d9488" />
      <KpiCard colSpan={3} label="Active AI providers" value={loadingProviders ? '—' : activeAiProviders.length}
        icon={Cpu} iconBg="#4a3aa71a" iconColor="#4a3aa7" />
      <KpiCard colSpan={3} label="Deleted organizations" value={loadingArchive ? '—' : archive.length}
        sub="Cost snapshots retained" icon={Archive} iconBg="#b453091a" iconColor="#b45309" />

      <Widget colSpan={12} title="Provider pricing"
        subtitle="Set rates and tax for the supported providers. Save each provider to apply its changes."
        icon={Zap} accent="#2563eb" padding="none"
        action={dirtyCount > 0
          ? <span role="status" className="rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-semibold text-amber-700 dark:border-amber-800 dark:text-amber-300">
              {dirtyCount} unsaved {dirtyCount === 1 ? 'provider' : 'providers'}
            </span>
          : undefined}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg-surface)] p-4">
          <div role="tablist" aria-label="Pricing provider type" className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-1">
            <button type="button" role="tab" aria-selected={pricingTab === 'call'} onClick={() => setPricingTab('call')}
              className={(pricingTab === 'call' ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]') +
                ' inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors'}>
              <Phone className="h-3.5 w-3.5" /> Call providers <span className="text-[var(--text-muted)]">{providers.filter(row => row.kind === 'call').length}</span>
            </button>
            <button type="button" role="tab" aria-selected={pricingTab === 'ai'} onClick={() => setPricingTab('ai')}
              className={(pricingTab === 'ai' ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]') +
                ' inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors'}>
              <Cpu className="h-3.5 w-3.5" /> AI providers <span className="text-[var(--text-muted)]">{providers.filter(row => row.kind === 'ai').length}</span>
            </button>
          </div>
          <p className="text-xs text-[var(--text-muted)]">Rates affect new usage; historical records retain their billed values.</p>
        </div>

        {loadingProviders
          ? <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--text-muted)]">
              <RefreshCw className="h-4 w-4 animate-spin" /> Loading provider rates…
            </div>
          : providersError
            ? <div role="alert" className="flex flex-wrap items-center gap-3 p-5 text-xs text-rose-700">
                <span>{providersError}</span>
                <Button type="button" size="sm" onClick={() => void loadProviders()}>Retry</Button>
              </div>
            : displayedProviders.length === 0
              ? <EmptyState icon={pricingTab === 'call' ? Phone : Cpu}
                  heading="No providers configured"
                  message="Supported providers are registered by the platform backend." />
              : <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-2">
                  {displayedProviders.map(provider => {
                    const saved = savedProviders.find(row => row.key === provider.key);
                    return <ProviderRow
                      key={provider.key}
                      provider={provider}
                      dirty={Boolean(saved && providerSnapshot(provider) !== providerSnapshot(saved))}
                      saving={savingKey === provider.key}
                      blocked={Boolean(savingKey)}
                      saved={savedKey === provider.key}
                      error={saveErrors[provider.key]}
                      onChange={patch => updateLocal(provider.key, patch)}
                      onReset={() => resetProvider(provider.key)}
                      onSave={() => void saveProvider(provider)}
                    />;
                  })}
                </div>}
      </Widget>

      <Widget colSpan={12} title="Deleted organizations"
        subtitle="Permanent final cost snapshots for removed organizations."
        icon={Archive} accent="#b45309" padding="none"
        action={<Button type="button" icon={RefreshCw} size="sm" variant="secondary"
          disabled={loadingArchive} onClick={() => void loadArchive()}>Refresh</Button>}>
        <div className="border-b border-[var(--border)] bg-[var(--bg-surface)] p-4">
          <FilterBar
            search={{ value: archiveQuery, onChange: setArchiveQuery, placeholder: 'Search organization, workspace, or administrator…' }}
            selects={[{
              key: 'industry', label: 'Industry', value: archiveIndustry,
              onChange: setArchiveIndustry,
              options: [{ label: 'All industries', value: '' }, ...archiveIndustries.map(value => ({ label: value.replaceAll('_', ' '), value }))],
            }]}
            hasActiveFilters={Boolean(archiveQuery.trim() || archiveIndustry)}
            onClear={() => { setArchiveQuery(''); setArchiveIndustry(''); }}
            resultCount={{ filtered: filteredArchive.length, total: archive.length, label: 'organizations' }}
          />
        </div>
        {archiveError && <div role="alert" className="flex flex-wrap items-center gap-3 px-4 py-3 text-xs text-rose-700">
          <span>{archiveError}</span>
          <Button type="button" size="sm" onClick={() => void loadArchive()}>Retry</Button>
        </div>}
        <DataTable<CostArchiveEntry>
          bare
          resizable
          paginated
          defaultPageSize={25}
          columns={archiveColumns}
          rows={filteredArchive}
          rowKey={row => row.id}
          loading={loadingArchive && archive.length === 0}
          emptyMessage={archiveQuery || archiveIndustry
            ? 'No deleted organizations match these filters.'
            : 'No deleted organizations have been archived yet.'}
        />
      </Widget>
    </div>
  );
}

function ProviderRow({
  provider, dirty, saving, blocked, saved, error, onChange, onReset, onSave,
}: {
  provider: CostProvider;
  dirty: boolean;
  saving: boolean;
  blocked: boolean;
  saved: boolean;
  error?: string;
  onChange: (patch: Partial<CostProvider>) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  const price = effectiveCost(provider);
  const invalid = !validProvider(provider);
  return (
    <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{provider.label}</h3>
            <Badge color={provider.active ? 'green' : 'slate'}>{provider.active ? 'Active' : 'Inactive'}</Badge>
            {dirty && <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-300">Unsaved</span>}
          </div>
          <p className="mt-0.5 font-mono text-[11px] text-[var(--text-muted)]">{provider.key}</p>
        </div>
        {provider.updatedAt && <span className="text-[11px] text-[var(--text-muted)]">
          Last saved {new Date(provider.updatedAt).toLocaleDateString()}
        </span>}
      </div>

      <fieldset className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2" disabled={blocked}>
        {provider.kind === 'ai' && (
          <Field label="Pricing basis">
            <select className={FIELD_CLASS} value={provider.pricingMode ?? 'time'}
              onChange={event => onChange({ pricingMode: event.target.value as 'token' | 'time' })}>
              <option value="time">Time based</option>
              <option value="token">Token based</option>
            </select>
          </Field>
        )}
        {provider.kind === 'call' ? (
          <>
            <Field label="Rate (INR)">
              <input className={FIELD_CLASS} type="number" min="0" step="0.01"
                value={provider.rateAmount ?? 0} onChange={event => onChange({ rateAmount: Number(event.target.value) })} />
            </Field>
            <Field label="Billed per">
              <select className={FIELD_CLASS} value={provider.rateUnit ?? 'minute'}
                onChange={event => onChange({ rateUnit: event.target.value as 'minute' | 'hour' })}>
                <option value="minute">Minute</option>
                <option value="hour">Hour</option>
              </select>
            </Field>
          </>
        ) : (provider.pricingMode ?? 'time') === 'time' ? (
          <>
            <Field label="Rate (INR)">
              <input className={FIELD_CLASS} type="number" min="0" step="0.0001"
                value={provider.timeRateAmount ?? 0} onChange={event => onChange({ timeRateAmount: Number(event.target.value) })} />
            </Field>
            <Field label="Billed per">
              <select className={FIELD_CLASS} value={provider.timeUnit ?? 'minute'}
                onChange={event => onChange({ timeUnit: event.target.value as 'minute' | 'second' })}>
                <option value="minute">Minute</option>
                <option value="second">Second</option>
              </select>
            </Field>
          </>
        ) : (
          <>
            <Field label="Rate (INR)">
              <input className={FIELD_CLASS} type="number" min="0" step="0.0001"
                value={provider.ratePer1kTokens ?? 0}
                onChange={event => onChange({ ratePer1kTokens: Number(event.target.value) })} />
            </Field>
            <Field label="Billed per">
              <select className={FIELD_CLASS} value={provider.tokenUnit ?? 1000}
                onChange={event => onChange({ tokenUnit: Number(event.target.value) })}>
                {TOKEN_UNIT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
          </>
        )}
        <Field label="Tax (%)">
          <input className={FIELD_CLASS} type="number" min="0" max="100" step="0.01"
            value={provider.taxPercent ?? 0} onChange={event => onChange({ taxPercent: Number(event.target.value) })} />
        </Field>
        <Field label="Availability">
          <select className={FIELD_CLASS} value={provider.active ? '1' : '0'}
            onChange={event => onChange({ active: event.target.value === '1' })}>
            <option value="1">Active</option>
            <option value="0">Inactive</option>
          </select>
        </Field>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--text-primary)]">{price.amount} / {price.unit}</p>
          <p className="text-[11px] text-[var(--text-muted)]">Estimated rate with {provider.taxPercent || 0}% tax</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <Button type="button" size="sm" icon={RotateCcw} variant="ghost"
            disabled={blocked} onClick={onReset}>Reset</Button>}
          <Button type="button" size="sm" variant="primary" loading={saving}
            disabled={blocked || !dirty || invalid} onClick={onSave}>
            {saved && !dirty ? 'Saved' : 'Save changes'}
          </Button>
        </div>
      </div>
      {invalid && <p role="alert" className="border-t border-[var(--border)] px-4 py-2 text-xs text-rose-600">
        Enter a valid rate and a tax value between 0 and 100.
      </p>}
      {error && <p role="alert" className="border-t border-[var(--border)] px-4 py-2 text-xs text-rose-600">{error}</p>}
      {saved && !dirty && <p role="status" className="border-t border-[var(--border)] px-4 py-2 text-xs text-emerald-700">
        Provider pricing saved successfully.
      </p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0 space-y-1.5">
      <span className="block text-[11px] font-semibold text-[var(--text-secondary)]">{label}</span>
      {children}
    </label>
  );
}
