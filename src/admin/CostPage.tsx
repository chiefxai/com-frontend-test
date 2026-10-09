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


const GEMINI_LIVE_KEY = 'gemini';
const GEMINI_POST_KEY = 'gemini-postcall';
const GEMINI_SAVE_KEY = 'gemini-pair';

type GeminiSharedSettings = Pick<CostProvider, 'pricingMode' | 'tokenUnit' | 'timeUnit' | 'taxPercent' | 'active'>;

/** The legacy billing ledger still has separate Gemini roles. The UI presents
 * their shared settings once and keeps the two role-specific rates separate. */
function geminiSharedSettings(live: CostProvider): GeminiSharedSettings {
  return {
    pricingMode: live.pricingMode ?? 'time',
    tokenUnit: live.tokenUnit ?? 1000,
    timeUnit: live.timeUnit ?? 'minute',
    taxPercent: live.taxPercent,
    active: live.active,
  };
}

function alignGeminiDraft(rows: CostProvider[]): CostProvider[] {
  const live = rows.find(row => row.key === GEMINI_LIVE_KEY);
  const post = rows.find(row => row.key === GEMINI_POST_KEY);
  if (!live || !post) return rows;
  const shared = geminiSharedSettings(live);
  return rows.map(row => row.key === GEMINI_POST_KEY ? { ...row, ...shared } : row);
}

function geminiSharedSettingsDiffer(live: CostProvider, post: CostProvider): boolean {
  const first = geminiSharedSettings(live);
  const second = geminiSharedSettings(post);
  return Object.keys(first).some(key =>
    first[key as keyof GeminiSharedSettings] !== second[key as keyof GeminiSharedSettings]);
}

async function persistCostProvider(provider: CostProvider): Promise<CostProvider> {
  const response = await apiFetch('/api/platform/cost-providers/' + encodeURIComponent(provider.key), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(provider),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to save provider pricing.');
  return data as CostProvider;
}
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
      setProviders(alignGeminiDraft(next));
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
    const errorKey = key === GEMINI_LIVE_KEY || key === GEMINI_POST_KEY ? GEMINI_SAVE_KEY : key;
    setSavedKey(previous => previous === errorKey ? null : previous);
    setSaveErrors(previous => {
      if (!previous[errorKey]) return previous;
      const next = { ...previous };
      delete next[errorKey];
      return next;
    });
  };

  const resetProvider = (key: string) => {
    const saved = savedProviders.find(provider => provider.key === key);
    if (!saved) return;
    updateLocal(key, { ...saved });
  };

  const updateGeminiShared = (patch: Partial<GeminiSharedSettings>) => {
    setProviders(current => current.map(provider =>
      provider.key === GEMINI_LIVE_KEY || provider.key === GEMINI_POST_KEY
        ? { ...provider, ...patch } : provider));
    setSavedKey(previous => previous === GEMINI_SAVE_KEY ? null : previous);
    setSaveErrors(previous => ({ ...previous, [GEMINI_SAVE_KEY]: '' }));
  };

  const resetGemini = () => {
    setProviders(current => {
      const originals = savedProviders.filter(row =>
        row.key === GEMINI_LIVE_KEY || row.key === GEMINI_POST_KEY);
      const resetRows = alignGeminiDraft(originals);
      return current.map(row => resetRows.find(original => original.key === row.key) || row);
    });
    setSaveErrors(previous => ({ ...previous, [GEMINI_SAVE_KEY]: '' }));
    setSavedKey(null);
  };

  const saveGemini = async () => {
    if (savingKey) return;
    const live = providers.find(provider => provider.key === GEMINI_LIVE_KEY);
    const post = providers.find(provider => provider.key === GEMINI_POST_KEY);
    if (!live || !post) return;
    if (!validProvider(live) || !validProvider(post)) {
      setSaveErrors(previous => ({ ...previous, [GEMINI_SAVE_KEY]:
        'Enter valid non-negative prices and a tax percentage between 0 and 100.' }));
      return;
    }
    setSavingKey(GEMINI_SAVE_KEY);
    setSavedKey(null);
    setSaveErrors(previous => ({ ...previous, [GEMINI_SAVE_KEY]: '' }));
    let liveSaved = false;
    try {
      // These two existing PUT endpoints share one platform-settings JSON store:
      // make the requests sequentially, never concurrently (avoid lost updates).
      const savedLive = await persistCostProvider(live);
      liveSaved = true;
      setSavedProviders(current => current.map(row =>
        row.key === savedLive.key ? { ...savedLive } : row));
      const savedPost = await persistCostProvider(post);
      setSavedProviders(current => current.map(row =>
        row.key === savedPost.key ? { ...savedPost } : row));
      setProviders(current => current.map(row =>
        row.key === savedLive.key ? savedLive
        : row.key === savedPost.key ? savedPost
        : row));
      setSavedKey(GEMINI_SAVE_KEY);
      window.setTimeout(() =>
        setSavedKey(current => current === GEMINI_SAVE_KEY ? null : current), 3500);
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : 'Unable to save Gemini pricing.';
      setSaveErrors(previous => ({ ...previous, [GEMINI_SAVE_KEY]:
        liveSaved
          ? 'Live Voice was saved, but Post-Call Agents could not be saved. ' +
            'The displayed settings have not been fully applied. Retry Save Gemini to synchronize both rates. ' + detail
          : 'Gemini pricing was not fully saved. ' + detail }));
    } finally {
      setSavingKey(null);
    }
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
      const saved = await persistCostProvider(provider);
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
  // Count Gemini once in the KPI: Live Voice and Post-Call Agents share one
  // visible provider form, even though the billing engine records two roles.
  const activeAiProviderCount = new Set(
    savedProviders
      .filter(provider => provider.kind === 'ai' && provider.active)
      .map(provider => provider.key === GEMINI_LIVE_KEY || provider.key === GEMINI_POST_KEY
        ? 'gemini' : provider.key),
  ).size;
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

  const callProviders = providers.filter(provider => provider.kind === 'call');
  const geminiLive = providers.find(provider => provider.key === GEMINI_LIVE_KEY);
  const geminiPost = providers.find(provider => provider.key === GEMINI_POST_KEY);
  const pairedGemini = Boolean(geminiLive && geminiPost);
  const otherAiProviders = providers.filter(provider =>
    provider.kind === 'ai' && (!pairedGemini ||
      (provider.key !== GEMINI_LIVE_KEY && provider.key !== GEMINI_POST_KEY)));

  const isDirty = (provider: CostProvider) => {
    const saved = savedProviders.find(row => row.key === provider.key);
    return Boolean(saved && providerSnapshot(saved) !== providerSnapshot(provider));
  };
  const geminiDirty = pairedGemini && Boolean(geminiLive && geminiPost
    && (isDirty(geminiLive) || isDirty(geminiPost)));
  const savedGeminiLive = savedProviders.find(row => row.key === GEMINI_LIVE_KEY);
  const savedGeminiPost = savedProviders.find(row => row.key === GEMINI_POST_KEY);
  const geminiNeedsSync = Boolean(savedGeminiLive && savedGeminiPost
    && geminiSharedSettingsDiffer(savedGeminiLive, savedGeminiPost));
  const dirtyCount = providers.filter(provider =>
    !(pairedGemini && (provider.key === GEMINI_LIVE_KEY || provider.key === GEMINI_POST_KEY))
    && isDirty(provider)).length + (geminiDirty ? 1 : 0);

  const renderProvider = (provider: CostProvider) => (
    <ProviderRow
      key={provider.key}
      provider={provider}
      dirty={isDirty(provider)}
      saving={savingKey === provider.key}
      blocked={Boolean(savingKey)}
      saved={savedKey === provider.key}
      error={saveErrors[provider.key]}
      onChange={patch => updateLocal(provider.key, patch)}
      onReset={() => resetProvider(provider.key)}
      onSave={() => void saveProvider(provider)}
    />
  );

  return (
    <div className="grid grid-cols-12 gap-4 md:gap-5">
      <KpiCard colSpan={3} label="Effective call rate" value={loadingProviders ? '—' : callRate}
        sub="Per minute · tax included" icon={Zap} iconBg="#f59e0b1a" iconColor="#d97706" />
      <KpiCard colSpan={3} label="Active call providers" value={loadingProviders ? '—' : activeCallProviders.length}
        icon={Phone} iconBg="#0d94881a" iconColor="#0d9488" />
      <KpiCard colSpan={3} label="Active AI providers" value={loadingProviders ? '—' : activeAiProviderCount}
        icon={Cpu} iconBg="#4a3aa71a" iconColor="#4a3aa7" />
      <KpiCard colSpan={3} label="Deleted organizations" value={loadingArchive ? '—' : archive.length}
        sub="Cost snapshots retained" icon={Archive} iconBg="#b453091a" iconColor="#b45309" />

      <Widget colSpan={12} title="Provider pricing"
        subtitle="Configure telephony and Gemini AI rates in one place."
        icon={Zap} accent="#2563eb" padding="none"
        action={dirtyCount > 0
          ? <span role="status" className="rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-semibold text-amber-700 dark:border-amber-800 dark:text-amber-300">
              {dirtyCount} unsaved {dirtyCount === 1 ? 'configuration' : 'configurations'}
            </span>
          : undefined}>
        <div className="border-b border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3">
          <p className="text-xs text-[var(--text-muted)]">
            Manage call pricing and AI pricing together. Changes apply to future usage;
            historical billing entries keep their original rates.
          </p>
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
            : <div className="grid grid-cols-1 items-start gap-5 p-4 xl:grid-cols-2">
                <section className="min-w-0 space-y-3" aria-label="Call provider pricing">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-[var(--text-secondary)]" />
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">Call provider</h3>
                  </div>
                  {callProviders.length > 0
                    ? callProviders.map(renderProvider)
                    : <EmptyState icon={Phone} heading="No call provider configured"
                        message="Call providers are registered by the backend." />}
                </section>
                <section className="min-w-0 space-y-3" aria-label="AI provider pricing">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-[var(--text-secondary)]" />
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">AI provider</h3>
                  </div>
                  {pairedGemini && geminiLive && geminiPost && (
                    <GeminiPricingCard
                      live={geminiLive}
                      post={geminiPost}
                      dirty={geminiDirty}
                      needsSync={geminiNeedsSync}
                      saving={savingKey === GEMINI_SAVE_KEY}
                      blocked={Boolean(savingKey)}
                      saved={savedKey === GEMINI_SAVE_KEY}
                      error={saveErrors[GEMINI_SAVE_KEY]}
                      onSharedChange={updateGeminiShared}
                      onPriceChange={updateLocal}
                      onReset={resetGemini}
                      onSave={() => void saveGemini()}
                    />
                  )}
                  {otherAiProviders.map(renderProvider)}
                  {!pairedGemini && otherAiProviders.length === 0
                    && <EmptyState icon={Cpu} heading="No AI provider configured"
                         message="AI providers are registered by the backend." />}
                </section>
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

/* Gemini is one form in the UI, with two distinct persisted model rates. */
function GeminiPricingCard({
  live, post, dirty, needsSync, saving, blocked, saved, error,
  onSharedChange, onPriceChange, onReset, onSave,
}: {
  live: CostProvider;
  post: CostProvider;
  dirty: boolean;
  needsSync: boolean;
  saving: boolean;
  blocked: boolean;
  saved: boolean;
  error?: string;
  onSharedChange: (patch: Partial<GeminiSharedSettings>) => void;
  onPriceChange: (key: string, patch: Partial<CostProvider>) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  const mode = live.pricingMode ?? 'time';
  const rateField = mode === 'time' ? 'timeRateAmount' : 'ratePer1kTokens';
  const priceLabel = mode === 'time' ? 'Rate per time unit (INR)' : 'Rate per token unit (INR)';
  const invalid = !validProvider(live) || !validProvider(post);
  const livePrice = effectiveCost(live);
  const postPrice = effectiveCost(post);

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">Gemini AI</h4>
            <Badge color={live.active ? 'green' : 'slate'}>{live.active ? 'Active' : 'Inactive'}</Badge>
            {dirty && <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-300">Unsaved</span>}
          </div>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            Separate Live Voice and Post-Call Agent prices with shared billing settings.
          </p>
        </div>
      </div>
      {needsSync && <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
        Previously saved Gemini billing settings differ. The Live Voice settings are shown;
        save Gemini pricing to apply them to both models.
      </div>}
      <fieldset disabled={blocked} className="space-y-4 p-4">
        <div>
          <p className="mb-3 text-xs font-semibold text-[var(--text-primary)]">Model prices</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Live Voice price (INR)">
              <input aria-label="Gemini Live Voice price (INR)"
                className={FIELD_CLASS} type="number" min="0" step="0.0001"
                value={live[rateField] ?? 0}
                onChange={event => onPriceChange(live.key, mode === 'time'
                  ? { timeRateAmount: Number(event.target.value) }
                  : { ratePer1kTokens: Number(event.target.value) })} />
              <span className="mt-1 block text-[11px] text-[var(--text-muted)]">{priceLabel}</span>
            </Field>
            <Field label="Post-Call Agent price (INR)">
              <input aria-label="Gemini Post-Call Agent price (INR)"
                className={FIELD_CLASS} type="number" min="0" step="0.0001"
                value={post[rateField] ?? 0}
                onChange={event => onPriceChange(post.key, mode === 'time'
                  ? { timeRateAmount: Number(event.target.value) }
                  : { ratePer1kTokens: Number(event.target.value) })} />
              <span className="mt-1 block text-[11px] text-[var(--text-muted)]">{priceLabel}</span>
            </Field>
          </div>
        </div>
        <div className="border-t border-[var(--border)] pt-4">
          <p className="mb-3 text-xs font-semibold text-[var(--text-primary)]">Shared billing settings</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Pricing basis">
              <select className={FIELD_CLASS} aria-label="Gemini pricing basis"
                value={mode} onChange={event =>
                  onSharedChange({ pricingMode: event.target.value as 'time' | 'token' })}>
                <option value="time">Time based</option>
                <option value="token">Token based</option>
              </select>
            </Field>
            {mode === 'time'
              ? <Field label="Billing per">
                  <select className={FIELD_CLASS} aria-label="Gemini billing per"
                    value={live.timeUnit ?? 'minute'} onChange={event =>
                      onSharedChange({ timeUnit: event.target.value as 'minute' | 'second' })}>
                    <option value="minute">Minute</option>
                    <option value="second">Second</option>
                  </select>
                </Field>
              : <Field label="Billing per">
                  <select className={FIELD_CLASS} aria-label="Gemini billing per"
                    value={live.tokenUnit ?? 1000} onChange={event =>
                      onSharedChange({ tokenUnit: Number(event.target.value) })}>
                    {TOKEN_UNIT_OPTIONS.map(option =>
                      <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </Field>}
            <Field label="Tax (%)">
              <input className={FIELD_CLASS} aria-label="Gemini tax percentage"
                type="number" min="0" max="100" step="0.01"
                value={live.taxPercent ?? 0}
                onChange={event => onSharedChange({ taxPercent: Number(event.target.value) })} />
            </Field>
            <Field label="Availability">
              <select className={FIELD_CLASS} aria-label="Gemini availability"
                value={live.active ? '1' : '0'}
                onChange={event => onSharedChange({ active: event.target.value === '1' })}>
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </Field>
          </div>
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-[var(--text-primary)]">
            Live Voice: {livePrice.amount} / {livePrice.unit}
          </p>
          <p className="text-xs font-semibold text-[var(--text-primary)]">
            Post-Call Agent: {postPrice.amount} / {postPrice.unit}
          </p>
          <p className="text-[11px] text-[var(--text-muted)]">
            Estimated rates include {live.taxPercent || 0}% tax.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <Button type="button" size="sm" icon={RotateCcw} variant="ghost"
            disabled={blocked} onClick={onReset}>Reset</Button>}
          <Button type="button" size="sm" variant="primary" loading={saving}
            disabled={blocked || !dirty || invalid} onClick={onSave}>
            {saved && !dirty ? 'Saved' : 'Save Gemini'}
          </Button>
        </div>
      </div>
      {invalid && <p role="alert" className="border-t border-[var(--border)] px-4 py-2 text-xs text-rose-600">
        Enter valid non-negative prices and a tax percentage between 0 and 100.
      </p>}
      {error && <p role="alert" className="border-t border-[var(--border)] px-4 py-2 text-xs text-rose-600">{error}</p>}
      {saved && !dirty && <p role="status" className="border-t border-[var(--border)] px-4 py-2 text-xs text-emerald-700">
        Both Gemini prices and shared billing settings saved successfully.
      </p>}
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
