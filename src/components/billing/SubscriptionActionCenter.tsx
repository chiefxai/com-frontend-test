import React from 'react';
import { ArrowUpRight, CalendarClock, CreditCard, RefreshCw } from 'lucide-react';
import InitialSubscriptionPurchase from './InitialSubscriptionPurchase';
import SubscriptionRenewal from './SubscriptionRenewal';
import SubscriptionUpgradePreview from './SubscriptionUpgradePreview';
import SubscriptionGraceRequest from './SubscriptionGraceRequest';

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

export default function SubscriptionActionCenter({ canSubmitPayment }: { canSubmitPayment: boolean }) {
  const [selected, setSelected] = React.useState<SubscriptionTask>('renew');
  const current = tasks.find(task => task.key === selected)!;

  return (
    <section className="col-span-12 space-y-4" aria-label="Manage your subscription">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">What would you like to do?</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
          Pick one thing. We'll show you just the steps for that choice.
        </p>
      </div>
      <div role="group" aria-label="Subscription actions" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {tasks.map(({ key, title, description, icon: Icon }) => {
          const active = selected === key;
          return (
            <button type="button" key={key} aria-pressed={active} aria-controls="subscription-task-panel"
              onClick={() => setSelected(key)}
              className={`flex min-h-24 items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${active
                ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
                : 'border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]'}`}>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'}`}>
                <Icon aria-hidden="true" className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[var(--text-primary)]">{title}</span>
                <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{description}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div id="subscription-task-panel" aria-label={current.title} className="min-w-0 space-y-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">{current.title}</h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{current.description}</p>
        </div>
        {selected === 'renew' && <SubscriptionRenewal canSubmit={canSubmitPayment} />}
        {selected === 'start' && <InitialSubscriptionPurchase canSubmit={canSubmitPayment} />}
        {selected === 'upgrade' && <SubscriptionUpgradePreview />}
        {selected === 'more-time' && <SubscriptionGraceRequest />}
      </div>
    </section>
  );
}
