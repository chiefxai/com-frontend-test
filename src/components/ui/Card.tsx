import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  /** Render as a panel (dark surface that adapts to theme) */
  panel?: boolean;
}

const PADDING = { none: '', sm: 'p-4', md: 'p-6', lg: 'p-8' };

export function Card({ children, className = '', padding = 'md', hover = false, panel = false }: CardProps) {
  if (panel) {
    return (
      <div
        className={`theme-panel rounded-[14px] border shadow-[var(--shadow-card)] ${PADDING[padding]} ${className}`}
      >
        {children}
      </div>
    );
  }
  return (
    <div
      className={`bg-[var(--bg-surface)] rounded-[14px] border border-[var(--border)] shadow-[var(--shadow-card)] ${hover ? 'hover:shadow-md transition-shadow duration-150' : ''} ${PADDING[padding]} ${className}`}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ElementType;
  accent?: string;
  border?: boolean;
}

export function CardHeader({ title, subtitle, action, icon: Icon, accent = '#2563eb', border = true }: CardHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-4 ${border ? 'pb-4 mb-4 border-b border-[var(--border)]' : ''}`}>
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className="h-9 w-9 rounded-[9px] flex items-center justify-center shrink-0" style={{ background: `${accent}18` }}>
            <Icon className="h-4.5 w-4.5" style={{ color: accent }} />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">{title}</h3>
          {subtitle && <p className="text-xs text-[var(--text-muted)] mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
