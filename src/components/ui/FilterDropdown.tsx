import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Filter, RotateCcw, Search } from 'lucide-react';

export interface CommonFilterOption {
  key: string;
  label: string;
  value: string;
  options?: { label: string; value: string }[];
  groups?: { label: string; options: { label: string; value: string }[] }[];
  placeholder?: string;
  onChange: (value: string) => void;
  active?: boolean;
  type?: 'select' | 'date';
}

export interface CommonFilterDropdownProps {
  filters: CommonFilterOption[];
  search?: { value: string; onChange: (value: string) => void; placeholder?: string };
  onClear?: () => void;
  hasActiveFilters?: boolean;
  label?: string;
}

export default function FilterDropdown({
  filters,
  search,
  onClear,
  hasActiveFilters = false,
  label = 'Filters',
}: CommonFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  const activeCount = filters.filter((filter) => filter.active ?? (
    filter.value !== '' &&
    filter.value !== 'all' &&
    filter.value !== 'All'
  )).length;

  const renderOptions = (filter: CommonFilterOption) => (
    <>
      {filter.placeholder && <option value="" disabled>{filter.placeholder}</option>}
      {filter.groups
        ? filter.groups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </optgroup>
          ))
        : filter.options?.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
    </>
  );

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="h-8 inline-flex items-center gap-1.5 px-2.5 rounded-lg border text-[11px] font-semibold transition-colors hover:bg-[var(--bg-subtle)]"
        style={{
          borderColor: hasActiveFilters ? '#60a5fa' : 'var(--border)',
          color: hasActiveFilters ? '#2563eb' : 'var(--text-secondary)',
          background: hasActiveFilters ? 'rgba(37,99,235,0.06)' : 'var(--bg-surface)',
        }}
      >
        <Filter className="h-3.5 w-3.5" />
        {label}
        {activeCount > 0 && (
          <span className="min-w-4 h-4 px-1 rounded-full bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center">
            {activeCount}
          </span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 z-50 w-[min(360px,calc(100vw-32px))] rounded-xl border shadow-xl p-3"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <div>
              <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{label}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Select filters to narrow the results
              </p>
            </div>
            {onClear && hasActiveFilters && (
              <button
                type="button"
                onClick={onClear}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-700"
              >
                <RotateCcw className="h-3 w-3" /> Clear
              </button>
            )}
          </div>

          {search && (
            <div className="mb-2 relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
              <input
                type="search"
                value={search.value}
                onChange={(event) => search.onChange(event.target.value)}
                placeholder={search.placeholder ?? 'Search…'}
                className="w-full h-9 rounded-lg border pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
          )}

          <div className="max-h-[min(60vh,420px)] overflow-y-auto space-y-2 pr-0.5">
            {filters.map((filter) => {
              const isActive = filter.active ?? (
                filter.value !== '' &&
                filter.value !== 'all' &&
                filter.value !== 'All'
              );
              return (
                <label
                  key={filter.key}
                  className="block rounded-lg border p-2.5 transition-colors"
                  style={{
                    borderColor: isActive ? '#93c5fd' : 'var(--border)',
                    background: isActive ? 'rgba(37,99,235,0.04)' : 'var(--bg-subtle)',
                  }}
                >
                  <span className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    {isActive && <Check className="h-3 w-3 text-blue-600" />}
                    {filter.key}
                  </span>
                  {filter.type === 'date' ? (
                    <input
                      type="date"
                      value={filter.value}
                      onChange={(event) => filter.onChange(event.target.value)}
                      className="w-full text-xs rounded-lg px-2.5 py-2 border focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      style={{
                        background: 'var(--bg-surface)',
                        borderColor: 'var(--border)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  ) : (
                    <select
                      value={filter.value}
                      onChange={(event) => filter.onChange(event.target.value)}
                      className="w-full text-xs rounded-lg px-2.5 py-2 border focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer"
                      style={{
                        background: 'var(--bg-surface)',
                        borderColor: 'var(--border)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {renderOptions(filter)}
                    </select>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
