import React, { useCallback, useEffect, useState } from 'react';
import { Cpu, Eye, Pencil, Phone, RefreshCw, RotateCcw, Settings2, Zap } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { Card, CardHeader } from '../components/ui/Card';
import StudioEntityCard from '../components/ui/StudioEntityCard';
import Modal from '../components/ui/Modal';
import KpiCard from '../components/ui/KpiCard';
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
const FIELD_CLASS = 'h-10 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-subtle)] disabled:cursor-not-allowed disabled:opacity-60';

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
  const [selected, setSelected] = useState<{ key: string; mode: 'view' | 'edit' } | null>(null);

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

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

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

  const selectedProvider = selected?.key && selected.key !== GEMINI_SAVE_KEY
    ? providers.find(provider => provider.key === selected.key) : undefined;
  const selectedGemini = selected?.key === GEMINI_SAVE_KEY && geminiLive && geminiPost;

  // Never silently discard pricing drafts or close while a save is pending.
  const closeDetails = () => {
    if (savingKey) return;
    if (selected?.mode === 'edit') {
      const dirty = selected.key === GEMINI_SAVE_KEY
        ? geminiDirty : Boolean(selectedProvider && isDirty(selectedProvider));
      if (dirty && !window.confirm('Discard unsaved provider pricing changes?')) return;
      if (dirty) {
        if (selected.key === GEMINI_SAVE_KEY) resetGemini();
        else if (selectedProvider) resetProvider(selectedProvider.key);
      }
    }
    setSelected(null);
  };

  const renderProviderCard = (provider: CostProvider) => {
    const price = effectiveCost(provider);
    return (
      <StudioEntityCard key={provider.key} title={provider.label}
        subtitle={provider.key} icon={provider.kind === 'call' ? Phone : Cpu}
        badge={<Badge color={provider.active ? 'green' : 'slate'}>{provider.active ? 'Active' : 'Inactive'}</Badge>}
        footer={
          <>
            <Button type="button" size="sm" variant="secondary" icon={Eye}
              onClick={() => setSelected({ key: provider.key, mode: 'view' })}>View</Button>
            <Button type="button" size="sm" variant="primary" icon={Pencil}
              onClick={() => setSelected({ key: provider.key, mode: 'edit' })}>Edit</Button>
          </>
        }>
        <div className="grid grid-cols-2 gap-2">
          <PricingMetric label="Rate incl. tax" value={price.amount} />
          <PricingMetric label="Billing unit" value={price.unit} />
          <PricingMetric label="Tax" value={`${provider.taxPercent ?? 0}%`} />
          <PricingMetric label="Pricing" value={provider.kind === 'call' ? 'Calling' : (provider.pricingMode === 'token' ? 'Tokens' : 'Time')} />
        </div>
        <p className="mt-auto text-[11px] text-[var(--text-muted)]">
          {provider.kind === 'call' ? 'Telephony provider' : 'AI processing provider'}
        </p>
      </StudioEntityCard>
    );
  };

  return (
    <div className="grid grid-cols-12 items-start gap-4 md:gap-5">
      <KpiCard colSpan={3} iconPosition="top-left"
        label="Effective call rate" value={loadingProviders ? '—' : callRate}
        sub="Per minute · tax included" icon={Zap} iconBg="var(--accent-subtle)" iconColor="var(--accent)" />
      <KpiCard colSpan={3} iconPosition="top-left"
        label="Active call providers" value={loadingProviders ? '—' : activeCallProviders.length}
        sub="Enabled phone integrations" icon={Phone} />
      <KpiCard colSpan={3} iconPosition="top-left"
        label="Active AI providers" value={loadingProviders ? '—' : activeAiProviderCount}
        sub="Enabled AI integrations" icon={Cpu} />
      <KpiCard colSpan={3} iconPosition="top-left"
        label="Provider rate entries" value={loadingProviders ? '—' : savedProviders.length}
        sub="Stored rate configurations" icon={Settings2} />

      <div className="col-span-12 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-xs leading-5 text-[var(--text-secondary)]">
            Browse the same compact cards used in Agent Studio. Choose <strong>View</strong> for full
            rate details or <strong>Edit</strong> to update pricing. Saved changes affect future
            usage; historical bills keep their original rates.
          </p>
          {dirtyCount > 0 && (
            <span role="status" className="rounded-lg border border-amber-300/60 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              {dirtyCount} unsaved {dirtyCount === 1 ? 'configuration' : 'configurations'}
            </span>
          )}
        </div>
      </div>

      {loadingProviders ? (
        <Card padding="lg" className="col-span-12">
          <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--text-muted)]">
            <RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin" /> Loading provider rates…
          </div>
        </Card>
      ) : providersError ? (
        <Card padding="md" className="col-span-12">
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-xs text-rose-600 dark:text-rose-300">
            <span>{providersError}</span>
            <Button type="button" variant="secondary" size="sm" onClick={() => void loadProviders()}>Retry</Button>
          </div>
        </Card>
      ) : (
        <>
          <section aria-label="Call provider pricing" className="col-span-12 space-y-3">
            <div className="flex items-center gap-2">
              <Phone aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Call providers</h2>
              <span className="rounded-md bg-[var(--bg-subtle)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">{callProviders.length}</span>
            </div>
            {callProviders.length ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {callProviders.map(renderProviderCard)}
              </div>
            ) : <EmptyState icon={Phone} heading="No call provider configured" message="Call providers are registered by the backend." />}
          </section>
          <section aria-label="AI provider pricing" className="col-span-12 space-y-3">
            <div className="flex items-center gap-2">
              <Cpu aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">AI providers</h2>
              <span className="rounded-md bg-[var(--bg-subtle)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">{otherAiProviders.length + (pairedGemini ? 1 : 0)}</span>
            </div>
            {(pairedGemini || otherAiProviders.length > 0) ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {pairedGemini && geminiLive && geminiPost && (
                  <StudioEntityCard key={GEMINI_SAVE_KEY} title="Gemini AI" subtitle="Live Voice · Post-Call Agents"
                    icon={Cpu} badge={<Badge color={geminiLive.active ? 'green' : 'slate'}>{geminiLive.active ? 'Active' : 'Inactive'}</Badge>}
                    footer={
                      <>
                        <Button type="button" size="sm" variant="secondary" icon={Eye}
                          onClick={() => setSelected({ key: GEMINI_SAVE_KEY, mode: 'view' })}>View</Button>
                        <Button type="button" size="sm" variant="primary" icon={Pencil}
                          onClick={() => setSelected({ key: GEMINI_SAVE_KEY, mode: 'edit' })}>Edit</Button>
                      </>
                    }>
                    <div className="grid grid-cols-2 gap-2">
                      <PricingMetric label="Live Voice" value={effectiveCost(geminiLive).amount} />
                      <PricingMetric label="Post-Call" value={effectiveCost(geminiPost).amount} />
                      <PricingMetric label="Billing unit" value={effectiveCost(geminiLive).unit} />
                      <PricingMetric label="Tax" value={`${geminiLive.taxPercent ?? 0}%`} />
                    </div>
                    <p className="mt-auto text-[11px] text-[var(--text-muted)]">Two model rates · shared billing settings</p>
                  </StudioEntityCard>
                )}
                {otherAiProviders.map(renderProviderCard)}
              </div>
            ) : <EmptyState icon={Cpu} heading="No AI provider configured" message="AI providers are registered by the backend." />}
          </section>
        </>
      )}

      <Modal open={Boolean(selected)} onClose={closeDetails} maxWidth="max-w-2xl"
        title={selected?.mode === 'view' ? 'Provider details' : 'Edit provider pricing'}
        subtitle={selected?.key === GEMINI_SAVE_KEY ? 'Gemini AI · Live Voice and Post-Call Agents' : selectedProvider?.label}
        footer={selected ? (
          <>
            <Button type="button" size="sm" variant="secondary" disabled={Boolean(savingKey)} onClick={closeDetails}>
              Close
            </Button>
            {selected.mode === 'view' && (
              <Button type="button" size="sm" variant="primary" icon={Pencil}
                onClick={() => setSelected({ ...selected, mode: 'edit' })}>Edit pricing</Button>
            )}
          </>
        ) : undefined}>
        {selected?.mode === 'view' ? (
          selectedGemini ? (
            <div className="space-y-4">
              <p className="text-xs leading-5 text-[var(--text-secondary)]">
                Gemini uses two separate rates with shared tax, pricing basis and availability settings.
                Effective rates below include configured tax.
              </p>
              <section className="rounded-xl border border-[var(--border)] p-4">
                <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Live Voice</h3>
                <PricingDetailRow label="Provider key" value={geminiLive!.key} />
                <PricingDetailRow label="Base rate" value={formatInr(geminiLive!.pricingMode === 'token' ? geminiLive!.ratePer1kTokens ?? 0 : geminiLive!.timeRateAmount ?? 0)} />
                <PricingDetailRow label="Rate including tax" value={`${effectiveCost(geminiLive!).amount} / ${effectiveCost(geminiLive!).unit}`} />
              </section>
              <section className="rounded-xl border border-[var(--border)] p-4">
                <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Post-Call Agents</h3>
                <PricingDetailRow label="Provider key" value={geminiPost!.key} />
                <PricingDetailRow label="Base rate" value={formatInr(geminiPost!.pricingMode === 'token' ? geminiPost!.ratePer1kTokens ?? 0 : geminiPost!.timeRateAmount ?? 0)} />
                <PricingDetailRow label="Rate including tax" value={`${effectiveCost(geminiPost!).amount} / ${effectiveCost(geminiPost!).unit}`} />
              </section>
              <section className="rounded-xl border border-[var(--border)] p-4">
                <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Shared settings</h3>
                <PricingDetailRow label="Pricing basis" value={geminiLive!.pricingMode === 'token' ? 'Token based' : 'Time based'} />
                <PricingDetailRow label="Billing unit" value={effectiveCost(geminiLive!).unit} />
                <PricingDetailRow label="Tax" value={`${geminiLive!.taxPercent ?? 0}%`} />
                <PricingDetailRow label="Availability" value={geminiLive!.active ? 'Active' : 'Inactive'} />
                {geminiLive!.updatedAt && <PricingDetailRow label="Last saved" value={new Date(geminiLive!.updatedAt).toLocaleString()} />}
                {geminiNeedsSync && <p role="status" className="mt-3 text-xs text-amber-600">Previously saved Gemini settings differ; edit and save to synchronize.</p>}
              </section>
            </div>
          ) : selectedProvider ? (
            <div className="space-y-2 rounded-xl border border-[var(--border)] p-4">
              <PricingDetailRow label="Provider" value={selectedProvider.label} />
              <PricingDetailRow label="Provider key" value={selectedProvider.key} />
              <PricingDetailRow label="Category" value={selectedProvider.kind === 'call' ? 'Telephony' : 'AI processing'} />
              <PricingDetailRow label="Status" value={selectedProvider.active ? 'Active' : 'Inactive'} />
              <PricingDetailRow label="Pricing basis" value={selectedProvider.kind === 'call' ? 'Call duration' : selectedProvider.pricingMode === 'token' ? 'Tokens' : 'Time'} />
              <PricingDetailRow label="Base rate" value={formatInr(selectedProvider.kind === 'call' ? selectedProvider.rateAmount ?? 0 : selectedProvider.pricingMode === 'token' ? selectedProvider.ratePer1kTokens ?? 0 : selectedProvider.timeRateAmount ?? 0)} />
              <PricingDetailRow label="Billing unit" value={effectiveCost(selectedProvider).unit} />
              <PricingDetailRow label="Tax" value={`${selectedProvider.taxPercent ?? 0}%`} />
              <PricingDetailRow label="Effective rate" value={`${effectiveCost(selectedProvider).amount} / ${effectiveCost(selectedProvider).unit}`} />
              {selectedProvider.updatedAt && <PricingDetailRow label="Last saved" value={new Date(selectedProvider.updatedAt).toLocaleString()} />}
            </div>
          ) : <p className="text-xs text-[var(--text-muted)]">Provider is no longer available.</p>
        ) : selectedGemini ? (
          <GeminiPricingCard
            live={geminiLive!} post={geminiPost!} dirty={geminiDirty} needsSync={geminiNeedsSync}
            saving={savingKey === GEMINI_SAVE_KEY} blocked={Boolean(savingKey)}
            saved={savedKey === GEMINI_SAVE_KEY} error={saveErrors[GEMINI_SAVE_KEY]}
            onSharedChange={updateGeminiShared} onPriceChange={updateLocal}
            onReset={resetGemini} onSave={() => void saveGemini()}
          />
        ) : selectedProvider ? (
          <ProviderRow provider={selectedProvider} dirty={isDirty(selectedProvider)}
            saving={savingKey === selectedProvider.key} blocked={Boolean(savingKey)}
            saved={savedKey === selectedProvider.key} error={saveErrors[selectedProvider.key]}
            onChange={patch => updateLocal(selectedProvider.key, patch)}
            onReset={() => resetProvider(selectedProvider.key)}
            onSave={() => void saveProvider(selectedProvider)}
          />
        ) : <p className="text-xs text-[var(--text-muted)]">Provider is no longer available.</p>}
      </Modal>
    </div>
  );
}

function PricingMetric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-[9px] bg-[var(--bg-subtle)] p-2.5 text-center">
    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
    <p className="mt-1 truncate text-xs font-bold tabular-nums text-[var(--text-primary)]" title={value}>{value}</p>
  </div>;
}

function PricingDetailRow({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)]/60 py-2 text-xs last:border-0">
    <span className="text-[var(--text-muted)]">{label}</span>
    <span className="max-w-full break-words text-right font-semibold text-[var(--text-primary)]">{value}</span>
  </div>;
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
    <Card padding="none" className="min-w-0 overflow-hidden">
      <div className="border-b border-[var(--border)] px-4 py-4">
        <CardHeader title="Gemini AI" icon={Cpu} border={false}
          subtitle="Live Voice and Post-Call Agents share billing settings."
          action={<div className="flex flex-wrap items-center justify-end gap-2">
            <Badge color={live.active ? 'green' : 'slate'}>{live.active ? 'Active' : 'Inactive'}</Badge>
            {dirty && <span role="status" className="text-[11px] font-semibold text-amber-600 dark:text-amber-300">Unsaved</span>}
          </div>}
        />
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
    </Card>
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
    <Card padding="none" className="min-w-0 overflow-hidden">
      <div className="border-b border-[var(--border)] px-4 py-4">
        <CardHeader
          title={provider.label}
          icon={provider.kind === 'call' ? Phone : Cpu}
          subtitle={<span className="font-mono text-[11px]">{provider.key}</span>}
          border={false}
          action={<div className="flex flex-wrap items-center justify-end gap-2">
            <Badge color={provider.active ? 'green' : 'slate'}>{provider.active ? 'Active' : 'Inactive'}</Badge>
            {dirty && <span role="status" className="text-[11px] font-semibold text-amber-600 dark:text-amber-300">Unsaved</span>}
          </div>}
        />
        {provider.updatedAt && (
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">
            Last saved {new Date(provider.updatedAt).toLocaleDateString()}
          </p>
        )}
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
    </Card>
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
