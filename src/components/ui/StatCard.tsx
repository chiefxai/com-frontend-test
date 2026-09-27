import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  /** Change vs prior period, e.g. "+12.4%" */
  change?: string;
  /** Determines arrow color/direction */
  trend?: 'up' | 'down' | 'flat';
  icon?: React.ElementType;
  accent?: string;
  loading?: boolean;
  className?: string;
}

export default function StatCard({ label, value, change, trend, icon: Icon, accent = '#2563eb', loading = false, className = '' }: StatCardProps) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-emerald-500' : trend === 'down' ? 'text-rose-500' : 'text-slate-400';

  return (
    <div className={`bg-white dark:bg-[var(--bg-surface)] rounded-[14px] border border-slate-200 dark:border-[var(--border)] shadow-[var(--shadow-card)] p-5 flex flex-col gap-3 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-400 dark:text-[var(--text-muted)] uppercase tracking-widest">{label}</span>
        {Icon && (
          <div className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${accent}18` }}>
            <Icon className="h-4 w-4" style={{ color: accent }} />
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          <div className="h-7 w-24 rounded-lg bg-slate-100 dark:bg-[var(--bg-subtle)] animate-pulse" />
          <div className="h-3 w-16 rounded bg-slate-100 dark:bg-[var(--bg-subtle)] animate-pulse" />
        </div>
      ) : (
        <>
          <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-[var(--text-primary)]">{value}</div>
          {change && (
            <div className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
              <TrendIcon className="h-3.5 w-3.5" />
              {change}
            </div>
          )}
        </>
      )}
    </div>
  );
}
