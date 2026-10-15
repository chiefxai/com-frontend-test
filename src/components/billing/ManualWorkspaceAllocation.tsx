import React from 'react';
import { ArrowRight, CheckCircle2, RefreshCw, ShieldCheck, Wallet, Building2 } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import KpiCard from '../ui/KpiCard';
import Button from '../ui/Button';
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

export default function ManualWorkspaceAllocation() {
  const [snapshot, setSnapshot] = React.useState<ManualAllocationOverview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [grantId, setGrantId] = React.useState('');
  const [workspaceId, setWorkspaceId] = React.useState('');
  const [inputAmount, setInputAmount] = React.useState('');
  const [preview, setPreview] = React.useState<ManualAllocationPreview | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [pending, setPending] = React.useState<ReturnType<typeof createBillingMutation<{ journalId: string; grantId: string }>> | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await billingClient.manualAllocationOverview();
      setSnapshot(next);
      setGrantId(current => next.grants.some(grant => grant.id === current) ? current : '');
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
  const grant = snapshot?.grants.find(row => row.id === grantId);
  const units = grant ? unitsFromInput(inputAmount, grant.available.scale) : null;
  const previewAllocation = async () => {
    if (!grant || !workspaceId || !units) {
      setError('Select an active workspace, a credit grant and a valid positive amount.');
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

  return (
    <div className="col-span-12 grid grid-cols-12 gap-4 md:gap-5" id="manual-credit-allocation">
      {!loading && !snapshot?.uninitialized && orgBalances.length > 0 && (
        <div className="col-span-12 grid grid-cols-12 gap-3">
              {orgBalances.map(row => (
                <KpiCard key={row.kind + '-' + row.available.asset + '-' + row.available.scale}
                  span={{ xs: 12, sm: 6, xl: 4 }} icon={Wallet} iconPosition="top-left"
                  iconBg="var(--accent-subtle)" iconColor="var(--accent)"
                  label={friendlyKind(row.kind) + ' not yet shared'}
                  value={formatCreditAmount(row.available)}
                  sub={`Held: ${formatCreditAmount(row.held)}`} />
              ))}
            </div>
      )}
      <Card padding="sm" className="col-span-12 min-w-0 sm:!p-5">
        <CardHeader title="Organization credit pool" icon={Wallet}
          action={<Button type="button" size="sm" variant="secondary" icon={RefreshCw} onClick={() => void refresh()} disabled={busy || loading}>Refresh</Button>} />
        {error && <p role="alert" className="mb-3 rounded-lg border border-rose-300/50 bg-rose-500/5 px-3 py-2 text-xs text-rose-600">{error}</p>}
        {notice && <p role="status" className="mb-3 flex items-center gap-2 text-xs text-[var(--text-primary)]">
          <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-emerald-600" />{notice}</p>}
        {loading ? <p role="status" className="text-xs text-[var(--text-muted)]">Loading the credit ledger…</p>
          : snapshot?.uninitialized ? <p role="status" className="text-xs text-[var(--text-secondary)]">Your credit balance is not ready yet. Contact platform support before allocating credits.</p>
          : !orgBalances.length ? <p className="text-xs text-[var(--text-muted)]">No unallocated active credit positions.</p> : null}
        {snapshot && !snapshot.uninitialized && !snapshot.writable && (
          <p role="status" className="mt-3 text-xs text-amber-700 dark:text-amber-300">
            This billing account is held or inactive. Allocation is unavailable until the account is reactivated.
          </p>
        )}
      </Card>

      <Card padding="sm" className="col-span-12 min-w-0 lg:col-span-7 sm:!p-5">
        <CardHeader title="Send credits to a workspace" subtitle="Choose where the credits go. Nothing moves until you confirm." icon={ArrowRight} />
        {snapshot && !snapshot.transfersEnabled && (
          <p role="status" className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5 text-xs leading-5 text-[var(--text-secondary)]">
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
            <select aria-label="Credit source" value={grantId} disabled={busy || loading}
              onChange={event => { setGrantId(event.target.value); setInputAmount(''); invalidatePreview(); }}
              className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)]">
              <option value="">Select available credits</option>
              {snapshot?.grants.map(row => <option key={row.id} value={row.id}>
                {friendlyKind(row.kind)} · {formatCreditAmount(row.available)}
                {row.expiresAt ? ' · Expires ' + new Date(row.expiresAt).toLocaleDateString('en-IN') : ''}
              </option>)}
            </select>
          </label>
        </div>
        <label className="mt-3 block max-w-sm text-xs font-semibold text-[var(--text-secondary)]">
          Amount to allocate {grant ? '(' + grant.available.asset + ')' : ''}
          <input aria-label="Amount to allocate" inputMode="decimal" value={inputAmount}
            onChange={event => { setInputAmount(event.target.value); invalidatePreview(); }}
            disabled={busy || !grant}
            placeholder={grant ? 'Enter amount · available ' + formatCreditAmount(grant.available) : 'Select a credit source'}
            className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)]" />
          {grant && <span className="mt-1 block text-[11px] font-normal text-[var(--text-muted)]">
            Available: {formatCreditAmount(grant.available)}
            {grant.expiresAt ? ' · Expires ' + new Date(grant.expiresAt).toLocaleDateString('en-IN') : ' · Does not expire'}
          </span>}
        </label>
        <div className="mt-3">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Quick amounts</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Pick a common amount or type your own above.</p>
          <div role="group" aria-label="Quick allocation amounts" className="mt-2 flex flex-wrap gap-2">
            {[100, 300, 500, 1000].map(value => {
              const presetUnits = grant ? unitsFromInput(String(value), grant.available.scale) : null;
              const enough = Boolean(grant && presetUnits && BigInt(presetUnits) <= BigInt(grant.available.units));
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
            loading={busy} disabled={loading || !workspaceId || !grant || !units || !snapshot?.writable}>
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
      </Card>

      <Card padding="sm" className="col-span-12 min-w-0 lg:col-span-5 sm:!p-5">
        <CardHeader title="Workspace balances" subtitle="See how many credits each workspace can use" icon={ShieldCheck} />
        <p className="mb-3 flex items-start gap-2 text-xs leading-5 text-[var(--text-secondary)]"><Building2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> Workspace balances are separate from the organization pool above.</p>
        {rowsByWorkspace.length ? <div className="max-h-[390px] space-y-3 overflow-auto">
          {rowsByWorkspace.map(row => (
            <div key={row.id} className="rounded-xl border border-[var(--border)] px-3 py-2.5">
              <p className="text-xs font-semibold text-[var(--text-primary)]">{row.name}
                {row.status.toLowerCase() !== 'active' && <span className="ml-2 text-[11px] font-normal text-[var(--text-muted)]">({row.status})</span>}
              </p>
              {row.balances.length ? row.balances.map(balance => (
                <p key={balance.kind + balance.available.asset + balance.available.scale}
                  className="mt-1 flex flex-wrap justify-between gap-2 text-[11px] text-[var(--text-secondary)]">
                  <span>{friendlyKind(balance.kind)}</span>
                  <span className="font-semibold tabular-nums">{formatCreditAmount(balance.available)}
                    {BigInt(balance.held.units) > 0n ? ' · Held ' + formatCreditAmount(balance.held) : ''}</span>
                </p>
              )) : <p className="mt-1 text-[11px] text-[var(--text-muted)]">No credits given to this workspace yet.</p>}
            </div>
          ))}
        </div> : <p className="text-xs text-[var(--text-muted)]">No workspaces available.</p>}
      </Card>

      <Card padding="sm" className="col-span-12 min-w-0 sm:!p-5">
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
