import React from 'react';
import { CreditCard, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import PaymentReviewsPage from './PaymentReviewsPage';
import SubscriptionGraceRequestsPage from './SubscriptionGraceRequestsPage';

export type ReviewType = 'payments' | 'grace';

/** Fallback to payment verification for absent or unsupported links. */
export function resolveReviewType(value: string | null): ReviewType {
  return value === 'grace' ? 'grace' : 'payments';
}

/**
 * One platform review destination, with the type in the URL so deep links,
 * browser Back, and existing bookmarks continue to work.
 *
 * Each workflow is mounted only when selected: approvals, audit history,
 * amount verification and idempotency keys remain managed by the original view.
 */
export default function ReviewCenterPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const type = resolveReviewType(searchParams.get('type'));

  const changeType = (nextType: ReviewType) => {
    setSearchParams(previous => {
      const params = new URLSearchParams(previous);
      params.set('type', nextType);
      return params;
    });
  };

  const isPayment = type === 'payments';

  return (
    <section className="space-y-4" aria-label="Reviews and requests">
      <div className="flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)]">
            {isPayment ? <CreditCard className="h-5 w-5" aria-hidden="true" /> : <ShieldCheck className="h-5 w-5" aria-hidden="true" />}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Reviews &amp; Requests</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
              {isPayment
                ? 'Verify payment evidence and review subscription, top-up, or workspace purchases.'
                : 'Review subscription grace periods, decisions, and their audit history.'}
            </p>
          </div>
        </div>

        <label htmlFor="platform-review-type" className="flex shrink-0 flex-col gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)]">
          Review type
          <select
            id="platform-review-type"
            value={type}
            onChange={event => changeType(event.target.value as ReviewType)}
            className="h-10 min-w-[235px] cursor-pointer rounded-xl border border-[var(--border)] bg-[var(--bg-base)] px-3 text-xs font-medium text-[var(--text-primary)] shadow-sm outline-none transition-colors hover:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/25"
          >
            <option value="payments">Payment Reviews</option>
            <option value="grace">Subscription Grace Requests</option>
          </select>
        </label>
      </div>

      {isPayment ? <PaymentReviewsPage /> : <SubscriptionGraceRequestsPage />}
    </section>
  );
}
