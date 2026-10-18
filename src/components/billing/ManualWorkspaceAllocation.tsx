import React from 'react';
import { ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import PieChart from '../ui/PieChart';
import { billingClient, createBillingMutation, BillingApiError } from '../../lib/billing/client';
import type {
  BillingAmount, ManualAllocationOverview, ManualAllocationPreview,
} from '../../lib/billing/types';

/** Format currency/credit amounts as exact decimal strings without using Number on ledger units. */
export function formatCreditAmount(value: BillingAmount): string {
  const units = BigInt(value.units);
  const negative = units < 0n ? '-' : '';
  const absolute = units < 0n ? -units : units;
  const divisor = 10n ** BigInt(value.scale);
  const integral = (absolute / divisor).toLocaleString('en-IN');
  const fraction = value.scale
    ? '.' + (absolute % divisor).toString().padStart(value.scale, '0')
    : '';
  return negative + (value.asset === 'INR' ? '₹' : value.asset + ' ') + integral + fraction;
}

/** Input remains exact and is not rounded; the selected grant defines its own scale. */
export function unitsFromInput(input: string, scale: number): string | null {
  if (!Number.isSafeInteger(scale) || scale < 0 || scale > 18
    || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(input.trim())) return null;
  const [whole, fractional = ''] = input.trim().split('.');
  if (fractional.length > scale) return null;
  const units = BigInt(whole) * 10n ** BigInt(scale)
    + BigInt((fractional + '0'.repeat(scale)).slice(0, scale) || '0');
  return units > 0n ? units.toString() : null;
}
const friendlyKind = (kind: string) => kind === 'topup' ? 'Top-up credits' : 'Subscription credits';
const workspaceChartColors = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#db2777', '#0891b2', '#4f46e5', '#65a30d'];

export default function ManualWorkspaceAllocation({ allocationDialogOpen, onAllocationDialogOpenChange }: {
  allocationDialogOpen: boolean;
  onAllocationDialogOpenChange: (open: boolean) => void;
}) {
  const [snapshot, setSnapshot] = React.useState<ManualAllocationOverview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [creditPoolKind, setCreditPoolKind] = React.useState<'subscription' | 'topup'>('subscription');
  const [workspaceId, setWorkspaceId] = React.useState('');
  const [inputAmount, setInputAmount] = React.useState('');
  const [preview, setPreview] = React.useState<ManualAllocationPreview | null>(null);
  const [selectedChartBalanceKey, setSelectedChartBalanceKey] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [pending, setPending] = React.useState<ReturnType<typeof createBillingMutation<{ journalId: string; grantId: string }>> | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await billingClient.manualAllocationOverview();
      setSnapshot(next);
      setCreditPoolKind(current => next.grants.some(grant => grant.kind === current)
        ? current : next.grants.some(grant => grant.kind === 'subscription') ? 'subscription' : 'topup');
      setWorkspaceId(current => next.workspaces.some(row => row.id === current && row.status.toLowerCase() === 'active') ? current : '');
      setPreview(null);
      setPending(null);
    } catch (cause) {
      setSnapshot(null);
      setError(cause instanceof Error ? cause.message : 'Could not load credit allocations.');
    } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void refresh(); }, [refresh]);

  const invalidatePreview = () => {
    setPreview(null);
    setPending(null);
    setError('');
    setNotice('');
  };
  const poolGrants = (snapshot?.grants || []).filter(row => row.kind === creditPoolKind)
    .sort((a, b) => (a.expiresAt || '9999-12-31').localeCompare(b.expiresAt || '9999-12-31'));
  const poolAmount = poolGrants.length ? {
    ...poolGrants[0].available,
    units: poolGrants.reduce((sum, row) => sum + BigInt(row.available.units), 0n).toString(),
  } : null;
  const requestedUnitsByGrant = (row: typeof poolGrants[number]) => unitsFromInput(inputAmount, row.available.scale);
  const grant = poolGrants.find(row => {
    const requested = requestedUnitsByGrant(row);
    return Boolean(requested && BigInt(requested) <= BigInt(row.available.units));
  }) || poolGrants[0];
  const units = grant ? unitsFromInput(inputAmount, grant.available.scale) : null;
  const largestGrantUnits = poolGrants.reduce((largest, row) => {
    const value = BigInt(row.available.units);
    return value > largest ? value : largest;
  }, 0n);
  const amountFitsGrant = Boolean(grant && units && BigInt(units) <= BigInt(grant.available.units));
  const previewAllocation = async () => {
    if (!grant || !workspaceId || !units || !amountFitsGrant) {
      setError('Select an active workspace, a credit pool and a valid positive amount that fits within one available grant.');
      return;
    }
    setBusy(true); setError(''); setNotice(''); setPreview(null); setPending(null);
    try {
      const result = await billingClient.manualAllocationPreview({
        grantId: grant.id, workspaceId, amountUnits: units,
        expectedPositionVersion: grant.positionVersion,
      });
      setPreview(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not preview allocation.'); }
    finally { setBusy(false); }
  };
  const confirmAllocation = async () => {
    if (!preview || !snapshot?.transfersEnabled || !snapshot.writable) return;
    const transfer = pending || createBillingMutation(options => billingClient.confirmManualAllocation({
      grantId: preview.grantId, workspaceId: preview.workspaceId,
      amount: preview.amount, expectedPositionVersion: preview.expectedPositionVersion,
    }, options), preview.expectedPositionVersion);
    setPending(transfer);
    setBusy(true); setError('');
    try {
      await transfer.execute();
      setInputAmount('');
      setNotice('Allocation recorded in the credit ledger. Workspace balances have been refreshed.');
      await refresh();
    } catch (cause) {
      if (cause instanceof BillingApiError && cause.refreshRequired) {
        setPreview(null); setPending(null);
        setError('The credit position changed. Refresh and preview the latest balance before allocating.');
      } else {
        setError(cause instanceof Error ? cause.message : 'Allocation failed. Retry without changing your selections.');
      }
    } finally { setBusy(false); }
  };

  const availableWorkspaces = snapshot?.workspaces.filter(row => row.status.toLowerCase() === 'active') || [];
  const orgBalances = snapshot?.balances.filter(row => row.ownerType === 'organization') || [];
  const workspaceBalances = snapshot?.balances.filter(row => row.ownerType === 'workspace') || [];
  const rowsByWorkspace = snapshot?.workspaces.map(workspace => ({
    ...workspace, balances: workspaceBalances.filter(row => row.ownerId === workspace.id),
  })) || [];
  const chartBalanceOptions = Array.from(new Map([...workspaceBalances, ...orgBalances].map(balance => {
    const key = `${balance.kind}:${balance.available.asset}:${balance.available.scale}`;
    return [key, { key, kind: balance.kind, asset: balance.available.asset, scale: balance.available.scale }];
  })).values());
  const selectedChartBalance = chartBalanceOptions.find(option => option.key === selectedChartBalanceKey) || chartBalanceOptions[0];
  const chartBalances = selectedChartBalance ? rowsByWorkspace.map((workspace, index) => {
    const balance = workspace.balances.find(row => row.kind === selectedChartBalance.kind
      && row.available.asset === selectedChartBalance.asset && row.available.scale === selectedChartBalance.scale);
    return { workspace, balance, index, units: balance ? BigInt(balance.available.units) : 0n };
  }) : [];
  const unallocatedBalance = selectedChartBalance
    ? orgBalances.filter(row => row.kind === selectedChartBalance.kind
      && row.available.asset === selectedChartBalance.asset && row.available.scale === selectedChartBalance.scale)
      .reduce((units, row) => units + BigInt(row.available.units), 0n)
    : 0n;
  const largestChartBalance = chartBalances.reduce((largest, row) => row.units > largest ? row.units : largest,
    unallocatedBalance);
  const chartSlices = largestChartBalance > 0n ? chartBalances.filter(row => row.units > 0n).map(row => ({
    label: row.workspace.name,
    value: Number((row.units * 10_000_000_000_000n) / largestChartBalance),
    color: workspaceChartColors[row.index % workspaceChartColors.length],
    displayValue: selectedChartBalance ? formatCreditAmount({ ...selectedChartBalance, units: row.units.toString() }) : undefined,
    valueLabel: 'Credits',
  })).concat(unallocatedBalance > 0n ? [{
    label: 'Unallocated · Organization pool',
    value: Number((unallocatedBalance * 10_000_000_000_000n) / largestChartBalance),
    color: '#64748b',
    displayValue: selectedChartBalance ? formatCreditAmount({ ...selectedChartBalance, units: unallocatedBalance.toString() }) : undefined,
    valueLabel: 'Credits',
  }] : []) : [];
  const visibleChartSlices = chartSlices.filter(slice => slice.value > 0);
  const chartTotal = chartBalances.reduce((total, row) => total + row.units, unallocatedBalance);
  const chartTotalAmount: BillingAmount | null = selectedChartBalance ? {
    asset: selectedChartBalance.asset, scale: selectedChartBalance.scale, units: chartTotal.toString(),
  } : null;

  return (
    <div className="col-span-12 grid grid-cols-12 gap-4 md:gap-5" id="manual-credit-allocation">
      <Modal open={allocationDialogOpen} onClose={() => { if (!busy) onAllocationDialogOpenChange(false); }}
        title="Send credits to a workspace" subtitle="Choose where the credits go. Nothing moves until you confirm."
        maxWidth="max-w-2xl" className="!max-h-[92vh]">
        <div className="space-y-4">
        {snapshot && !snapshot.transfersEnabled && (
          <p role="status" className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5 text-xs leading-5 text-[var(--text-secondary)]">
            You can check a transfer, but sending credits is not enabled yet. The platform team must enable it first.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-[var(--text-secondary)]">
            Destination workspace
            <select aria-label="Destination workspace" value={workspaceId} disabled={busy || loading}
              onChange={event => { setWorkspaceId(event.target.value); invalidatePreview(); }}
              className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)]">
              <option value="">Select an active workspace</option>
              {availableWorkspaces.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-[var(--text-secondary)]">
            Credit source
            <select aria-label="Credit source" value={creditPoolKind} disabled={busy || loading}
              onChange={event => { setCreditPoolKind(event.target.value as 'subscription' | 'topup'); setInputAmount(''); invalidatePreview(); }}
              className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)]">
              <option value="subscription" disabled={!snapshot?.grants.some(row => row.kind === 'subscription')}>
                Subscription credits pool{snapshot?.grants.some(row => row.kind === 'subscription') ? ` · ${formatCreditAmount({
                  ...snapshot.grants.find(row => row.kind === 'subscription')!.available,
                  units: snapshot.grants.filter(row => row.kind === 'subscription').reduce((sum, row) => sum + BigInt(row.available.units), 0n).toString(),
                })}` : ' · ₹0.00'}
              </option>
              <option value="topup" disabled={!snapshot?.grants.some(row => row.kind === 'topup')}>
                Top-up credits pool{snapshot?.grants.some(row => row.kind === 'topup') ? ` · ${formatCreditAmount({
                  ...snapshot.grants.find(row => row.kind === 'topup')!.available,
                  units: snapshot.grants.filter(row => row.kind === 'topup').reduce((sum, row) => sum + BigInt(row.available.units), 0n).toString(),
                })}` : ' · ₹0.00'}
              </option>
            </select>
          </label>
        </div>
        <label className="mt-3 block max-w-sm text-xs font-semibold text-[var(--text-secondary)]">
          Amount to allocate {grant ? '(' + grant.available.asset + ')' : ''}
          <input aria-label="Amount to allocate" inputMode="decimal" value={inputAmount}
            onChange={event => { setInputAmount(event.target.value); invalidatePreview(); }}
            disabled={busy || !grant}
            placeholder={poolAmount ? 'Enter amount · pool available ' + formatCreditAmount(poolAmount) : 'Select a credit source'}
            className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)]" />
          {poolAmount && <span className="mt-1 block text-[11px] font-normal text-[var(--text-muted)]">
            Pool available: {formatCreditAmount(poolAmount)}{grant && ` · Largest single grant: ${formatCreditAmount({ ...grant.available, units: largestGrantUnits.toString() })}`}
          </span>}
        </label>
        <div className="mt-3">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Quick amounts</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Pick a common amount or type your own above.</p>
          <div role="group" aria-label="Quick allocation amounts" className="mt-2 flex flex-wrap gap-2">
            {[100, 300, 500, 1000].map(value => {
              const enough = poolGrants.some(row => {
                const presetUnits = unitsFromInput(String(value), row.available.scale);
                return Boolean(presetUnits && BigInt(presetUnits) <= BigInt(row.available.units));
              });
              return <button type="button" key={value} aria-label={`Allocate ₹${value.toLocaleString('en-IN')}`}
                aria-pressed={inputAmount === String(value)} disabled={busy || loading || !enough}
                onClick={() => { setInputAmount(String(value)); invalidatePreview(); }}
                className={`min-h-10 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  inputAmount === String(value) ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                    : 'border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
                }`}>₹{value.toLocaleString('en-IN')}</button>;
            })}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" icon={ArrowRight} onClick={() => void previewAllocation()}
            loading={busy} disabled={loading || !workspaceId || !grant || !units || !amountFitsGrant || !snapshot?.writable}>
            Preview allocation
          </Button>
          {preview && <Button type="button" variant="ghost" size="sm" onClick={invalidatePreview}>Clear preview</Button>}
        </div>
        {preview && (
          <div className="mt-4 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]/40 p-4">
            <h4 className="text-base font-semibold text-[var(--text-primary)]">Review allocation</h4><p className="text-sm text-[var(--text-secondary)]">Check the workspace and amount carefully before continuing.</p>
            <dl className="grid gap-3 text-xs sm:grid-cols-2">
              <div><dt className="text-[var(--text-muted)]">From</dt>
                <dd className="mt-1 font-medium text-[var(--text-primary)]">Organization pool · {friendlyKind(preview.kind)}</dd></div>
              <div><dt className="text-[var(--text-muted)]">To</dt>
                <dd className="mt-1 font-medium text-[var(--text-primary)]">{preview.workspaceName}</dd></div>
              <div><dt className="text-[var(--text-muted)]">Transfer amount</dt>
                <dd className="mt-1 font-semibold tabular-nums text-[var(--text-primary)]">{formatCreditAmount(preview.amount)}</dd></div>
              <div><dt className="text-[var(--text-muted)]">Pool remaining from this grant</dt>
                <dd className="mt-1 font-semibold tabular-nums text-[var(--text-primary)]">{formatCreditAmount(preview.remaining)}</dd></div>
            </dl>
            <p className="text-[11px] leading-5 text-[var(--text-secondary)]">
              These credits keep their original expiry date.
              If the balance changes, check the amounts again before sending.
            </p>
            <Button type="button" variant="primary" size="sm" loading={busy}
              disabled={!snapshot?.transfersEnabled || !snapshot?.writable}
              onClick={() => void confirmAllocation()}>
              Confirm allocation
            </Button>
          </div>
        )}
        </div>
      </Modal>

      <Card padding="sm" className="col-span-12 min-w-0 lg:col-span-6 sm:!p-5">
        <CardHeader title="Workspace balances" icon={ShieldCheck}
          action={chartBalanceOptions.length > 1 ? <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <span className="sr-only">Credit type</span>
            <select aria-label="Workspace balance chart credit type" className="max-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
              value={selectedChartBalance?.key || ''} onChange={event => setSelectedChartBalanceKey(event.target.value)}>
              {chartBalanceOptions.map(option => <option key={option.key} value={option.key}>{friendlyKind(option.kind)} · {option.asset}</option>)}
            </select>
          </label> : undefined} />
        {error && <p role="alert" className="mb-3 rounded-lg border border-rose-300/50 bg-rose-500/5 px-3 py-2 text-xs text-rose-600">{error}</p>}
        {notice && <p role="status" className="mb-3 flex items-center gap-2 text-xs text-[var(--text-primary)]">
          <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-emerald-600" />{notice}</p>}
        {loading && <p role="status" className="mb-3 text-xs text-[var(--text-muted)]">Loading the credit ledger…</p>}
        {snapshot?.uninitialized && <p role="status" className="mb-3 text-xs text-[var(--text-secondary)]">Your credit balance is not ready yet. Contact platform support before allocating credits.</p>}
        {snapshot && !snapshot.uninitialized && !snapshot.writable && (
          <p role="status" className="mb-3 text-xs text-amber-700 dark:text-amber-300">
            This billing account is held or inactive. Allocation is unavailable until the account is reactivated.
          </p>
        )}
        {rowsByWorkspace.length || selectedChartBalance ? <>
          {selectedChartBalance && <div className="mb-4 px-1 py-2">
            <div className="flex flex-col items-center gap-4">
              <PieChart slices={visibleChartSlices} size={240} centerLabel={<div className="max-w-[135px] text-center">
                <p className="truncate text-xs font-bold text-[var(--text-primary)]">{chartTotalAmount ? formatCreditAmount(chartTotalAmount) : '—'}</p>
                <p className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">Available</p>
              </div>} />
            </div>
          </div>}
          {!selectedChartBalance && <p className="text-center text-xs text-[var(--text-muted)]">No credit balances available to chart.</p>}
        </> : <p className="text-xs text-[var(--text-muted)]">No workspace or organization pool balances available.</p>}
      </Card>

      <Card padding="sm" className="col-span-12 min-w-0 lg:col-span-6 sm:!p-5">
        <CardHeader title="Allocation history" subtitle="Credits already sent to workspaces" icon={ShieldCheck} />
        {snapshot?.history.length ? <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-xs">
            <thead className="border-b border-[var(--border)] text-[var(--text-secondary)]">
              <tr><th scope="col" className="pb-3 pr-4 font-medium">Date</th><th scope="col" className="pb-3 pr-4 font-medium">Workspace</th>
                <th scope="col" className="pb-3 pr-4 font-medium">Amount</th><th scope="col" className="pb-3 font-medium">Reference</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-[var(--text-primary)]">
              {snapshot.history.map(row => <tr key={row.id}>
                <td className="py-3 pr-4">{new Date(row.createdAt).toLocaleString('en-IN')}</td>
                <td className="py-3 pr-4 font-medium">{row.workspaceName}</td>
                <td className="py-3 pr-4 font-semibold tabular-nums">{formatCreditAmount(row.amount)}</td>
                <td className="py-3 text-xs text-[var(--text-muted)]"><details><summary className="cursor-pointer">Show ID</summary><span className="mt-1 block break-all font-mono">{row.grantId}</span></details></td>
              </tr>)}
            </tbody>
          </table>
        </div> : <p className="text-xs text-[var(--text-muted)]">No organization-to-workspace transfers recorded yet.</p>}
      </Card>
    </div>
  );
}
