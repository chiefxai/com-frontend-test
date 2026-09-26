import React from 'react';
import { X } from 'lucide-react';
import SearchInput from './SearchInput';
import FilterDropdown from './FilterDropdown';

// ── Types ────────────────────────────────────────────────────────────────────

export interface FilterSelect {
  key: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Flat option list — ignored when `groups` is also given. */
  options?: { label: string; value: string }[];
  /** Renders <optgroup> sections instead of a flat list (e.g. tasks grouped by their source workflow). */
  groups?: { label: string; options: { label: string; value: string }[] }[];
  /** Shown as a disabled first option when the select otherwise has no natural "none" value. */
  placeholder?: string;
}

export interface FilterDate {
  key: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}

export interface FilterBarProps {
  /** Controlled search value + setter. Omit to hide the search box. */
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
  /** Dropdown filter controls */
  selects?: FilterSelect[];
  /** Date range / single date inputs */
  dates?: FilterDate[];
  /** Extra JSX rendered after the filters (buttons, badges, etc.) */
  actions?: React.ReactNode;
  /** Extra classes on the outer wrapper */
  className?: string;
  /** Optional clear-all control for shared filter state. */
  onClear?: () => void;
  /** Whether any filter/search is currently active. */
  hasActiveFilters?: boolean;
  /** Optional result summary rendered before actions. */
  resultCount?: { filtered: number; total: number; label?: string };
}

// ── Date input ───────────────────────────────────────────────────────────────

function DateInput({ label, value, onChange }: FilterDate) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap ${className}`}>
      {search && (
        <SearchInput
          value={search.value}
          onChange={search.onChange}
          placeholder={search.placeholder ?? 'Search…'}
          className="flex-1 min-w-[180px] max-w-sm"
        />
      )}

      {hasFilterItems && (
        <FilterDropdown
          filters={filterItems}
          onClear={onClear}
          hasActiveFilters={hasActiveFilters}
        />
      )}

      {resultCount && (
        <span
          className="text-[11px] px-2.5 py-1.5 rounded-lg border whitespace-nowrap"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-subtle)' }}
        >
          <strong style={{ color: 'var(--text-primary)' }}>{resultCount.filtered}</strong> of {resultCount.total} {resultCount.label ?? 'results'}
        </span>
      )}

      {onClear && hasActiveFilters && !hasFilterItems && (
        <button
          type="button"
          onClick={onClear}
          className="h-8 inline-flex items-center gap-1.5 px-2.5 rounded-lg border text-[11px] font-semibold transition-colors hover:bg-[var(--bg-subtle)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <X className="h-3.5 w-3.5" /> Clear
        </button>
      )}

      {actions && (
        <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
          {actions}
        </div>
      )}
    </div>
  );
}
