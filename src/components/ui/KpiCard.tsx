import React from 'react';
import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  badge?: React.ReactNode;
  badgeColor?: 'blue' | 'green' | 'amber' | 'purple' | 'rose' | 'neutral';
  secondaryLabel?: string;
  secondaryValue?: React.ReactNode;
  secondaryBadge?: React.ReactNode;
  secondaryBadgeColor?: 'blue' | 'green' | 'amber' | 'purple' | 'rose' | 'neutral';
  icon?: LucideIcon;
  iconBg?: string;
  iconColor?: string;
  iconPosition?: 'left' | 'right' | 'top-left';
  colSpan?: number;
  /** Responsive 12-column export metadata, matching Widget's grid contract. */
  span?: { xs?: number; sm?: number; md?: number; lg?: number; xl?: number };
  className?: string;
  onClick?: () => void;
}

const COL_SPAN: Record<number, string> = {
  1: 'col-span-1', 2: 'col-span-2', 3: 'col-span-3', 4: 'col-span-4',
  5: 'col-span-5', 6: 'col-span-6', 7: 'col-span-7', 8: 'col-span-8',
  9: 'col-span-9', 10: 'col-span-10', 11: 'col-span-11', 12: 'col-span-12',
};

const RESPONSIVE_COL_SPAN: Record<'sm' | 'md' | 'lg' | 'xl', Record<number, string>> = {
  sm: { 1: 'sm:col-span-1', 2: 'sm:col-span-2', 3: 'sm:col-span-3', 4: 'sm:col-span-4', 5: 'sm:col-span-5', 6: 'sm:col-span-6', 7: 'sm:col-span-7', 8: 'sm:col-span-8', 9: 'sm:col-span-9', 10: 'sm:col-span-10', 11: 'sm:col-span-11', 12: 'sm:col-span-12' },
  md: { 1: 'md:col-span-1', 2: 'md:col-span-2', 3: 'md:col-span-3', 4: 'md:col-span-4', 5: 'md:col-span-5', 6: 'md:col-span-6', 7: 'md:col-span-7', 8: 'md:col-span-8', 9: 'md:col-span-9', 10: 'md:col-span-10', 11: 'md:col-span-11', 12: 'md:col-span-12' },
  lg: { 1: 'lg:col-span-1', 2: 'lg:col-span-2', 3: 'lg:col-span-3', 4: 'lg:col-span-4', 5: 'lg:col-span-5', 6: 'lg:col-span-6', 7: 'lg:col-span-7', 8: 'lg:col-span-8', 9: 'lg:col-span-9', 10: 'lg:col-span-10', 11: 'lg:col-span-11', 12: 'lg:col-span-12' },
  xl: { 1: 'xl:col-span-1', 2: 'xl:col-span-2', 3: 'xl:col-span-3', 4: 'xl:col-span-4', 5: 'xl:col-span-5', 6: 'xl:col-span-6', 7: 'xl:col-span-7', 8: 'xl:col-span-8', 9: 'xl:col-span-9', 10: 'xl:col-span-10', 11: 'xl:col-span-11', 12: 'xl:col-span-12' },
};

const CHIP_STYLE: Record<NonNullable<KpiCardProps['badgeColor']>, React.CSSProperties> = {
  blue: { background: '#dbeafe', color: '#1d4ed8' },
  green: { background: '#d1fae5', color: '#065f46' },
  amber: { background: '#fef3c7', color: '#92400e' },
  purple: { background: '#ede9fe', color: '#6d28d9' },
  rose: { background: '#ffe4e6', color: '#be123c' },
  neutral: { background: 'var(--bg-subtle)', color: 'var(--text-secondary)' },
};

function Chip({
  badge,
  color = 'neutral',
}: {
  badge: React.ReactNode;
  color?: KpiCardProps['badgeColor'];
}) {
  if (!badge) return null;
  if (typeof badge !== 'string') return <>{badge}</>;

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap"
      style={CHIP_STYLE[color ?? 'neutral']}
    >
      {badge}
    </span>
  );
}

export default function KpiCard({
  label,
  value,
  sub,
  badge,
  badgeColor = 'neutral',
  secondaryLabel,
  secondaryValue,
  secondaryBadge,
  secondaryBadgeColor = 'neutral',
  icon: Icon,
  iconBg = 'var(--bg-subtle)',
  iconColor = 'var(--text-secondary)',
  iconPosition = 'right',
  colSpan = 3,
  span,
  className = '',
  onClick,
}: KpiCardProps) {
  const colClass = span
    ? [
        span.xs && COL_SPAN[span.xs],
        span.sm && RESPONSIVE_COL_SPAN.sm[span.sm],
        span.md && RESPONSIVE_COL_SPAN.md[span.md],
        span.lg && RESPONSIVE_COL_SPAN.lg[span.lg],
        span.xl && RESPONSIVE_COL_SPAN.xl[span.xl],
      ].filter(Boolean).join(' ')
    : colSpan === 3
      ? 'col-span-12 sm:col-span-6 lg:col-span-3'
      : (COL_SPAN[colSpan] ?? 'col-span-12');

  const iconBubble = Icon ? (
    <div
      className="h-10 w-10 rounded-[9px] flex items-center justify-center shrink-0"
      style={{ background: iconBg }}
    >
      <Icon className="h-5 w-5" style={{ color: iconColor }} />
    </div>
  ) : null;

  const chip = badge ? <Chip badge={badge} color={badgeColor} /> : null;

  const hasSecondary =
    Boolean(secondaryLabel) && secondaryValue !== undefined;

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-surface)',
    borderColor: 'var(--border)',
  };

  const secondary = hasSecondary ? (
    <div className="min-w-0 shrink-0 border-l pl-3 ml-1" style={{ borderColor: 'var(--border)' }}>
      <span
        className="text-[9px] font-bold uppercase tracking-wider block truncate"
        style={{ color: 'var(--text-muted)' }}
      >
        {secondaryLabel}
      </span>
      <span
        className="text-xs font-semibold whitespace-nowrap block mt-0.5"
        style={{ color: 'var(--text-primary)' }}
      >
        {secondaryValue}
      </span>
      {secondaryBadge ? <div className="mt-0.5"><Chip badge={secondaryBadge} color={secondaryBadgeColor} /></div> : null}
    </div>
  ) : null;

  const content = (
    <>
      {iconPosition === 'left' ? iconBubble : null}

      <div className="min-w-0 flex-1">
        {iconPosition === 'top-left' ? (
          <div className="flex items-start justify-between gap-2">
            {iconBubble ?? <span />}
            {chip}
          </div>
        ) : null}

        <div className={iconPosition === 'top-left' ? 'mt-3' : ''}>
          <div className={hasSecondary && iconPosition !== 'top-left' ? 'flex items-center min-w-0 gap-3' : ''}>
            <div className="min-w-0">
          <span
            className="text-[10px] font-bold uppercase tracking-wider block"
            style={{ color: 'var(--text-muted)' }}
          >
            {label}
          </span>

          <span
            className={
              iconPosition === 'top-left'
                ? 'text-2xl font-bold tracking-tight mt-1 block'
                : 'text-sm font-semibold block truncate'
            }
            style={{ color: 'var(--text-primary)' }}
          >
            {value}
          </span>

          {sub ? (
            <span
              className="text-xs block"
              style={{ color: 'var(--text-muted)' }}
            >
              {sub}
            </span>
          ) : null}

          {iconPosition !== 'top-left' && chip ? (
            <div className="pt-1">{chip}</div>
          ) : null}

          </div>
            {secondary}
          </div>
        </div>
      </div>

      {iconPosition === 'right' ? iconBubble : null}
    </>
  );

  const layoutClass =
    iconPosition === 'top-left'
      ? 'flex flex-col justify-between min-h-[120px]'
      : iconPosition === 'left'
        ? 'flex items-center gap-4'
        : 'flex items-center justify-between gap-3';

  const resolvedSpan = {
    xs: span?.xs ?? (colSpan === 3 ? 12 : colSpan),
    sm: span?.sm ?? (colSpan === 3 ? 6 : colSpan),
    md: span?.md ?? span?.sm ?? span?.xs ?? (colSpan === 3 ? 6 : colSpan),
    lg: span?.lg ?? span?.md ?? span?.sm ?? span?.xs ?? colSpan,
    xl: span?.xl ?? span?.lg ?? span?.md ?? span?.sm ?? span?.xs ?? colSpan,
  };

  return (
    <div
      data-grid-span={resolvedSpan.xs}
      data-grid-span-sm={resolvedSpan.sm}
      data-grid-span-md={resolvedSpan.md}
      data-grid-span-lg={resolvedSpan.lg}
      data-grid-span-xl={resolvedSpan.xl}
      className={`${colClass} rounded-[14px] border p-5 shadow-[var(--shadow-card)] ${layoutClass} ${onClick ? 'cursor-pointer hover:shadow-[var(--shadow-card)] transition-shadow duration-150' : ''} ${className}`}
      style={cardStyle}
      onClick={onClick}
    >
      {content}
    </div>
  );
}
