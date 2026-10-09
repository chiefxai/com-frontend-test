import React, { useState } from 'react';
import { billingClient, createBillingMutation } from '../../lib/billing/client';

/** Transfers existing credits; grant and source position must be verified against the ledger. */
export default function ManualCreditTransfer({ orgId }: { orgId: string }) {
  const [grantId, setGrantId] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [units, setUnits] = useState('');
  const [asset, setAsset] = useState('INR');
  const [scale, setScale] = useState('2');
  const [positionVersion, setPositionVersion] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState<{ execute: () => Promise<unknown> } | null>(null);
  const edit = (setter: (value: string) => void, value: string) => { setter(value); setRetry(null); setMessage(''); };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!grantId.trim() || !workspaceId.trim() || !/^[1-9][0-9]*$/.test(units)
      || !/^[A-Z][A-Z0-9._:-]{0,31}$/.test(asset)
      || !/^(?:0|[1-9][0-9]*)$/.test(scale) || Number(scale) > 18
      || !/^(?:0|[1-9][0-9]*)$/.test(positionVersion) || !Number.isSafeInteger(Number(positionVersion))) {
      setMessage('Enter valid grant, workspace, positive integer units, asset, scale and source position version.');
      return;
    }
    const payload = {
      orgId, grantId: grantId.trim(),
      fromScope: { orgId, ownerType: 'organization', ownerId: orgId },
      toScope: { orgId, ownerType: 'workspace', ownerId: workspaceId.trim() },
      amount: { asset, units, scale: Number(scale) },
      expectedPositionVersion: Number(positionVersion),
    };
    const operation = retry || createBillingMutation(options => billingClient.transferCredits(payload, options));
    setRetry(operation); setBusy(true); setMessage('');
    try {
      await operation.execute();
      setRetry(null);
      setMessage('Credit transfer recorded. Refresh the ledger to see the new balance.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Transfer failed. Retry the same operation or refresh the ledger.');
    } finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 p-4">
    <h3 className="font-semibold">Manual workspace credit transfer</h3>
    <p className="text-xs text-slate-500">Enter a grant and its current source position version from the credit ledger. Amount asset and scale must match the grant.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      {([
        ['Grant ID', grantId, setGrantId],
        ['Workspace ID', workspaceId, setWorkspaceId],
        ['Amount (integer units)', units, setUnits],
        ['Asset', asset, setAsset],
        ['Decimal scale', scale, setScale],
        ['Source position version', positionVersion, setPositionVersion],
      ] as const).map(([label, value, setter]) =>
        <label key={label} className="text-xs">{label}<input required className="mt-1 block w-full rounded border p-2" value={value} onChange={event => edit(setter, event.target.value)} /></label>
      )}
    </div>
    {message && <p role="status" className="text-xs">{message}</p>}
    <button type="submit" disabled={busy} className="rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Transferring…' : retry ? 'Retry transfer' : 'Transfer credits'}</button>
  </form>;
}
