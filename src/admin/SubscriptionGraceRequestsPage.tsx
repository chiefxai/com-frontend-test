import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import Button from '../components/ui/Button';
import DataTable, { type Column } from '../components/ui/DataTable';
import Widget from '../components/ui/Widget';
import FilterBar from '../components/ui/FilterBar';
import { newBillingIdempotencyKey } from '../lib/billing/client';
import {
  decidePlatformSubscriptionGraceRequest, listPlatformSubscriptionGraceRequests,
  type PlatformGraceDecision, type PlatformSubscriptionGraceRequest,
} from '../lib/billing/platformDecision';

const dateTime = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : '—';

export default function SubscriptionGraceRequestsPage() {
  const [items, setItems] = useState<PlatformSubscriptionGraceRequest[]>([]);
  const [status, setStatus] = useState<'requested' | 'all'>('requested');
  const [selected, setSelected] = useState<PlatformSubscriptionGraceRequest | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [disabled, setDisabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ decision: PlatformGraceDecision; key: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(''); setDisabled(false);
    try {
      const result = await listPlatformSubscriptionGraceRequests(status);
      setItems(result.items || []);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to load grace requests.';
      setError(message);
      setDisabled((cause as { status?: number })?.status === 503 || (cause as { code?: string })?.code === 'SUBSCRIPTION_GRACE_DISABLED');
      setItems([]);
    } finally { setLoading(false); }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const decide = async (decision: PlatformGraceDecision) => {
    if (!selected || busy) return;
    if (!reason.trim()) { setError('A reason is required and will be recorded with the decision.'); return; }
    const action = pending?.decision === decision ? pending : { decision, key: newBillingIdempotencyKey() };
    setPending(action); setBusy(true); setError('');
    try {
      await decidePlatformSubscriptionGraceRequest(selected, {
        decision, reason: reason.trim(), expectedVersion: selected.version,
        ...(decision === 'approve' ? { grantedUntil: selected.requestedUntil } : {}),
      }, { idempotencyKey: action.key });
      setSuccess(`Grace request ${decision === 'approve' ? 'approved' : 'denied'}. Decision reason: ${reason.trim()}`);
      setSelected(null); setReason(''); setPending(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Grace decision failed. Refresh and retry if the request changed.');
    } finally { setBusy(false); }
  };

  const columns: Column<PlatformSubscriptionGraceRequest>[] = [
    { key: 'organization', header: 'Organization', cell: row => <div><div className="font-medium">{row.organizationName || row.orgId}</div><div className="font-mono text-xs text-[var(--text-muted)]">{row.orgId}</div></div> },
    { key: 'period', header: 'Billing period', cell: row => <div className="text-xs">{dateTime(row.periodStartsAt)}<br />to {dateTime(row.periodEndsAt)}<div className="font-mono text-[var(--text-muted)]">{row.periodId}</div></div> },
    { key: 'requested', header: 'Requested until', cell: row => <span className="whitespace-nowrap">{dateTime(row.requestedUntil)}</span> },
    { key: 'justification', header: 'Justification', cell: row => <span className="line-clamp-3 min-w-48 whitespace-normal">{row.justification}</span> },
    { key: 'requester', header: 'Requested by', cell: row => <span className="font-mono text-xs">{row.requestedBy}</span> },
    { key: 'status', header: 'Status', cell: row => row.status },
    { key: 'action', header: 'Action', cell: row => <button type="button" onClick={() => { setSelected(row); setReason(''); setPending(null); setError(''); }} className="text-[var(--accent)] underline underline-offset-2">{row.status === 'requested' ? 'Review' : 'Audit'}</button> },
  ];

  return <section className="space-y-5">
    {error && <p role="alert" className="rounded-lg border border-rose-200 p-3 text-xs text-rose-700">{error}{disabled && <span className="block pt-1">The grace request queue and decisions are hidden until platform operations enables the feature.</span>}</p>}
    {success && <p role="status" className="rounded-lg border border-emerald-200 p-3 text-xs text-emerald-700">{success}</p>}
    <Widget showHeader={false} padding="none">
      <div className="border-b border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <FilterBar selects={[{ key: 'status', label: 'Request status', value: status,
          onChange: value => { setStatus(value as typeof status); setSelected(null); },
          options: [{ label: 'Requested', value: 'requested' }, { label: 'All requests', value: 'all' }] }]}
          resultCount={{ filtered: items.length, total: items.length, label: 'grace requests loaded' }}
          actions={<Button type="button" size="sm" variant="secondary" icon={RefreshCw} disabled={loading} onClick={() => void load()}>Refresh</Button>} />
      </div>
      <DataTable<PlatformSubscriptionGraceRequest> bare resizable paginated loading={loading && items.length === 0}
        emptyMessage={disabled ? 'Grace requests are unavailable while the feature is disabled.' : 'No matching grace requests.'}
        columns={columns} rows={items} rowKey={row => row.id}
        rowClassName={row => selected?.id === row.id ? 'bg-[var(--bg-subtle)]' : ''} />
    </Widget>
    {selected && <div className="space-y-4 rounded-xl border border-[var(--border)] p-5">
      <h3 className="font-semibold">Grace request · {selected.organizationName || selected.orgId}</h3>
      <p className="text-sm">Organization: <span className="font-mono">{selected.orgId}</span> · Period: <span className="font-mono">{selected.periodId}</span> · Version: {selected.version}</p>
      <p className="text-sm">Billing period: {dateTime(selected.periodStartsAt)} – {dateTime(selected.periodEndsAt)}</p>
      <p className="text-sm">Requested deadline: <strong>{dateTime(selected.requestedUntil)}</strong></p>
      <p className="text-sm">Justification: {selected.justification}</p>
      <p className="text-xs text-[var(--text-muted)]">Request audit: actor {selected.requestedBy} · submitted {dateTime(selected.createdAt)}.</p>
      {!!selected.decisions?.length && <div className="space-y-2 rounded-lg bg-[var(--bg-subtle)] p-3">
        <h4 className="text-sm font-semibold">Decision audit</h4>
        {selected.decisions.map((decision, index) => <div key={`${decision.decidedAt}-${index}`} className="text-xs">
          <strong>{decision.decision}</strong> by <span className="font-mono">{decision.decidedBy}</span> · {dateTime(decision.decidedAt)}
          <p className="mt-1 whitespace-pre-wrap">Reason: {decision.reason}</p>
          {decision.grantedUntil && <p>Granted until: {dateTime(decision.grantedUntil)}</p>}
        </div>)}
      </div>}
      {selected.status === 'requested' && <>
        <label className="block text-sm">Decision reason (required; stored in the audit trail)
          <textarea value={reason} onChange={event => { setReason(event.target.value); setPending(null); }} className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2" rows={3} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy || !reason.trim()} onClick={() => void decide('approve')} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-50">Approve until requested deadline</button>
          <button type="button" disabled={busy || !reason.trim()} onClick={() => void decide('deny')} className="rounded-lg border border-red-600 px-4 py-2 text-sm text-red-600 disabled:opacity-50">Deny</button>
          <button type="button" disabled={busy} onClick={() => setSelected(null)} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm">Close</button>
        </div>
      </>}
      {selected.status !== 'requested' && <div className="text-sm">Decision status: {selected.status}. Granted until: {dateTime(selected.grantedUntil)}.{!selected.decisions?.length && ' Decision history is not available.'}</div>}
    </div>}
  </section>;
}
