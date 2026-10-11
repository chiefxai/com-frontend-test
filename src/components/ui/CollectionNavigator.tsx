import React from 'react';
import Widget from './Widget';
import SearchInput from './SearchInput';
import EmptyState from './EmptyState';

export interface CollectionNavigatorProps {
  title: string;
  description: string;
  icon: React.ElementType;
  totalCount: number;
  visibleCount: number;
  sectionLabel: string;
  itemLabel: string;
  action?: React.ReactNode;
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
  };
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/**
 * Shared workspace list navigator for campaigns, inbound numbers and future
 * master/detail screens. Owns the consistent header, filtering, scroll area
 * and no-data/no-search-results states while callers render their list items.
 */
export default function CollectionNavigator({
  title,
  description,
  icon: Icon,
  totalCount,
  visibleCount,
  sectionLabel,
  itemLabel,
  action,
  search,
  emptyTitle,
  emptyDescription,
  emptyAction,
  className = '',
  children,
}: CollectionNavigatorProps) {
  const searching = Boolean(search?.value.trim());
  const noResults = searching && totalCount > 0 && visibleCount === 0;
  const count = searching
    ? `${visibleCount} of ${totalCount} ${itemLabel}`
    : `${totalCount} ${itemLabel}`;

  return (
    <Widget
      colSpan={3}
      showHeader={false}
      padding="none"
      bodyOverflow="hidden"
      bodyClassName="min-h-0 flex flex-col"
      className={`!col-span-12 lg:!col-span-3 xl:!col-span-3 h-full min-h-0 overflow-hidden rounded-2xl border-[var(--border)] shadow-sm ${className}`}
    >
      <section aria-label={`${title} navigator`} className="flex min-h-0 h-full flex-col">
        <div className="shrink-0 border-b border-[var(--border)] px-4 pb-4 pt-4">
          <div className="flex min-w-0 items-start gap-3">
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)]">
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 className="truncate text-sm font-semibold leading-5 text-[var(--text-primary)]">{title}</h2>
              <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-muted)]">{description}</p>
            </div>
            {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
          </div>
          {search && (
            <div className="mt-4">
              <SearchInput
                value={search.value}
                onChange={search.onChange}
                placeholder={search.placeholder}
              />
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border)]/70 bg-[var(--bg-subtle)]/45 px-4 py-3">
          <h3 className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)]">{sectionLabel}</h3>
          <span role="status" aria-live="polite" className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] font-medium tabular-nums text-[var(--text-muted)]">
            {count}
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-2.5 pb-3 pt-2.5">
          {visibleCount > 0 ? (
            <div className="space-y-2">{children}</div>
          ) : (
            <EmptyState
              icon={Icon}
              heading={noResults ? 'No matches found' : emptyTitle}
              message={noResults ? 'Try another search term or clear your search to see all items.' : emptyDescription}
              action={noResults ? (
                <button
                  type="button"
                  onClick={() => search?.onChange('')}
                  className="rounded-lg px-3 py-2 text-xs font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  Clear search
                </button>
              ) : emptyAction}
              className="min-h-[220px] flex-1 !px-4 !py-6"
            />
          )}
        </div>
      </section>
    </Widget>
  );
}
