import React from 'react';
import { CreditCard, RefreshCw, CheckCircle2, Info } from 'lucide-react';
import { billingClient } from '../../lib/billing/client';
import type { BillingAmount, SubscriptionCreditStatus } from '../../lib/billing/types';
import { Card, CardHeader } from '../ui/Card';
import KpiCard from '../ui/KpiCard';
import Button from '../ui/Button';

const displayInr = (amount: BillingAmount | null): string => {
  if (!amount) return 'Not verified';
  if (amount.asset !== 'INR' || amount.scale !== 2) return amount.asset + ' ' + amount.units;
  const units = BigInt(amount.units);
  const whole = (units / 100n).toLocaleString('en-IN');
  return `₹${whole}.${(units % 100n).toString().padStart(2, '0')}`;
};

const explanations: Record<SubscriptionCreditStatus['state'], string> = {
  unverified_plan: 'We cannot confirm how many monthly credits came with this older plan. Ask platform support to check it.',
  no_included_credits: 'This plan does not include monthly credits. You can still use approved extra credits if available.',
  awaiting_approved_subscription: 'Your plan includes monthly credits, but they are waiting for an approved payment and an active subscription period.',
  awaiting_period_activation: 'Your payment is approved. Credits will be added when the paid period starts.',
  activation_incomplete: 'Your paid period is active, but the expected credits have not appeared. Contact platform support to check them. Do not add them manually.',
  issued_to_organization_pool: 'Your monthly plan credits have been added to the organization credit pool. An organization admin can share them with workspaces.',
  issued_to_workspace: 'Your monthly plan credits are available in your single entitled workspace.',
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
      <CardHeader title="Monthly usage credits" subtitle="See what your plan includes and what has actually been added"
        icon={CreditCard}
        action={<Button type="button" size="sm" variant="secondary" icon={RefreshCw}
          disabled={loading} onClick={() => void load()}>Refresh status</Button>} />
      {loading ? <p role="status" className="text-xs text-[var(--text-muted)]">Checking subscription credit status…</p>
        : error ? <p role="alert" className="text-xs text-rose-600">{error}</p>
          : status && (
            <div className="space-y-3">
              <div className="grid grid-cols-12 gap-3">
                <KpiCard span={{ xs: 12, sm: 6 }} icon={CreditCard} iconPosition="top-left"
                  iconBg="var(--accent-subtle)" iconColor="var(--accent)"
                  label={`Credits promised each month (${status.planName || 'your plan'})`}
                  value={displayInr(status.configuredMonthlyCredits)} />
                <KpiCard span={{ xs: 12, sm: 6 }} icon={CheckCircle2} iconPosition="top-left"
                  iconBg="var(--accent-subtle)" iconColor="var(--accent)"
                  label="Credits added this period"
                  value={displayInr(status.issuedThisPeriod || (status.state === 'unverified_plan' ? null : { asset: 'INR', units: '0', scale: 2 }))} />
              </div>
              <p role="status" className="flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4 text-sm leading-6 text-[var(--text-secondary)]">
                  {status.state === 'issued_to_organization_pool'
                    ? <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    : <Info aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" />}
                  <span>{explanations[status.state]}</span>
                </p>
              {status.entitlementSource === 'matching_platform_plan_version' && (
                <p className="text-[11px] text-[var(--text-muted)]">
                  We found a matching plan record from before the credit tracking update. This check did not add any credits.
                </p>
              )}
            </div>
          )}
    </Card>
  );
}
