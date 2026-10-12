import React from 'react';
import { Sun, Moon, Monitor, LogOut, ChevronDown } from 'lucide-react';
import { useTheme } from '../shared/theme/ThemeContext';

// ── Profile dropdown (YouTube-style) ─────────────────────────────────────────
export interface ProfileMenuProps {
  kcUser: { name?: string; email?: string; role?: string; picture?: string; avatarUrl?: string } | null;
  dbRole: string | null;
  logout: () => void;
  /** Optional upward placement for the account menu in a full-height sidebar. */
  placement?: 'bottom-end' | 'top-start';
  /** Avatar-only button used when a sidebar collapses to its icon rail. */
  compact?: boolean;
  /** Include name and email in the same account-menu trigger in expanded sidebars. */
  showIdentity?: boolean;
}

const THEME_OPTIONS = [
  { mode: 'light'  as const, icon: Sun,     label: 'Light'  },
  { mode: 'dark'   as const, icon: Moon,    label: 'Dark'   },
  { mode: 'system' as const, icon: Monitor, label: 'System' },
];

export default function ProfileMenu({
  kcUser, dbRole, logout, placement = 'bottom-end', compact = false, showIdentity = false,
}: ProfileMenuProps) {
  const { mode, setMode } = useTheme();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const onOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  const displayName = kcUser?.name || kcUser?.email || '?';
  const initials = displayName.split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase();
  const role = dbRole || kcUser?.role || '';
  const avatarUrl = kcUser?.picture || kcUser?.avatarUrl || '';
  const avatarLabel = displayName === '?' ? 'Profile' : displayName;
  const identityName = kcUser?.name && kcUser.name !== kcUser.email
    ? kcUser.name : role || 'Account';
  const identityDetail = kcUser?.email || role || 'Account & appearance';
  const expandedIdentity = showIdentity && !compact;

  return (
    <div ref={ref} className={expandedIdentity ? 'relative min-w-0 flex-1' : 'relative shrink-0'}>
      {/* The avatar, name, and email share ONE keyboard-accessible trigger. */}
      <button
        ref={triggerRef}
        onClick={() => setOpen(value => !value)}
        type="button"
        aria-label="Open account menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={compact
          ? 'group flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-[var(--bg-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'
          : expandedIdentity
            ? 'group flex w-full min-w-0 items-center gap-2 rounded-xl px-1.5 py-1.5 text-left transition-colors hover:bg-[var(--bg-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'
            : 'group flex items-center gap-2 rounded-full pl-1 pr-2.5 py-1 transition-colors hover:bg-[var(--bg-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'}
        title={compact ? 'Account' : undefined}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] text-xs font-bold text-[var(--text-primary)]">
          {avatarUrl ? (
            <img src={avatarUrl} alt={avatarLabel} className="block h-full w-full object-cover" />
          ) : (
            <span aria-hidden="true">{initials || '?'}</span>
          )}
        </span>
        {expandedIdentity && (
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-xs font-semibold text-[var(--text-primary)]" title={identityName}>{identityName}</span>
            <span className="truncate text-[10px] text-[var(--text-muted)]" title={identityDetail}>{identityDetail}</span>
          </span>
        )}
        {!compact && (
          <ChevronDown aria-hidden="true"
            className={`h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          id={menuId}
          role="dialog"
          aria-label="Account menu"
          className={`absolute z-[200] w-72 max-w-[calc(100vw-20px)] overflow-hidden rounded-2xl shadow-2xl ${placement === 'top-start' ? 'bottom-full left-0 mb-2' : 'right-0 top-full mt-2'}`}
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          {/* Identity section */}
          <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-3">
              <span className="h-12 w-12 rounded-full bg-[var(--bg-subtle)] border border-[var(--border)] flex items-center justify-center shrink-0 overflow-hidden text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt={avatarLabel} className="block h-full w-full object-cover" />
                ) : (
                  <span aria-hidden="true">{initials || '?'}</span>
                )}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate leading-snug" style={{ color: 'var(--text-primary)' }}>
                  {kcUser?.name || 'Unknown'}
                </p>
                <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{kcUser?.email || ''}</p>
                {role && (
                  <span className="inline-block mt-1 text-[10px] font-bold tracking-wide uppercase bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full">
                    {role}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Theme section */}
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2 px-1" style={{ color: 'var(--text-muted)' }}>Appearance</p>
            <div className="flex gap-1">
              {THEME_OPTIONS.map(({ mode: m, icon: Icon, label }) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl text-[11px] font-medium transition-colors cursor-pointer"
                  style={mode === m
                    ? { background: '#2563eb', color: '#fff' }
                    : { background: 'transparent', color: 'var(--text-secondary)' }
                  }
                  onMouseEnter={e => { if (mode !== m) (e.currentTarget as HTMLElement).style.background = 'var(--bg-subtle)'; }}
                  onMouseLeave={e => { if (mode !== m) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Sign out */}
          <div className="px-3 py-2">
            <button
              type="button"
              onClick={() => { setOpen(false); logout(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-rose-500 transition-colors cursor-pointer"
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

