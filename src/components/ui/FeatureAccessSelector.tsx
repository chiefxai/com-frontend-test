import React, { useId, useMemo, useState } from 'react';
import { Check, CheckCheck, Layers3, Search, ShieldCheck, X } from 'lucide-react';
import { FEATURE_REGISTRY } from '../../features/feature-flags/registry';
import { getAllFlagGroups } from '../../features/feature-flags/flagGroups';

interface FeatureAccessSelectorProps {
  /** Only these feature keys may be assigned from this screen. */
  availableKeys: string[];
  /** Controlled grants; unknown keys are preserved unless explicitly cleared elsewhere. */
  value: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
}

/**
 * One shared, inline permission selector across Platform Admin organization
 * creation and Organization Administration's Add Member / Grant Access forms.
 * No floating dropdown: groups and individual flags remain visible and usable
 * inside narrow forms, modals and scroll containers.
 */
export default function FeatureAccessSelector({
  availableKeys,
  value,
  onChange,
  disabled = false,
  label = 'Feature Access',
  description = 'Choose which product features should be available.',
}: FeatureAccessSelectorProps) {
  const searchId = useId();
  const [search, setSearch] = useState('');

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

  const term = search.trim().toLowerCase();
  const visibleFeatures = features.filter(feature =>
    !term || (feature.label + ' ' + feature.description + ' ' + feature.key)
      .toLowerCase().includes(term),
  );
  const selectedCount = features.filter(feature => selected.has(feature.key)).length;

  const changeGrants = (keys: string[], enable: boolean) => {
    if (disabled) return;
    const next = new Set(value);
    keys.forEach(key => {
      if (!allowed.has(key)) return;
      if (enable) next.add(key);
      else next.delete(key);
    });
    onChange([...next]);
  };

  const selectAll = () => changeGrants(features.map(feature => feature.key), true);
  const clearSelection = () => changeGrants(features.map(feature => feature.key), false);

  return (
    <section
      aria-label={label}
      className="@container min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] px-4 py-4 sm:px-5">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{label}</h3>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-[var(--text-muted)]">{description}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span role="status" aria-live="polite"
            className="whitespace-nowrap rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)]">
            {selectedCount} / {features.length} selected
          </span>
        </div>
      </div>

      {features.length === 0 ? (
        <div role="status" className="px-5 py-8">
          <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-6 text-center text-xs leading-relaxed text-[var(--text-secondary)]">
            No features are currently available to grant here.
          </p>
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-1 @xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.55fr)]">
          <div className="min-w-0 space-y-3 border-b border-[var(--border)] p-4 sm:p-5 @xl:border-b-0 @xl:border-r">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                <Layers3 className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                Feature groups
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
                Add or remove a complete set of features in one click.
              </p>
            </div>
            <div role="group" aria-label="Feature group presets"
              className="grid max-h-[min(22rem,45vh)] grid-cols-1 gap-2 overflow-y-auto overscroll-contain pr-1 @md:grid-cols-2 @xl:grid-cols-1">
              {groups.map(group => {
                const included = group.selectableKeys.filter(key => selected.has(key)).length;
                const fullySelected = included === group.selectableKeys.length;
                const partiallySelected = included > 0 && !fullySelected;
                return (
                  <button key={group.key} type="button" disabled={disabled}
                    title={group.description}
                    aria-label={group.label + ', ' + included + ' of ' + group.selectableKeys.length + ' features selected'}
                    aria-pressed={fullySelected}
                    onClick={() => changeGrants(group.selectableKeys, !fullySelected)}
                    className={
                      'group flex min-w-0 items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 ' +
                      (fullySelected
                        ? 'border-blue-400 bg-blue-50/60 dark:border-blue-600 dark:bg-blue-500/10'
                        : 'border-[var(--border)] bg-[var(--bg-base)] hover:border-blue-300 hover:bg-[var(--bg-subtle)]')
                    }>
                    <span className={
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ' +
                      (fullySelected
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : partiallySelected
                          ? 'border-blue-400 bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                          : 'border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-muted)]')
                    }>
                      {fullySelected ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> :
                        partiallySelected ? <span aria-hidden="true" className="h-0.5 w-2.5 rounded bg-current" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-[var(--text-primary)]">{group.label}</span>
                      <span className="mt-1 block text-[11px] leading-relaxed text-[var(--text-muted)]">{group.description}</span>
                      <span className="mt-1.5 block text-[10px] font-semibold text-[var(--text-secondary)]">
                        {included} of {group.selectableKeys.length} features
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h4 className="text-xs font-semibold text-[var(--text-primary)]">Individual features</h4>
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">Fine-tune access to specific modules.</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" disabled={disabled || selectedCount === features.length}
                  onClick={selectAll}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-[var(--accent)] hover:bg-[var(--bg-subtle)] disabled:cursor-not-allowed disabled:opacity-40">
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> Select all
                </button>
                <button type="button" disabled={disabled || selectedCount === 0}
                  onClick={clearSelection}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:cursor-not-allowed disabled:opacity-40">
                  <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear
                </button>
              </div>
            </div>

            <div className="relative">
              <label htmlFor={searchId} className="sr-only">Search individual features</label>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
              <input id={searchId} type="search" value={search}
                disabled={disabled}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search features…"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] py-2.5 pl-9 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50" />
            </div>

            <div role="group" aria-label="Individual feature permissions"
              className="grid max-h-[min(22rem,45vh)] min-w-0 grid-cols-1 content-start gap-2 overflow-y-auto overscroll-contain pr-1">
              {visibleFeatures.map(feature => {
                const checked = selected.has(feature.key);
                return (
                  <label key={feature.key}
                    className={
                      'flex min-w-0 cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-3 transition-colors has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 ' +
                      (checked
                        ? 'border-blue-300 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-500/[0.08]'
                        : 'border-[var(--border)] bg-[var(--bg-base)] hover:border-blue-200 hover:bg-[var(--bg-subtle)]')
                    }>
                    <input type="checkbox" checked={checked} disabled={disabled}
                      onChange={event => changeGrants([feature.key], event.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-[var(--text-primary)]">{feature.label}</span>
                      <span className="mt-1 block text-[11px] leading-relaxed text-[var(--text-muted)]">{feature.description}</span>
                    </span>
                  </label>
                );
              })}
              {visibleFeatures.length === 0 && (
                <div role="status" className="col-span-full rounded-lg border border-dashed border-[var(--border)] px-4 py-6 text-center text-xs text-[var(--text-muted)]">
                  No features match your search.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
