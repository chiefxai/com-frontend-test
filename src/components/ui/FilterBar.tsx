import React from 'react';
import { Filter, X } from 'lucide-react';
import SearchInput from './SearchInput';

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

// ── Select control ───────────────────────────────────────────────────────────

function Select({ label, value, onChange, options, groups, placeholder }: FilterSelect) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span
        className="text-[10px] font-bold uppercase tracking-wider leading-none px-0.5"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs rounded-lg px-2.5 py-1.5 border focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all appearance-none pr-7 cursor-pointer"
        style={{
          background: 'var(--bg-subtle)',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 8px center',
        }}
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {groups
          ? groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </optgroup>
            ))
          : options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
      </select>
    </div>
  );
}

// ── Date input ───────────────────────────────────────────────────────────────

function DateInput({ label, value, onChange }: FilterDate) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span
        className="text-[10px] font-bold uppercase tracking-wider leading-none px-0.5"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs rounded-lg px-2.5 py-1.5 border focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
        style={{
          background: 'var(--bg-subtle)',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        }}
      />
    </div>
  );
}

// ── FilterBar ────────────────────────────────────────────────────────────────

export default function FilterBar({
  search,
  selects,
  dates,
  actions,
  className = '',
  onClear,
  hasActiveFilters = false,
  resultCount,
}: FilterBarProps) {
  const hasFilters = (selects && selects.length > 0) || (dates && dates.length > 0);

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-end gap-3 flex-wrap ${className}`}
    >
      {/* Search */}
      {search && (
        <SearchInput
          value={search.value}
          onChange={search.onChange}
          placeholder={search.placeholder ?? 'Search…'}
          className="flex-1 min-w-[180px] max-w-sm"
        />
      )}

      {/* Selects + dates */}
      {hasFilters && (
        <div className="flex items-end gap-3 flex-wrap">
          {selects?.map((s) => <Select key={s.key} {...s} />)}
          {dates?.map((d) => <DateInput key={d.key} {...d} />)}
        </div>
      )}

      {/* Filter controls */}
      {(selects?.length || dates?.length) ? (
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] shrink-0">
          <Filter className="h-3.5 w-3.5" /> Filters
        </div>
      ) : null}

      {onClear && hasActiveFilters && (
        <button
          type="button"
          onClick={onClear}
          className="h-8 inline-flex items-center gap-1.5 px-2.5 rounded-lg border text-[11px] font-semibold transition-colors hover:bg-[var(--bg-subtle)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <X className="h-3.5 w-3.5" /> Clear
        </button>
      )}

      {resultCount && (
        <span className="text-[11px] px-2.5 py-1.5 rounded-lg border whitespace-nowrap" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-subtle)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>{resultCount.filtered}</strong> of {resultCount.total} {resultCount.label ?? 'results'}
        </span>
      )}

      {/* Actions */}
      {actions && (
        <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
          {actions}
        </div>
      )}
    </div>
  );
}
