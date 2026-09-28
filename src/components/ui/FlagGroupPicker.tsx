import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, Sparkles, Users2, X } from 'lucide-react';
import { getAllFlagGroups } from '../../features/feature-flags/flagGroups';
import { FEATURE_REGISTRY } from '../../features/feature-flags/registry';
import { useClickOutside } from '../../hooks/useClickOutside';

interface FlagGroupPickerProps {
  availableKeys: string[];
  value?: string[];
  onApply: (flagKeys: string[]) => void;
  className?: string;
  label?: string;
  description?: string;
  compact?: boolean;
}

export default function FlagGroupPicker({
  availableKeys,
  value = [],
  onApply,
  className = '',
  label = 'Feature Access',
  description = 'Choose a complete group or individual features independently.',
  compact = false,
}: FlagGroupPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [placement, setPlacement] = useState<'down' | 'up' | 'left' | 'right'>('down');
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(value);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const available = useMemo(() => new Set(availableKeys), [availableKeys]);

  const groups = useMemo(
    () =>
      getAllFlagGroups()
        .map(group => ({ ...group, applicable: group.flagKeys.filter(key => available.has(key)) }))
        .filter(group => group.applicable.length > 0),
    [available],
  );

  const features = useMemo(() => {
    const query = search.trim().toLowerCase();
    return FEATURE_REGISTRY.filter(feature => available.has(feature.key)).filter(
      feature =>
        !query ||
        feature.label.toLowerCase().includes(query) ||
        feature.description.toLowerCase().includes(query),
    );
  }, [available, search]);

  const selectedFlagKeys = useMemo(() => {
    const next = new Set(selectedFeatures);
    selectedGroups.forEach(groupKey => {
      const group = groups.find(item => item.key === groupKey);
      group?.applicable.forEach(key => next.add(key));
    });
    return [...next];
  }, [groups, selectedFeatures, selectedGroups]);

  const closeAll = useCallback(() => {
    setOpen(false);
  }, []);

  useClickOutside(rootRef, closeAll, open);

  const applySelection = (nextGroups: string[], nextFeatures: string[]) => {
    setSelectedGroups(nextGroups);
    setSelectedFeatures(nextFeatures);

    const next = new Set(nextFeatures);
    nextGroups.forEach(groupKey => {
      const group = groups.find(item => item.key === groupKey);
      group?.applicable.forEach(key => next.add(key));
    });
    onApply([...next]);
  };

  const toggleFeature = (key: string) => {
    const next = new Set(selectedFeatures);
    next.has(key) ? next.delete(key) : next.add(key);
    applySelection(selectedGroups, [...next]);
  };

  const toggleGroup = (groupKey: string) => {
    const nextGroups = selectedGroups.includes(groupKey)
      ? selectedGroups.filter(key => key !== groupKey)
      : [...selectedGroups, groupKey];

    applySelection(nextGroups, selectedFeatures);
  };

  const clearAll = () => {
    setSelectedGroups([]);
    setSelectedFeatures([]);
    onApply([]);
  };

  const updatePlacement = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const margin = 12;
    const requiredHeight = Math.min(320, Math.max(220, window.innerHeight * 0.6));
    const requiredSideWidth = Math.min(rect.width, 320);

    const below = window.innerHeight - rect.bottom - margin;
    const above = rect.top - margin;
    const right = window.innerWidth - rect.right - margin;
    const left = rect.left - margin;

    if (below >= requiredHeight) setPlacement('down');
    else if (above >= requiredHeight) setPlacement('up');
    else if (right >= requiredSideWidth) setPlacement('right');
    else if (left >= requiredSideWidth) setPlacement('left');
    else setPlacement(below >= above ? 'down' : 'up');
  }, []);

  React.useEffect(() => {
    if (!open) return;
    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    return () => {
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
  }, [open, updatePlacement]);

  return (
    <div ref={rootRef} className={`relative w-full min-w-0 ${className}`}>
      {!compact && (
        <>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-700">{label}</p>
              <p className="text-[10px] text-slate-400">{description}</p>
            </div>
            {(selectedGroups.length > 0 || selectedFeatures.length > 0) && (
              <button type="button" onClick={clearAll} className="text-[10px] font-semibold text-slate-400 hover:text-rose-500">
                Clear all
              </button>
            )}
          </div>
          {(selectedGroups.length > 0 || selectedFeatures.length > 0) && (
            <div className="mb-2 flex max-w-full flex-wrap gap-1.5">
              {selectedGroups.map(groupKey => {
                const group = groups.find(item => item.key === groupKey);
                if (!group) return null;
                return (
                  <button key={`group-${groupKey}`} type="button" onClick={() => toggleGroup(groupKey)} title={group.description}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 px-3 py-1.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-200">
                    <Users2 className="h-3 w-3 shrink-0" /><span className="truncate">{group.label}</span><X className="h-3 w-3 shrink-0" />
                  </button>
                );
              })}
              {selectedFeatures.map(key => {
                const feature = FEATURE_REGISTRY.find(item => item.key === key);
                if (!feature) return null;
                return (
                  <button key={`feature-${key}`} type="button" onClick={() => toggleFeature(key)} title={feature.description}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-700 hover:border-amber-200 hover:bg-amber-50">
                    <span className="truncate">{feature.label}</span><X className="h-3 w-3 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      <div ref={triggerRef} className="relative">
        {compact ? (
          <button
            type="button"
            onClick={() => setOpen(prev => !prev)}
            className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2.5 text-left text-xs font-semibold text-[var(--text-primary)] hover:border-indigo-400"
          >
            <span>{label}</span>
            <span className="flex items-center gap-2 text-[10px] font-medium text-slate-400">
              {selectedFlagKeys.length > 0 ? `${selectedFlagKeys.length} selected` : 'Select permissions'}
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </span>
          </button>
        ) : (
          <>
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={event => { setSearch(event.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              placeholder="Search individual features or choose a group…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-10 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
            />
            <button type="button" onClick={() => setOpen(prev => !prev)}
              className="absolute right-2 top-1.5 p-1.5 text-slate-400 hover:text-slate-700"
              aria-label="Open feature access picker">
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          </>
        )}

        {open && (
          <div
            className={`absolute z-50 w-full min-w-full max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl ${
              placement === 'down'
                ? 'left-0 top-full mt-2'
                : placement === 'up'
                  ? 'bottom-full left-0 mb-2'
                  : placement === 'right'
                    ? 'left-full top-0 ml-2'
                    : 'right-full top-0 mr-2'
            }`}
          >
            <div className="max-h-[min(30rem,60vh)] overflow-y-auto overscroll-contain p-2">
              <div className="px-2 py-2">
                <div className="mb-2 flex items-center gap-1.5">
                  <Users2 className="h-3 w-3 text-amber-500" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Feature Groups
                  </span>
                </div>
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {groups.map(group => {
                    const selected = selectedGroups.includes(group.key);
                    return (
                      <button
                        key={group.key}
                        type="button"
                        onClick={() => toggleGroup(group.key)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-semibold transition-colors ${
                          selected
                            ? 'border-amber-300 bg-amber-100 text-amber-800'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-amber-200 hover:bg-amber-50'
                        }`}
                      >
                        <Users2 className="h-3 w-3" />
                        {group.label}
                        {selected && <Check className="h-3 w-3" />}
                      </button>
                    );
                  })}
                </div>

                <div className="mb-1.5 flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-amber-500" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Individual Features
                  </span>
                </div>

                {features.length === 0 ? (
                  <p className="px-2 py-4 text-center text-xs text-slate-400">No matching features</p>
                ) : (
                  <div className="space-y-1">
                    {features.map(feature => {
                      const selected = selectedFeatures.includes(feature.key);
                      return (
                        <button
                          key={feature.key}
                          type="button"
                          onClick={() => toggleFeature(feature.key)}
                          className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left hover:bg-slate-50"
                        >
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                              selected ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-300'
                            }`}
                          >
                            {selected && <Check className="h-3 w-3" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-medium text-slate-700">{feature.label}</span>
                            <span className="block truncate text-[9px] text-slate-400">{feature.description}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-3 py-2">
              <span className="text-[10px] text-slate-500">
                {selectedGroups.length} group{selectedGroups.length === 1 ? '' : 's'} · {selectedFeatures.length} individual feature{selectedFeatures.length === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-semibold text-white"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedFlagKeys.length > 0 && (
        <p className="mt-2 text-[10px] text-slate-400">
          {selectedFlagKeys.length} total permission{selectedFlagKeys.length === 1 ? '' : 's'} will be applied.
        </p>
      )}
    </div>
  );
}
