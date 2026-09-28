import React from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size    = 'xs' | 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ElementType;
  iconRight?: React.ElementType;
}

const VARIANT: Record<Variant, string> = {
  primary:   'bg-[var(--brand-blue)] hover:bg-[#126BE5] active:bg-[#0F5FCF] text-white shadow-sm shadow-blue-600/15 border border-transparent',
  secondary: 'bg-white dark:bg-[var(--bg-surface)] hover:bg-slate-50 dark:hover:bg-[var(--bg-subtle)] text-slate-700 dark:text-[var(--text-primary)] border border-slate-200 dark:border-[var(--border)] shadow-sm',
  ghost:     'bg-transparent hover:bg-slate-100 dark:hover:bg-[var(--bg-subtle)] text-slate-600 dark:text-[var(--text-secondary)] border border-transparent',
  danger:    'bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white shadow-sm shadow-rose-600/15 border border-transparent',
  success:   'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white shadow-sm shadow-emerald-600/15 border border-transparent',
};

const SIZE: Record<Size, string> = {
  xs: 'text-[11px] px-2.5 py-1 rounded-[9px] gap-1',
  sm: 'text-xs px-3 py-1.5 rounded-[9px] gap-1.5',
  md: 'text-sm px-4 py-2 rounded-[9px] gap-2',
  lg: 'text-sm px-5 py-2.5 rounded-[9px] gap-2',
};

const ICON_SIZE: Record<Size, string> = {
  xs: 'h-3 w-3', sm: 'h-3.5 w-3.5', md: 'h-4 w-4', lg: 'h-4 w-4',
};

export default function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon: Icon,
  iconRight: IconRight,
  children,
  disabled,
  className = '',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      {...rest}
      disabled={isDisabled}
      className={`inline-flex items-center font-medium transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT[variant]} ${SIZE[size]} ${className}`}
    >
      {loading ? (
        <Loader2 className={`${ICON_SIZE[size]} animate-spin shrink-0`} />
      ) : Icon ? (
        <Icon className={`${ICON_SIZE[size]} shrink-0`} />
      ) : null}
      {children && <span>{children}</span>}
      {!loading && IconRight && <IconRight className={`${ICON_SIZE[size]} shrink-0 ml-auto`} />}
    </button>
  );
}
