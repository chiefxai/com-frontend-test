import React from 'react';
import { ArrowUpRight, CalendarClock, CreditCard, RefreshCw } from 'lucide-react';
import InitialSubscriptionPurchase from './InitialSubscriptionPurchase';
import SubscriptionRenewal from './SubscriptionRenewal';
import SubscriptionUpgradePreview from './SubscriptionUpgradePreview';
import SubscriptionGraceRequest from './SubscriptionGraceRequest';
import { billingClient } from '../../lib/billing/client';
import { mayAskForMoreTime, mayPreviewUpgrade, renewalNotice } from './billingOverviewHelpers';

type SubscriptionTask = 'start' | 'renew' | 'upgrade' | 'more-time';

const tasks = [
  {
    key: 'renew', title: 'Keep my plan going', description: 'See when your plan ends and what to pay to renew.',
    icon: RefreshCw,
  },
  {
    key: 'start', title: 'Start a new plan', description: 'See the price and how to make your first payment.',
    icon: CreditCard,
  },
  {
    key: 'upgrade', title: 'Look at a bigger plan', description: 'Check a possible upgrade without changing your plan.',
    icon: ArrowUpRight,
  },
  {
    key: 'more-time', title: 'Ask for more time', description: 'Need longer to pay? Ask for a later deadline.',
    icon: CalendarClock,
  },
] as const;

export default function SubscriptionActionCenter({ canSubmitPayment, initialTask = null }: { canSubmitPayment: boolean; initialTask?: SubscriptionTask | null }) {
  const [selected, setSelected] = React.useState<SubscriptionTask | null>(initialTask);
  const [availability, setAvailability] = React.useState<{ renew: boolean; upgrade: boolean; moreTime: boolean } | null>(null);
  const [showDowngradeHelp, setShowDowngradeHelp] = React.useState(false);
  React.useEffect(() => { setSelected(initialTask); }, [initialTask]);
  React.useEffect(() => {
    let active = true;
    void Promise.allSettled([billingClient.subscriptionRenewal(), billingClient.organizationOverview(), billingClient.subscriptionGraceRequests()]).then(([renewal, overview, grace]) => {
      if (!active) return;
      const status = renewal.status === 'fulfilled' ? renewal.value : null;
      const nextPeriod = overview.status === 'fulfilled' && Boolean(overview.value.nextPeriod);
      const eligibility = renewalNotice(status, Date.now(), nextPeriod);
      setAvailability({
        renew: eligibility.canRenew,
        upgrade: mayPreviewUpgrade(status?.subscription.planId),
        moreTime: mayAskForMoreTime(status, grace.status === 'fulfilled' ? grace.value : null, Date.now(), nextPeriod),
      });
    });
    return () => { active = false; };
  }, []);
  const visibleTasks = tasks.filter(task => task.key !== 'renew' || availability?.renew)
    .filter(task => task.key !== 'upgrade' || availability?.upgrade)
    .filter(task => task.key !== 'more-time' || availability?.moreTime);
  // Do not auto-open a purchase or grace form. Only a chosen, eligible action may open.
  const current = visibleTasks.find(task => task.key === selected) || null;
  const activeTask = current?.key;

  return (
    <section className="col-span-12 space-y-4" aria-label="Manage your subscription">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">What would you like to do?</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">Select a button to see the steps. Nothing is charged or changed until you confirm.</p>
      </div>
      {!availability && <p role="status" className="text-sm text-[var(--text-secondary)]">Checking which plan actions are available…</p>}
      <div role="group" aria-label="Subscription actions" className="flex flex-wrap gap-2">
        {availability && visibleTasks.map(({ key, title, description, icon: Icon }) => {
          const active = activeTask === key;
          return (
            <button type="button" key={key} aria-pressed={active} aria-controls="subscription-task-panel"
              onClick={() => setSelected(previous => previous === key ? null : key)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${active
                ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                : 'border-[var(--border)] bg-white text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] dark:bg-[var(--bg-surface)]'}`}>
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />{title}
            </button>
          );
        })}
      </div>
      {availability && current && <div id="subscription-task-panel" aria-label={current.title} className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-[var(--text-secondary)]">{current.description}</p>
          <button type="button" onClick={() => setSelected(null)}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]">Close</button>
        </div>
        {activeTask === 'renew' && <SubscriptionRenewal canSubmit={canSubmitPayment} />}
        {activeTask === 'start' && <InitialSubscriptionPurchase canSubmit={canSubmitPayment} />}
        {activeTask === 'upgrade' && <SubscriptionUpgradePreview />}
        {activeTask === 'more-time' && <SubscriptionGraceRequest />}
      </div>}
      <details className="rounded-xl border border-[var(--border)] p-4 text-sm text-[var(--text-secondary)]">
        <summary className="cursor-pointer font-medium text-[var(--text-primary)]">Other plan choices</summary>
        <p className="mt-2 leading-6">Looking for a lower-cost plan? Your current plan stays the same until the platform team approves a change.</p>
        <button type="button" className="mt-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]" onClick={() => setShowDowngradeHelp(value => !value)}>Downgrade plan</button>
        {showDowngradeHelp && <p role="status" className="mt-2 text-sm">Downgrading is not available as an automatic action yet. Please contact your platform billing administrator to request a lower-cost plan for a future billing period.</p>}
      </details>
    </section>
  );
}
