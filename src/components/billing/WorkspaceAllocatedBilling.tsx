import React from 'react';
import { CreditCard, RefreshCw, Wallet } from 'lucide-react';
import { billingClient } from '../../lib/billing/client';
import { formatBillingAmount } from '../../lib/billing/amount';
import type { WorkspaceBillingOverview } from '../../lib/billing/types';
import { Card, CardHeader } from '../ui/Card';
import Button from '../ui/Button';

export default function WorkspaceAllocatedBilling({ workspaceId }: { workspaceId: string }) {
  return <WorkspaceAllocatedBillingContent key={workspaceId} workspaceId={workspaceId} />;
}

function WorkspaceAllocatedBillingContent({ workspaceId }: { workspaceId: string }) {
  const [snapshot, setSnapshot] = React.useState<WorkspaceBillingOverview | null>(null);
  const [error, setError] = React.useState(workspaceId ? '' : 'Select a workspace to view its billing.');
  const [loading, setLoading] = React.useState(Boolean(workspaceId));
  const [revision, setRevision] = React.useState(0);
  React.useEffect(() => {
    let cancelled = false;
    if (!workspaceId) return;
    void billingClient.workspaceOverview(workspaceId).then(result => {
      if (cancelled) return;
      if (result.workspaceId !== workspaceId) throw new Error('The billing response belongs to another workspace.');
      setSnapshot(result);
    }).catch(cause => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load workspace billing.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId, revision]);

  return (
    <div className="col-span-12 grid grid-cols-12 content-start gap-4" id="workspace-allocated-billing">
      <Card padding="sm" className="col-span-12">
        <CardHeader title="Current workspace billing" subtitle={snapshot?.workspaceName || 'Selected workspace'}
          icon={Wallet} action={<Button size="sm" variant="secondary" icon={RefreshCw}
            disabled={loading} onClick={() => {
              setSnapshot(null);
              setError('');
              setLoading(true);
              setRevision(value => value + 1);
            }}>Refresh</Button>} />
        <p className="text-xs text-[var(--text-secondary)]">Subscription and top-up credits allocated to this workspace by your Organization Admin.</p>
        {loading && <p role="status" className="mt-3 text-xs text-[var(--text-muted)]">Loading workspace credits…</p>}
        {error && <p role="alert" className="mt-3 text-xs text-rose-600">{error}</p>}
        {snapshot?.uninitialized && <p role="status" className="mt-3 text-xs text-[var(--text-secondary)]">Billing setup is pending. Contact your Organization Admin.</p>}
        {snapshot && !snapshot.uninitialized && snapshot.status !== 'active' && <p role="status" className="mt-3 text-xs text-[var(--text-secondary)]">Workspace billing is {snapshot.status}. Contact your Organization Admin.</p>}
      </Card>
      {snapshot && !snapshot.uninitialized && (['subscription', 'topup'] as const).map(kind => {
        const balances = snapshot.balances.filter(balance => balance.kind === kind);
        return <Card key={kind} padding="sm" className="col-span-12 md:col-span-6">
          <CardHeader title={kind === 'subscription' ? 'Allocated subscription credits' : 'Allocated top-up credits'}
            subtitle="Current workspace only" icon={kind === 'subscription' ? CreditCard : Wallet} />
          {balances.length === 0 ? <p className="text-xs text-[var(--text-muted)]">No {kind === 'subscription' ? 'subscription' : 'top-up'} credits allocated.</p>
            : <div className="space-y-3">{balances.map((balance, index) => <div key={index} className="rounded-xl border border-[var(--border)] p-3">
              <p className="text-xs text-[var(--text-secondary)]">Available for usage</p>
              <p className="mt-1 text-xl font-semibold text-[var(--text-primary)]">{formatBillingAmount(balance.available)}</p>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">Reserved for active usage: {formatBillingAmount(balance.held)}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{balance.expiresAt
                ? `Expires ${new Date(balance.expiresAt).toLocaleDateString('en-IN')}` : 'No expiry'}</p>
            </div>)}</div>}
        </Card>;
      })}
    </div>
  );
}
