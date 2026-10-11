import React from 'react';
import { ArrowRight, CheckCircle2, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
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
      <Card padding="sm" className="col-span-12 min-w-0 sm:!p-5">
        <CardHeader title="Organization credit pool" icon={Wallet}
          subtitle="Approved credits belong to your organization until allocated to individual workspaces."
          action={<Button type="button" size="sm" variant="secondary" icon={RefreshCw} onClick={() => void refresh()} disabled={busy || loading}>Refresh</Button>} />
        {error && <p role="alert" className="mb-3 rounded-lg border border-rose-300/50 bg-rose-500/5 px-3 py-2 text-xs text-rose-600">{error}</p>}
        {notice && <p role="status" className="mb-3 flex items-center gap-2 text-xs text-[var(--text-primary)]">
          <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-emerald-600" />{notice}</p>}
        {loading ? <p role="status" className="text-xs text-[var(--text-muted)]">Loading the credit ledger…</p>
          : snapshot?.uninitialized ? (
            <p role="status" className="text-xs leading-5 text-[var(--text-secondary)]">
              The organization billing ledger is not initialized. Contact platform support; legacy wallet values are not shown as allocation credits.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {orgBalances.length ? orgBalances.map(row => (
                <div key={row.kind + '-' + row.available.asset + '-' + row.available.scale}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]/50 px-4 py-3">
                  <p className="text-xs text-[var(--text-secondary)]">{friendlyKind(row.kind)} · Unallocated</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--text-primary)]">{formatCreditAmount(row.available)}</p>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">Held: {formatCreditAmount(row.held)}</p>
                </div>
              )) : <p className="text-xs text-[var(--text-muted)]">No unallocated active credit positions.</p>}
            </div>
          )}
        {snapshot && !snapshot.uninitialized && !snapshot.writable && (
          <p role="status" className="mt-3 text-xs text-amber-700 dark:text-amber-300">
            This billing account is held or inactive. Allocation is unavailable until the account is reactivated.
          </p>
        )}
      </Card>

      <Card padding="sm" className="col-span-12 min-w-0 lg:col-span-7 sm:!p-5">
        <CardHeader title="Manual allocation" subtitle="Preview an exact grant transfer before confirming" icon={ArrowRight} />
        {snapshot && !snapshot.transfersEnabled && (
          <p role="status" className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5 text-xs leading-5 text-[var(--text-secondary)]">
            Preview mode. Live transfers are disabled until the financial ledger is validated and enabled by platform operations.
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
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" icon={ArrowRight} onClick={() => void previewAllocation()}
            loading={busy} disabled={loading || !workspaceId || !grant || !units || !snapshot?.writable}>
            Preview allocation
          </Button>
          {preview && <Button type="button" variant="ghost" size="sm" onClick={invalidatePreview}>Clear preview</Button>}
        </div>
        {preview && (
          <div className="mt-4 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]/40 p-4">
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">Review allocation</h4>
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
              This transfer preserves the original credit grant and expiry.
              A concurrent balance change requires a fresh preview.
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
        <CardHeader title="Workspace balances" subtitle="Spendable and held credits for each workspace" icon={ShieldCheck} />
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
              )) : <p className="mt-1 text-[11px] text-[var(--text-muted)]">No allocated active credits.</p>}
            </div>
          ))}
        </div> : <p className="text-xs text-[var(--text-muted)]">No workspaces available.</p>}
      </Card>

      <Card padding="sm" className="col-span-12 min-w-0 sm:!p-5">
        <CardHeader title="Allocation history" subtitle="Latest 50 organization-to-workspace credit transfers" icon={ShieldCheck} />
        {snapshot?.history.length ? <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-xs">
            <thead className="border-b border-[var(--border)] text-[var(--text-secondary)]">
              <tr><th scope="col" className="pb-3 pr-4 font-medium">Date</th><th scope="col" className="pb-3 pr-4 font-medium">Workspace</th>
                <th scope="col" className="pb-3 pr-4 font-medium">Amount</th><th scope="col" className="pb-3 font-medium">Grant</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-[var(--text-primary)]">
              {snapshot.history.map(row => <tr key={row.id}>
                <td className="py-3 pr-4">{new Date(row.createdAt).toLocaleString('en-IN')}</td>
                <td className="py-3 pr-4 font-medium">{row.workspaceName}</td>
                <td className="py-3 pr-4 font-semibold tabular-nums">{formatCreditAmount(row.amount)}</td>
                <td className="py-3 font-mono text-[11px] text-[var(--text-muted)]">{row.grantId}</td>
              </tr>)}
            </tbody>
          </table>
        </div> : <p className="text-xs text-[var(--text-muted)]">No organization-to-workspace transfers recorded yet.</p>}
      </Card>
    </div>
  );
}
