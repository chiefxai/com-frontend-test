import React, { useId } from 'react';

type ColSpan = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export interface ResponsiveSpan { xs?: ColSpan; sm?: ColSpan; md?: ColSpan; lg?: ColSpan; xl?: ColSpan; }

const COL: Record<ColSpan, string> = {
  1: 'col-span-1', 2: 'col-span-2', 3: 'col-span-3', 4: 'col-span-4',
  5: 'col-span-5', 6: 'col-span-6', 7: 'col-span-7', 8: 'col-span-8',
  9: 'col-span-9', 10: 'col-span-10', 11: 'col-span-11', 12: 'col-span-12',
};

// Responsive col-span: fallback to col-span-12 on smaller screens
const COL_RESPONSIVE: Record<ColSpan, string> = {
  1: 'col-span-12 lg:col-span-1',
  2: 'col-span-12 lg:col-span-2',
  3: 'col-span-6 lg:col-span-3',
  4: 'col-span-6 lg:col-span-4',
  5: 'col-span-12 lg:col-span-5',
  6: 'col-span-12 md:col-span-6',
  7: 'col-span-12 lg:col-span-7',
  8: 'col-span-12 lg:col-span-8',
  9: 'col-span-12 lg:col-span-9',
  10: 'col-span-12 lg:col-span-10',
  11: 'col-span-12 lg:col-span-11',
  12: 'col-span-12',
};

interface WidgetProps {
  /** Grid column span (1-12) */
  colSpan?: ColSpan;
  /** Responsive 12-column layout. xs is the base span; larger breakpoints override it. */
  span?: ResponsiveSpan;
  /** Whether to apply the legacy responsive col-span behavior (default true). */
  responsive?: boolean;
  /** Widget header title */
  title?: string;
  /** Widget header subtitle */
  subtitle?: string;
  /** Icon shown in the header accent bubble */
  icon?: React.ElementType;
  /** Accent color for the icon bubble */
  accent?: string;
  /** Extra element rendered in the top-right of the header (e.g. a badge or button) */
  action?: React.ReactNode;
  /** Set false to hide the header entirely */
  showHeader?: boolean;
  children: React.ReactNode;
  /** Extra classes on the outer card */
  className?: string;
  /** Extra classes on the body wrapper */
  bodyClassName?: string;
  /** Body padding preset */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Hover shadow effect */
  hover?: boolean;
  /**
   * Makes the body scrollable so table/list content scrolls independently
   * while the Widget header stays pinned. The body height is capped at
   * `maxBodyHeight` (default "60vh") so it never overflows the viewport.
   */
  scrollable?: boolean;
  /** Override the scrollable body's max-height (CSS value, e.g. "40vh") */
  maxBodyHeight?: string;
  /**
   * Overflow behavior for the non-scrollable body (ignored when
   * `scrollable` is true). Defaults to 'auto' (horizontal scroll for wide
   * content, e.g. tables). Chart widgets (ResponsiveContainer + Recharts
   * Tooltip) should pass 'hidden' — Recharts' hover tooltip is an
   * absolutely-positioned div whose transform can transiently land a few
   * px outside this box, which with 'auto' shows up as a scrollbar
   * flashing on every hover (horizontal, vertical, or both) even though
   * nothing is actually meant to scroll.
   */
  bodyOverflow?: 'auto' | 'hidden' | 'visible';
  /**
   * When true (default when scrollable=true), Widget forcibly pins every
   * <thead> inside its body to the top of the scroll container so developers
   * don't have to add sticky classes to individual tables.
   * Set false to let the table header scroll with the content.
   */
  stickyHeader?: boolean;
}

const PADDING = { none: '', sm: 'p-4', md: 'p-5', lg: 'p-6' };
const BODY_OVERFLOW = { auto: 'overflow-x-auto', hidden: 'overflow-hidden', visible: 'overflow-visible' };

export default function Widget({
  colSpan = 12,
  span,
  responsive = true,
  title,
  subtitle,
  icon: Icon,
  accent = '#2563eb',
  action,
  showHeader = true,
  children,
  className = '',
  bodyClassName = '',
  padding = 'md',
  hover = false,
  scrollable = false,
  maxBodyHeight = '60vh',
  bodyOverflow = 'auto',
  stickyHeader,
}: WidgetProps) {
  // stickyHeader defaults to true whenever the widget is scrollable
  const resolvedStickyHeader = stickyHeader ?? scrollable;
  const spanClass = span
    ? [
        span.xs && COL[span.xs],
        span.sm && `sm:${COL[span.sm]}`,
        span.md && `md:${COL[span.md]}`,
        span.lg && `lg:${COL[span.lg]}`,
        span.xl && `xl:${COL[span.xl]}`,
      ].filter(Boolean).join(' ')
    : responsive ? COL_RESPONSIVE[colSpan] : COL[colSpan];
  const uid = useId().replace(/:/g, '');

  return (
    <div
      data-grid-span={span?.xs ?? colSpan}
      data-grid-span-sm={span?.sm ?? span?.xs ?? colSpan}
      data-grid-span-md={span?.md ?? span?.sm ?? span?.xs ?? colSpan}
      data-grid-span-lg={span?.lg ?? span?.md ?? span?.sm ?? span?.xs ?? colSpan}
      data-grid-span-xl={span?.xl ?? span?.lg ?? span?.md ?? span?.sm ?? span?.xs ?? colSpan}
      className={`${spanClass} bg-white dark:bg-[var(--bg-surface)] rounded-none sm:rounded-[14px] border border-slate-200 dark:border-[var(--border)] shadow-[var(--shadow-card)] flex flex-col overflow-hidden ${hover ? 'hover:shadow-md transition-shadow duration-150' : ''} ${className}`}
    >
      {/* ── Header ───────────────────────────────────────────────── */}
      {showHeader && (
        <>
          <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4">
            <div className="flex items-center gap-3 min-w-0">
              {Icon && (
                <div
                  className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `${accent}18` }}
                >
                  <Icon className="h-4.5 w-4.5" style={{ color: accent }} />
                </div>
              )}
              <div className="min-w-0">
                {title && (
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-[var(--text-primary)] leading-tight">
                    {title}
                  </h4>
                )}
                {subtitle && (
                  <p className="text-xs text-slate-400 dark:text-[var(--text-muted)] mt-0.5 leading-snug">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </div>
          {/* divider */}
          <div className="h-px bg-slate-100 dark:bg-[var(--border)] mx-0" />
        </>
      )}

      {/* ── Body ─────────────────────────────────────────────────── */}
      {scrollable ? (
        // Single overflow:auto container — sticky thead works when both axes
        // are on the SAME scroll ancestor (modern browsers honour this).
        <div
          data-widget-scroll={uid}
          className={`overflow-auto flex-1 ${PADDING[padding]} ${bodyClassName}`}
          style={{ maxHeight: maxBodyHeight }}
        >
          {/* Scoped style: pin every thead inside this scroll container when stickyHeader is on */}
          {resolvedStickyHeader && (
            <style>{`
              [data-widget-scroll="${uid}"] thead {
                position: sticky;
                top: 0;
                z-index: 10;
              }
              [data-widget-scroll="${uid}"] thead th {
                background: var(--bg-surface);
              }
            `}</style>
          )}
          {children}
        </div>
      ) : (
        <div className={`flex-1 ${BODY_OVERFLOW[bodyOverflow]} ${PADDING[padding]} ${bodyClassName}`}>
          {children}
        </div>
      )}
    </div>
  );
}
