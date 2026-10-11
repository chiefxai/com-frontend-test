import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface StudioEntityCardProps {
  title: string;
  subtitle?: React.ReactNode;
  icon: LucideIcon;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Mirrors the indigo/purple accent of Agent Studio's entity cards. */
  tone?: 'brand' | 'neutral';
}

/**
 * Shared compact card used by Agent Studio and platform provider listings.
 * Keep editing forms outside the card; its job is glanceable identity,
 * summary content and discoverable actions.
 */
export default function StudioEntityCard({
  title, subtitle, icon: Icon, badge, actions, footer, children,
  className = '', tone = 'brand',
}: StudioEntityCardProps) {
  const accent = tone === 'brand'
    ? 'from-indigo-500 to-purple-500'
    : 'from-slate-400 to-slate-500';
  const iconBackground = tone === 'brand'
    ? 'from-indigo-500 to-purple-600'
    : 'from-slate-500 to-slate-700';

  return (
    <article aria-label={title} className={`group relative flex min-w-0 flex-col overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] transition-all hover:border-[var(--accent)]/35 hover:shadow-md ${className}`}>
      <div aria-hidden="true" className={`h-1 w-full shrink-0 bg-gradient-to-r ${accent}`} />
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-5">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[9px] bg-gradient-to-br ${iconBackground} text-white shadow-sm`}>
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <h3 className="min-w-0 truncate text-sm font-bold leading-tight text-[var(--text-primary)]" title={title}>{title}</h3>
                {badge}
              </div>
              {subtitle && <p className="mt-1 text-[11px] leading-snug text-[var(--text-muted)]">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
        {children}
      </div>
      {footer && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--bg-subtle)]/35 px-4 py-3">
          {footer}
        </div>
      )}
    </article>
  );
}
