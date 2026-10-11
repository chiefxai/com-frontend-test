import React from 'react';
import { CreditCard, RefreshCw } from 'lucide-react';
import { billingClient } from '../../lib/billing/client';
import type { BillingAmount, SubscriptionCreditStatus } from '../../lib/billing/types';
import { Card, CardHeader } from '../ui/Card';
import Button from '../ui/Button';

const displayInr = (amount: BillingAmount | null): string => {
  if (!amount) return 'Not verified';
  if (amount.asset !== 'INR' || amount.scale !== 2) return amount.asset + ' ' + amount.units;
  const units = BigInt(amount.units);
  const whole = (units / 100n).toLocaleString('en-IN');
  return `₹${whole}.${(units % 100n).toString().padStart(2, '0')}`;
};

const explanations: Record<SubscriptionCreditStatus['state'], string> = {
  unverified_plan: 'This organization was created with a legacy plan whose original monthly-credit amount cannot be verified. Ask the platform team to reconcile the original plan snapshot.',
  no_included_credits: 'This organization plan has no included monthly usage credits.',
  awaiting_approved_subscription: 'Monthly credits are configured, but no approved and funded subscription period is active. The platform team must approve the subscription purchase before credits can be issued.',
  awaiting_period_activation: 'The subscription payment has been approved. The funded subscription period is awaiting billing-lifecycle activation.',
  activation_incomplete: 'The billing period is active, but its included credit grant is missing. Contact platform support to reconcile the subscription ledger; do not issue credits manually.',
  issued_to_organization_pool: 'Subscription credits have been issued to the organization credit pool. An Organization Admin can distribute them to workspaces through Allocation.',
};

export default function SubscriptionCreditStatusPanel() {
  const [status, setStatus] = React.useState<SubscriptionCreditStatus | null>(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try { setStatus(await billingClient.subscriptionCreditStatus()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not check plan credits.'); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  return (
    <Card padding="sm" className="col-span-12 min-w-0 sm:!p-5">
      <CardHeader title="Monthly usage credits" subtitle="Plan entitlement versus credits actually issued"
        icon={CreditCard}
        action={<Button type="button" size="sm" variant="secondary" icon={RefreshCw}
          disabled={loading} onClick={() => void load()}>Refresh status</Button>} />
      {loading ? <p role="status" className="text-xs text-[var(--text-muted)]">Checking subscription credit status…</p>
        : error ? <p role="alert" className="text-xs text-rose-600">{error}</p>
          : status && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]/50 p-3">
                  <p className="text-xs text-[var(--text-secondary)]">Included in {status.planName || 'the selected plan'} / month</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--text-primary)]">{displayInr(status.configuredMonthlyCredits)}</p>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]/50 p-3">
                  <p className="text-xs text-[var(--text-secondary)]">Issued for this billing period</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--text-primary)]">
                    {displayInr(status.issuedThisPeriod || (status.state === 'unverified_plan' ? null : { asset: 'INR', units: '0', scale: 2 }))}
                  </p>
                </div>
              </div>
              <p role="status" className="text-xs leading-5 text-[var(--text-secondary)]">{explanations[status.state]}</p>
              {status.entitlementSource === 'matching_platform_plan_version' && (
                <p className="text-[11px] text-[var(--text-muted)]">
                  This organization predates the credit-snapshot fix. The allowance matches the still-current platform plan version; no credits were automatically issued during reconciliation.
                </p>
              )}
            </div>
          )}
    </Card>
  );
}
