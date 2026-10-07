import React from 'react';

export interface ProgressBarProps {
  value: number | null;
  label?: string;
  className?: string;
  barClassName?: string;
}

/** Shared accessible progress indicator for long-running UI work. */
export default function ProgressBar({ value, label, className = '', barClassName = '' }: ProgressBarProps) {
  const indeterminate = value === null;
  const progress = indeterminate ? 0 : Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

  return (
    <div className={`w-full ${className}`}>
      {(label || indeterminate || progress < 100) && (
        <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-[var(--text-secondary)]">
          {label && <span>{label}</span>}
          <span className="ml-auto tabular-nums" aria-hidden="true">{indeterminate ? 'Working…' : `${Math.round(progress)}%`}</span>
        </div>
      )}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]"
        role="progressbar"
        aria-label={label ?? 'Progress'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : Math.round(progress)}
        aria-valuetext={indeterminate ? 'In progress' : `${Math.round(progress)}%`}
      >
        <div
          className={`h-full rounded-full bg-indigo-500 transition-[width] duration-300 ease-out ${indeterminate ? 'w-2/5 animate-pulse' : ''} ${barClassName}`}
          style={indeterminate ? undefined : { width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
