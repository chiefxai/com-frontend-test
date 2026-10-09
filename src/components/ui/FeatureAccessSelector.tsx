import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Info, Layers3, Minus, Search, ShieldCheck, X } from 'lucide-react';
import { FEATURE_REGISTRY } from '../../features/feature-flags/registry';
import { getAllFlagGroups } from '../../features/feature-flags/flagGroups';

interface FeatureAccessSelectorProps {
  availableKeys: string[];
  /** Controlled permission keys; never hold a separate copy of granted access. */
  value: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
}

interface PopoverPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

/**
 * Shared searchable group / individual permission picker. Rendering the menu
 * into document.body avoids clipping by Admin forms, Modals and SlideOvers.
 * Groups are only convenient presets over the same individually controlled keys.
 */
export default function FeatureAccessSelector({
  availableKeys,
  value,
  onChange,
  disabled = false,
  label = 'Feature Access',
  description = 'Choose a feature group or select individual permissions.',
}: FeatureAccessSelectorProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const allowed = useMemo(() => new Set(availableKeys), [availableKeys]);
  const selected = useMemo(() => new Set(value), [value]);
  const features = useMemo(
    () => FEATURE_REGISTRY.filter(feature => allowed.has(feature.key)),
    [allowed],
  );
  const labels = useMemo(
    () => new Map(features.map(feature => [feature.key, feature.label])),
    [features],
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
  const selectedCount = features.filter(feature => selected.has(feature.key)).length;
  const query = search.trim().toLowerCase();
  const matchingGroups = groups.filter(group =>
    !query
    || (group.label + ' ' + group.description).toLowerCase().includes(query)
    || group.selectableKeys.some(key => (labels.get(key) || key).toLowerCase().includes(query)),
  );
  const matchingFeatures = features.filter(feature =>
    !query
    || (feature.label + ' ' + feature.key + ' ' + feature.description).toLowerCase().includes(query),
  );

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const padding = 12;
    const width = Math.min(448, Math.max(320, rect.width), window.innerWidth - padding * 2);
    const below = window.innerHeight - rect.bottom - padding;
    const above = rect.top - padding;
    const upward = below < 340 && above > below;
    const space = upward ? above : below;
    const maxHeight = Math.min(480, Math.max(160, space - 8), window.innerHeight - padding * 2);
    const top = Math.min(
      Math.max(padding, upward ? rect.top - maxHeight - 8 : rect.bottom + 8),
      window.innerHeight - maxHeight - padding,
    );
    const left = Math.max(padding, Math.min(rect.left, window.innerWidth - width - padding));
    setPosition({ top, left, width, maxHeight });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updatePosition) : null;
    if (triggerRef.current) observer?.observe(triggerRef.current);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      observer?.disconnect();
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    // Modal and SlideOver also listen for Escape; close the picker first.
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape, true);
    document.addEventListener('pointerdown', handleOutsidePointer, true);
    return () => {
      document.removeEventListener('keydown', handleEscape, true);
      document.removeEventListener('pointerdown', handleOutsidePointer, true);
    };
  }, [open]);

  useEffect(() => {
    if (open && position) searchRef.current?.focus();
  }, [open, position !== null]);

  const changeGrants = (keys: string[], grant: boolean) => {
    if (disabled) return;
    const next = new Set(value);
    for (const key of keys) {
      if (!allowed.has(key)) continue;
      if (grant) next.add(key);
      else next.delete(key);
    }
    onChange([...next]);
  };

  const closeAndFocus = () => {
    setOpen(false);
    setSearch('');
    setExpandedGroup(null);
    triggerRef.current?.focus();
  };

  return (
    <div className="w-full min-w-0 space-y-2">
      <div className="min-w-0">
        <span id={id + '-label'} className="block text-xs font-semibold text-[var(--text-primary)]">
          {label}
        </span>
        {description && <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">{description}</p>}
      </div>
      <button
        ref={triggerRef}
        id={id + '-trigger'}
        type="button"
        aria-labelledby={id + '-label ' + id + '-summary'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id + '-popover' : undefined}
        disabled={disabled || features.length === 0}
        onClick={() => {
          if (!open) {
            setSearch('');
            setExpandedGroup(null);
            setPosition(null);
          }
          setOpen(current => !current);
        }}
        className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-left transition-colors hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/25 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
          <span id={id + '-summary'} className="truncate text-xs font-medium text-[var(--text-secondary)]">
            {features.length === 0
              ? 'No features available'
              : selectedCount === 0
                ? 'Select feature groups or individual features'
                : selectedCount + ' of ' + features.length + ' permissions selected'}
          </span>
        </span>
        <ChevronDown className={'h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform ' + (open ? 'rotate-180' : '')} aria-hidden="true" />
      </button>

      {open && position && createPortal(
        <div
          id={id + '-popover'}
          ref={popoverRef}
          role="dialog"
          aria-modal="false"
          aria-label={label + ' options'}
          style={{ position: 'fixed', top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight, zIndex: 700 }}
          className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl"
        >
          <div className="shrink-0 border-b border-[var(--border)] p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search groups or features…"
                aria-label="Search feature groups and permissions"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] py-2.5 pl-9 pr-9 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              {search && (
                <button type="button" onClick={() => { setSearch(''); searchRef.current?.focus(); }}
                  aria-label="Clear permission search" className="absolute right-2 top-1.5 rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]">
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            <div className="px-2 pb-2 pt-1">
              <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                <Layers3 className="h-3.5 w-3.5" aria-hidden="true" /> Feature groups
              </h3>
            </div>
            {matchingGroups.length === 0 ? (
              <p className="px-3 pb-3 text-xs text-[var(--text-muted)]">No matching feature groups.</p>
            ) : matchingGroups.map(group => {
              const count = group.selectableKeys.filter(key => selected.has(key)).length;
              const full = count === group.selectableKeys.length;
              const partial = count > 0 && !full;
              const infoOpen = expandedGroup === group.key;
              return (
                <div key={group.key} className="mb-1 overflow-hidden rounded-lg">
                  <div className="flex items-center gap-1 hover:bg-[var(--bg-subtle)]">
                    <button type="button" disabled={disabled}
                      onClick={() => changeGrants(group.selectableKeys, !full)}
                      aria-label={(full ? 'Remove ' : 'Select ') + group.label + ' group'}
                      aria-pressed={full}
                      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/25 disabled:opacity-60">
                      <span className={'flex h-4 w-4 shrink-0 items-center justify-center rounded border ' + (full || partial ? 'border-blue-600 bg-blue-600 text-white' : 'border-[var(--border)] bg-[var(--bg-surface)]')}>
                        {full ? <Check className="h-3 w-3" aria-hidden="true" /> : partial ? <Minus className="h-3 w-3" aria-hidden="true" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-[var(--text-primary)]">{group.label}</span>
                        <span className="block text-[11px] text-[var(--text-muted)]">{count} / {group.selectableKeys.length} permissions</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedGroup(current => current === group.key ? null : group.key)}
                      aria-label={'View permissions in ' + group.label}
                      aria-expanded={infoOpen}
                      aria-controls={id + '-group-' + group.key}
                      title={'See permissions in ' + group.label}
                      className="mr-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/25"
                    >
                      <Info className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  {infoOpen && (
                    <div id={id + '-group-' + group.key} className="mx-2 mb-2 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-3">
                      <p className="mb-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">{group.description}</p>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Included permissions</p>
                      <ul className="space-y-1.5">
                        {group.selectableKeys.map(key => (
                          <li key={key} className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                            <span className={'h-1.5 w-1.5 shrink-0 rounded-full ' + (selected.has(key) ? 'bg-emerald-500' : 'bg-[var(--text-muted)]')} />
                            {labels.get(key) || key}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}

            <div className="mx-2 mb-2 mt-3 border-t border-[var(--border)] pt-3">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Individual features</h3>
            </div>
            {matchingFeatures.length === 0 ? (
              <p className="px-3 py-3 text-xs text-[var(--text-muted)]">No matching individual features.</p>
            ) : matchingFeatures.map(feature => {
              const checked = selected.has(feature.key);
              return (
                <button key={feature.key} type="button" disabled={disabled}
                  aria-label={(checked ? 'Remove ' : 'Select ') + feature.label + ' feature'}
                  aria-pressed={checked}
                  onClick={() => changeGrants([feature.key], !checked)}
                  className="mb-1 flex w-full min-w-0 items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/25 disabled:opacity-60">
                  <span className={'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ' + (checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-[var(--border)] bg-[var(--bg-surface)]')}>
                    {checked && <Check className="h-3 w-3" aria-hidden="true" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-[var(--text-primary)]">{feature.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--text-muted)]">{feature.description}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5">
            <span role="status" className="text-[11px] text-[var(--text-secondary)]">{selectedCount} of {features.length} selected</span>
            <button type="button" onClick={closeAndFocus}
              className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/25">
              Done
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
