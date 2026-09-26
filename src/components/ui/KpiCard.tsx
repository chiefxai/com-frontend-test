import React from 'react';
import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  badge?: React.ReactNode;
  badgeColor?: 'blue' | 'green' | 'amber' | 'purple' | 'rose' | 'neutral';
  icon?: LucideIcon;
  iconBg?: string;
  iconColor?: string;
  /**
   * "right" (default) — label + value left, icon right (Company Info style).
   * "left"  — icon left, label + value right.
   * "top-left" — icon + chip top row, big value below.
   */
  iconPosition?: 'left' | 'right' | 'top-left';
  colSpan?: number;
  className?: string;
  onClick?: () => void;
}

const COL_SPAN: Record<number, string> = {
  1:'col-span-1',2:'col-span-2',3:'col-span-3',4:'col-span-4',
  5:'col-span-5',6:'col-span-6',7:'col-span-7',8:'col-span-8',
  9:'col-span-9',10:'col-span-10',11:'col-span-11',12:'col-span-12',
};

const CHIP_STYLE: Record<NonNullable<KpiCardProps['badgeColor']>, React.CSSProperties> = {
  blue:    { background: '#dbeafe', color: '#1d4ed8' },
  green:   { background: '#d1fae5', color: '#065f46' },
  amber:   { background: '#fef3c7', color: '#92400e' },
  purple:  { background: '#ede9fe', color: '#6d28d9' },
  rose:    { background: '#ffe4e6', color: '#be123c' },
  neutral: { background: 'var(--bg-subtle)', color: 'var(--text-secondary)' },
};

function Chip({ badge, color = 'neutral' }: { badge: React.ReactNode; color?: KpiCardProps['badgeColor'] }) {
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
  icon: Icon,
  iconBg = 'var(--bg-subtle)',
  iconColor = 'var(--text-secondary)',
  iconPosition = 'right',
  colSpan = 3,
  className = '',
  onClick,
}: KpiCardProps) {
  const colClass = colSpan === 3
    ? 'col-span-12 sm:col-span-6 lg:col-span-3'
    : (COL_SPAN[colSpan] ?? 'col-span-12');

  const iconBubble = Icon ? (
    <div
      className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
      style={{ background: iconBg }}
    >
      <Icon className="h-5 w-5" style={{ color: iconColor }} />
    </div>
  ) : null;

  const chip = badge ? <Chip badge={badge} color={badgeColor} /> : null;

  const cardStyle: React.CSSProperties = { background: 'var(--bg-surface)', borderColor: 'var(--border)' };

  // ── "right" — exact Company Info style: text left, icon right ──
  if (iconPosition === 'right') {
    return (
      <div
        className={`${colClass} rounded-2xl border p-5 flex items-center justify-between gap-3 shadow-sm ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow duration-150' : ''} ${className}`}
        style={cardStyle}
        onClick={onClick}
      >
        <div className="space-y-1 min-w-0 flex-1">
          <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: 'var(--text-muted)' }}>
            {label}
          </span>
          <span className="text-sm font-semibold block truncate" style={{ color: 'var(--text-primary)' }}>
            {value}
          </span>
          {sub && <span className="text-xs block" style={{ color: 'var(--text-muted)' }}>{sub}</span>}
          {chip && <div className="pt-1">{chip}</div>}
        </div>
        {iconBubble}
      </div>
    );
  }

  // ── "left" — icon left, text right ──
  if (iconPosition === 'left') {
    return (
      <div
        className={`${colClass} rounded-2xl border p-5 flex items-center gap-4 shadow-sm ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow duration-150' : ''} ${className}`}
        style={cardStyle}
        onClick={onClick}
      >
        {iconBubble}
        <div className="space-y-1 min-w-0 flex-1">
          <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: 'var(--text-muted)' }}>
            {label}
          </span>
          <span className="text-sm font-semibold block truncate" style={{ color: 'var(--text-primary)' }}>
            {value}
          </span>
          {sub && <span className="text-xs block" style={{ color: 'var(--text-muted)' }}>{sub}</span>}
          {chip && <div className="pt-1">{chip}</div>}
        </div>
      </div>
    );
  }

  // ── "top-left" — icon + chip top, value bottom ──
  return (
    <div
      className={`${colClass} rounded-2xl border p-5 flex flex-col justify-between min-h-[120px] shadow-sm ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow duration-150' : ''} ${className}`}
      style={cardStyle}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        {iconBubble ?? <span />}
        {chip}
      </div>
      <div className="mt-3">
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className="text-2xl font-bold tracking-tight mt-1" style={{ color: 'var(--text-primary)' }}>{value}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
      </div>
    </div>
  );
}
