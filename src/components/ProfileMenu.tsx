import React from 'react';
import { Sun, Moon, Monitor, LogOut, ChevronDown } from 'lucide-react';
import { useTheme } from '../shared/theme/ThemeContext';
import chiefVoiceLogo from '../assets/chiefvoice-logo.svg';

// ── Profile dropdown (YouTube-style) ─────────────────────────────────────────
export interface ProfileMenuProps {
  kcUser: { name?: string; email?: string; role?: string } | null;
  dbRole: string | null;
  logout: () => void;
}

const THEME_OPTIONS = [
  { mode: 'light'  as const, icon: Sun,     label: 'Light'  },
  { mode: 'dark'   as const, icon: Moon,    label: 'Dark'   },
  { mode: 'system' as const, icon: Monitor, label: 'System' },
];

export default function ProfileMenu({ kcUser, dbRole, logout }: ProfileMenuProps) {
  const { mode, setMode } = useTheme();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const displayName = kcUser?.name || kcUser?.email || '?';
  const initials = displayName.split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase();
  const role = dbRole || kcUser?.role || '';

  return (
    <div ref={ref} className="relative">
      {/* Avatar trigger */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full transition-colors cursor-pointer group"
        style={{ background: 'transparent' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-subtle)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        title="Account"
      >
        <span className="h-9 w-9 rounded-full bg-[var(--bg-surface)] border border-[var(--border)] flex items-center justify-center shrink-0 p-1">
          <img
            src={chiefVoiceLogo}
            alt="ChiefVoice profile"
            className="block h-full w-full object-contain"
          />
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-72 rounded-2xl shadow-2xl overflow-hidden z-[200]"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          {/* Identity section */}
          <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-3">
              <span className="h-12 w-12 rounded-full bg-[var(--bg-surface)] border border-[var(--border)] flex items-center justify-center shrink-0 p-1">
                <img
                  src={chiefVoiceLogo}
                  alt="ChiefVoice profile"
                  className="block h-full w-full object-contain"
                />
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

