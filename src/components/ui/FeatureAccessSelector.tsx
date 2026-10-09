import React, { useId, useMemo, useState } from 'react';
import { Check, Layers3, Search, Sparkles, X } from 'lucide-react';
import { FEATURE_REGISTRY } from '../../features/feature-flags/registry';
import { getAllFlagGroups } from '../../features/feature-flags/flagGroups';

interface FeatureAccessSelectorProps {
  availableKeys: string[];
  value: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
  label?: string;
}

/**
 * Inline, scroll-contained feature permission editor for forms and modals.
 * Unlike the legacy popup picker it cannot be clipped by a table or dialog.
 * The value is always controlled by the parent, so reopening starts from
 * the actual saved permissions rather than stale internal picker state.
 */
export default function FeatureAccessSelector({
  availableKeys, value, onChange, disabled = false, label = 'Feature access',
}: FeatureAccessSelectorProps) {
  const inputId = useId();
  const [query, setQuery] = useState('');
  const allowed = useMemo(() => new Set(availableKeys), [availableKeys]);
  const selected = useMemo(() => new Set(value), [value]);
  const features = useMemo(
    () => FEATURE_REGISTRY.filter(feature => allowed.has(feature.key)),
    [allowed],
  );
  const groups = useMemo(
    () => getAllFlagGroups()
      .map(group => ({
        ...group,
        selectableKeys: group.flagKeys.filter(key => allowed.has(key)),
      }))
      .filter(group => group.selectableKeys.length > 0),
    [allowed],
  );
  const term = query.trim().toLowerCase();
  const visibleFeatures = features.filter(feature =>
    !term || (feature.label + ' ' + feature.description + ' ' + feature.key)
      .toLowerCase().includes(term));
  const activeCount = features.filter(feature => selected.has(feature.key)).length;

  const toggleKeys = (keys: string[], enabled: boolean) => {
    const next = new Set(value);
    for (const key of keys) {
      if (!allowed.has(key)) continue;
      if (enabled) next.add(key);
      else next.delete(key);
    }
    onChange([...next]);
  };

  return (
    <section aria-label={label} className="min-w-0 space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-[var(--text-primary)]">{label}</h3>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            Choose which organization-approved features this member can use.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="font-semibold text-[var(--text-secondary)]">
            {activeCount} of {features.length} selected
          </span>
          {activeCount > 0 && (
            <button type="button" disabled={disabled}
              onClick={() => toggleKeys(features.map(feature => feature.key), false)}
              className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline disabled:opacity-50">
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {features.length === 0 ? (
        <p role="status" className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-6 text-xs text-[var(--text-muted)]">
          No product features are currently available for assignment. Ask an organization administrator to review the organization feature entitlements.
        </p>
      ) : (
        <>
          {groups.length > 0 && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)]">
                <Layers3 className="h-3.5 w-3.5" /> Feature groups
              </p>
              <div className="flex flex-wrap gap-2">
                {groups.map(group => {
                  const allSelected = group.selectableKeys.every(key => selected.has(key));
                  return (
                    <button key={group.key} type="button"
                      aria-pressed={allSelected} disabled={disabled}
                      title={group.description}
                      onClick={() => toggleKeys(group.selectableKeys, !allSelected)}
                      className={'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-left text-[11px] font-semibold transition-colors disabled:opacity-50 ' +
                        (allSelected
                          ? 'border-[var(--accent)] bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                          : 'border-[var(--border)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]')}>
                      {allSelected ? <Check className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
                      {group.label}
                      <span className="text-[10px] opacity-70">{group.selectableKeys.length}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)]" htmlFor={inputId}>
              Individual features
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
              <input id={inputId} type="search" value={query} disabled={disabled}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search features by name or description…"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] py-2.5 pl-9 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
            </div>
            <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto overscroll-contain pr-1 sm:grid-cols-2">
              {visibleFeatures.map(feature => {
                const checked = selected.has(feature.key);
                return (
                  <label key={feature.key}
                    className={'flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition-colors ' +
                      (checked
                        ? 'border-[var(--accent)] bg-[var(--bg-subtle)]'
                        : 'border-[var(--border)] bg-[var(--bg-base)] hover:bg-[var(--bg-subtle)]')}>
                    <input type="checkbox" checked={checked} disabled={disabled}
                      onChange={event => toggleKeys([feature.key], event.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]" />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-[var(--text-primary)]">{feature.label}</span>
                      <span className="mt-1 block text-[11px] leading-relaxed text-[var(--text-muted)]">{feature.description}</span>
                    </span>
                  </label>
                );
              })}
              {visibleFeatures.length === 0 && (
                <p className="col-span-full py-5 text-center text-xs text-[var(--text-muted)]">
                  No features match your search.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
