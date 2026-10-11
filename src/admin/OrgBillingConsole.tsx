import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatInr } from '../lib/pricing';
import DataTable, { type Column } from '../components/ui/DataTable';
import KpiCard from '../components/ui/KpiCard';

type BillingConsole = {
  services: { mode: string; aiEnabled: boolean; phoneEnabled: boolean; chargeScope: string };
  overview: Record<string, unknown>;
  billingPeriod?: { label: string; timeZone: string };
  aiBilling?: {
    pricingMode: string;
    source: string;
    effective: { voice: { timeRateAmount?: number }; postCall: { timeRateAmount?: number } };
  } | null;
  phoneBilling?: { providers: Array<{ provider: string; calls: number; durationSeconds: number; providerCostInr: number }>; currentMonthPhoneSpendInr: number } | null;
  minimumCallBalance?: {
    industryDefault: { minimumBalanceInr: number; reservationMinutes: number };
    effective: { effectiveMinimumBalanceInr: number; effectiveReservationMinutes: number; source: string };
  };
  usageAndCost?: Array<{
    callId: string;
    createdAt: string;
    durationSeconds: number;
    telephonyProvider?: string;
    aiCostInr?: number;
    providerCostInr?: number;
    totalCostInr?: number;
    pricingMode?: string;
  }>;
  ledger?: Array<{
    createdAt: string;
    type: string;
    amountInr: number;
    balanceAfterInr?: number;
    description?: string;
    referenceId?: string;
  }>;
};

type CallUsageRow = NonNullable<BillingConsole['usageAndCost']>[number];
type LedgerRow = NonNullable<BillingConsole['ledger']>[number] & { _rowIndex: number };

export default function OrgBillingConsole({ orgId, onRecharge }: { orgId: string; onRecharge?: () => void }) {
  const [data, setData] = useState<BillingConsole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'usage' | 'ledger' | 'config'>('overview');

  const load = useCallback(() => {
    setLoading(true);
    apiFetch(`/api/platform/organizations/${orgId}/billing-console`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body?.error || 'Failed to load billing console');
        setData(body);
        setError(null);
      })
      .catch((e) => setError(e?.message || 'Failed to load billing'))
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div role="status" className="flex items-center justify-center gap-2 rounded-xl bg-[var(--bg-subtle)] px-4 py-8 text-xs text-[var(--text-secondary)]">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading billing activity…
    </div>;
  }
  if (error || !data) {
    return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
      <p className="text-xs text-[var(--text-secondary)]">{error || 'Billing activity is unavailable.'}</p>
      <button type="button" onClick={load} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)]">
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
      </button>
    </div>;
  }

  const overview = data.overview as Record<string, number | string>;
  const isRecharge = overview.billingMethod === 'recharge_based';
  const uniqueTabs = ['overview', 'usage', 'ledger', 'config'] as const;

  return (
    <section aria-label="Billing activity" className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">Billing activity</h4>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Review usage, charges, transactions and pricing configuration.</p>
        </div>
        <button type="button" onClick={load}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
          <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>
      <nav aria-label="Billing activity views" className="flex min-w-0 gap-1 overflow-x-auto rounded-xl bg-[var(--bg-subtle)] p-1">
        {uniqueTabs.map(id => (
          <button key={id} type="button" aria-pressed={tab === id}
            onClick={() => setTab(id)}
            className={`min-h-9 shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${tab === id
              ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface)]/60 hover:text-[var(--text-primary)]'}`}>
            {id === 'overview' ? 'Summary' : id === 'usage' ? 'Usage & costs' : id === 'ledger' ? 'Transactions' : 'Pricing setup'}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-secondary)]">
            <span className="rounded-lg bg-[var(--bg-subtle)] px-2.5 py-1.5">Service: <strong className="font-semibold text-[var(--text-primary)]">{data.services.mode.replace(/_/g, ' ')}</strong></span>
            {data.billingPeriod && <span className="rounded-lg bg-[var(--bg-subtle)] px-2.5 py-1.5">{data.billingPeriod.label} · {data.billingPeriod.timeZone}</span>}
          </div>
          <div className="grid grid-cols-12 gap-3">
            {isRecharge ? (
              <>
                <Kpi label="Balance" value={formatInr(Number(overview.currentBalanceInr) || 0)} />
                <Kpi label="Reserved" value={formatInr(Number(overview.reservedInr) || 0)} />
                <Kpi label="Available" value={formatInr(Number(overview.availableInr) || 0)} />
                <Kpi label="This month spend" value={formatInr(Number(overview.currentMonthSpendInr) || 0)} />
              </>
            ) : (
              <>
                <Kpi label="This month spend" value={formatInr(Number(overview.currentMonthSpendInr) || 0)} />
                <Kpi label="AI spend" value={formatInr(Number(overview.aiSpendInr) || 0)} />
                {data.services.phoneEnabled && <Kpi label="Phone spend" value={formatInr(Number(overview.phoneSpendInr) || 0)} />}
                <Kpi label="Calls" value={String(overview.totalCalls ?? 0)} />
              </>
            )}
          </div>

          {data.services.aiEnabled && data.aiBilling && (
            <Section title="AI processing rates">
              <Row label="Pricing mode" value={data.aiBilling.pricingMode} />
              <Row label="Source" value={data.aiBilling.source.replace(/_/g, ' ')} />
              {data.aiBilling.pricingMode === 'TIME_BASED' && (
                <>
                  <Row label="Voice / audio rate" value={`₹${data.aiBilling.effective.voice.timeRateAmount ?? '—'} / minute`} />
                  <Row label="Post-call rate" value={`₹${data.aiBilling.effective.postCall.timeRateAmount ?? '—'} / minute`} />
                </>
              )}
            </Section>
          )}

          {data.services.phoneEnabled && data.phoneBilling && (
            <Section title="Phone provider costs">
              <Row label="Recorded phone spend this month" value={formatInr(data.phoneBilling.currentMonthPhoneSpendInr)} />
              {data.phoneBilling.providers.map((p) => (
                <div key={p.provider} className="mt-2 border-t border-[var(--border)] pt-3 text-xs text-[var(--text-secondary)]">
                  <span className="font-semibold capitalize">{p.provider}</span> — {p.calls} calls, {Math.round(p.durationSeconds / 60)} min, {formatInr(p.providerCostInr)}
                </div>
              ))}
            </Section>
          )}

          {data.minimumCallBalance && (
            <Section title="Minimum call balance">
              <Row label="Industry default" value={`₹${data.minimumCallBalance.industryDefault.minimumBalanceInr} / ${data.minimumCallBalance.industryDefault.reservationMinutes} min reserve`} />
              <Row label="Effective" value={`₹${data.minimumCallBalance.effective.effectiveMinimumBalanceInr} / ${data.minimumCallBalance.effective.effectiveReservationMinutes} min`} />
              <Row label="Source" value={data.minimumCallBalance.effective.source.replace(/_/g, ' ')} />
            </Section>
          )}
        </div>
      )}

      {tab === 'usage' && (
        <DataTable<CallUsageRow>
          resizable
          paginated
          bare
          emptyMessage="No call billing records yet."
          columns={[
            { key: 'date', header: 'Date', cell: row => <span className="whitespace-nowrap text-xs">{new Date(row.createdAt).toLocaleString()}</span> },
            { key: 'call', header: 'Call', cell: row => <span className="font-mono text-xs" title={row.callId}>{row.callId}</span> },
            { key: 'duration', header: 'Duration', cell: row => <span className="whitespace-nowrap text-xs">{row.durationSeconds}s</span> },
            ...(data.services.phoneEnabled ? [
              { key: 'provider', header: 'Provider', cell: (row: CallUsageRow) => row.telephonyProvider || '—' },
            ] : []),
            ...(data.services.aiEnabled ? [
              { key: 'ai', header: 'AI', align: 'right' as const, cell: (row: CallUsageRow) => formatInr(row.aiCostInr || 0) },
            ] : []),
            ...(data.services.phoneEnabled ? [
              { key: 'phone', header: 'Phone', align: 'right' as const, cell: (row: CallUsageRow) => formatInr(row.providerCostInr || 0) },
            ] : []),
            { key: 'total', header: 'Total', align: 'right', cell: row => <span className="font-semibold">{formatInr(row.totalCostInr || 0)}</span> },
          ] satisfies Column<CallUsageRow>[]}
          rows={data.usageAndCost || []}
          rowKey={row => row.callId}
        />
      )}

      {tab === 'ledger' && (
        <DataTable<LedgerRow>
          resizable
          paginated
          bare
          emptyMessage="No ledger entries yet."
          columns={[
            { key: 'date', header: 'Date', cell: row => <span className="whitespace-nowrap text-xs">{new Date(row.createdAt).toLocaleString()}</span> },
            { key: 'type', header: 'Type', cell: row => row.type },
            { key: 'amount', header: 'Amount', align: 'right', cell: row => formatInr(row.amountInr) },
            { key: 'balance', header: 'Balance after', align: 'right', cell: row => row.balanceAfterInr != null ? formatInr(row.balanceAfterInr) : '—' },
            { key: 'description', header: 'Description', cell: row => row.description || row.referenceId || '—' },
          ] satisfies Column<LedgerRow>[]}
          rows={(data.ledger || []).map((entry, index) => ({ ...entry, _rowIndex: index }))}
          rowKey={row => String(row._rowIndex)}
        />
      )}

      {tab === 'config' && (
        <div className="space-y-3 rounded-xl border border-[var(--border)] p-4">
          <Row label="Charge scope" value={data.services.chargeScope === 'ai_and_call_provider' ? 'AI + phone' : 'AI only'} />
          <Row label="Billing method" value={isRecharge ? 'Prepaid / recharge' : 'Pay as you go'} />
          <p className="border-t border-[var(--border)] pt-3 text-xs leading-5 text-[var(--text-muted)]">
            Pricing overrides and global defaults are managed through platform billing. Historical call charges keep the pricing recorded at the time of each call.
          </p>
          {onRecharge && isRecharge && <p className="text-xs text-[var(--text-muted)]">Use Add prepaid balance above to adjust the wallet.</p>}
        </div>
      )}
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <KpiCard
      colSpan={6}
      span={{ xs: 12, sm: 6, lg: 6 }}
      label={label}
      value={value}
      iconPosition="top-left"
      className="min-w-0"
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3.5 sm:p-4">
      <h5 className="mb-3 text-xs font-semibold text-[var(--text-primary)]">{title}</h5>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-1 text-xs">
      <span className="min-w-0 text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 max-w-full break-words text-right font-semibold text-[var(--text-primary)]">{value}</span>
    </div>
  );
}
