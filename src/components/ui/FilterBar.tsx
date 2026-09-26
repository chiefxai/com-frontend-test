import React from 'react';
import { X } from 'lucide-react';
import FilterDropdown, { CommonFilterOption } from './FilterDropdown';

export interface FilterSelect {
  key: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options?: { label: string; value: string }[];
  groups?: { label: string; options: { label: string; value: string }[] }[];
  placeholder?: string;
}

export interface FilterDate {
  key: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}

export interface FilterBarProps {
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
  selects?: FilterSelect[];
  dates?: FilterDate[];
  actions?: React.ReactNode;
  className?: string;
  onClear?: () => void;
  hasActiveFilters?: boolean;
  resultCount?: { filtered: number; total: number; label?: string };
}

export default function FilterBar({
  search,
  selects = [],
  dates = [],
  actions,
  className = '',
  onClear,
  hasActiveFilters = false,
  resultCount,
}: FilterBarProps) {
  const filters: CommonFilterOption[] = [
    ...selects.map((filter) => ({
      ...filter,
      type: 'select' as const,
    })),
    ...dates.map((date) => ({
      key: date.key,
      label: date.label,
      value: date.value,
      onChange: date.onChange,
      type: 'date' as const,
      active: Boolean(date.value),
    })),
  ];

  const hasFilters = filters.length > 0 || Boolean(search);

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap ${className}`}>
      {hasFilters && (
        <FilterDropdown
          filters={filters}
          search={search}
          onClear={onClear}
          hasActiveFilters={hasActiveFilters || Boolean(search?.value)}
        />
      )}

      {resultCount && (
        <span
          className="text-[11px] px-2.5 py-1.5 rounded-lg border whitespace-nowrap"
          style={{
            borderColor: 'var(--border)',
            color: 'var(--text-secondary)',
            background: 'var(--bg-subtle)',
          }}
        >
          <strong style={{ color: 'var(--text-primary)' }}>{resultCount.filtered}</strong>{' '}
          of {resultCount.total} {resultCount.label ?? 'results'}
        </span>
      )}

      {onClear && hasActiveFilters && !hasFilters && (
        <button
          type="button"
          onClick={onClear}
          className="h-8 inline-flex items-center gap-1.5 px-2.5 rounded-lg border text-[11px] font-semibold transition-colors hover:bg-[var(--bg-subtle)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <X className="h-3.5 w-3.5" />
          Clear
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
