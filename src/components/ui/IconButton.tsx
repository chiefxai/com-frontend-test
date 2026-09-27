import React from 'react';
import { LucideIcon } from 'lucide-react';
import Tooltip from './Tooltip';

// Icon-only action button with a hover tooltip showing its name — the one
// shared component every page-header icon action (New Workflow, Add
// Document, New Agent, Copy JSON, Save, etc.) should go through instead of
// each page rolling its own bespoke button, so they all look and behave
// identically. Reuses Tooltip (see ui/Tooltip.tsx) rather than each header
// rolling its own hover label.
interface IconButtonProps {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  side?: 'top' | 'bottom' | 'left' | 'right';
  disabled?: boolean;
  /** Extra classes on the <button> itself — e.g. to tint a "Saved!" state green. */
  className?: string;
  /** Extra classes on the icon — e.g. "animate-spin" for a loading state. */
  iconClassName?: string;
}

export default function IconButton({
  icon: Icon, label, onClick, variant = 'primary', side = 'bottom', disabled = false, className = '', iconClassName = '',
}: IconButtonProps) {
  // No fill/border on either variant — a page header with several of these
  // (view toggles, Copy, Save, +) previously ended up as a row of solid
  // colored boxes competing for attention; now every one reads the same
  // as the header's own refresh icon (transparent, colored icon, a subtle
  // hover background), and 'primary' vs 'secondary' is just icon tint.
  const variantCls = variant === 'primary'
    ? 'text-[var(--accent)] hover:bg-[var(--bg-subtle)]'
    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]';

  return (
    <Tooltip label={label} side={side}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={`flex items-center justify-center h-9 w-9 rounded-[9px] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${variantCls} ${className}`}
      >
        <Icon className={`h-4 w-4 ${iconClassName}`} />
      </button>
    </Tooltip>
  );
}
