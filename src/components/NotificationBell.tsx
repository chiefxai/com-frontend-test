import React from 'react';
import { Bell, CheckCheck, CreditCard, Loader2, MailCheck, Settings2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { notificationClient, platformStreamUrl, type NotificationAudience, type ProductNotification } from '../notifications/api';

interface Props { audience: NotificationAudience; placement?: 'sidebar' | 'header'; }
const REFRESH_EVENT = 'chiefx-notification-change';

function timeAgo(value: string) {
  const elapsed = Date.now() - Date.parse(value);
  if (!Number.isFinite(elapsed) || elapsed < 0) return 'Recently';
  if (elapsed < 60_000) return 'Just now';
  if (elapsed < 3_600_000) return Math.floor(elapsed / 60_000) + 'm ago';
  if (elapsed < 86_400_000) return Math.floor(elapsed / 3_600_000) + 'h ago';
  return new Date(value).toLocaleDateString();
}
function notificationIcon(eventKey: string) {
  if (eventKey.startsWith('payment.') || eventKey.startsWith('billing.')) return <CreditCard className="h-4 w-4 text-emerald-600" />;
  return <Bell className="h-4 w-4 text-blue-500" />;
}

/** Notifications are database-backed business events, not raw SSE transport logs. */
export default function NotificationBell({ audience, placement = 'header' }: Props) {
  const navigate = useNavigate();
  const [rows, setRows] = React.useState<ProductNotification[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [menuPosition, setMenuPosition] = React.useState({left:8,bottom:80});
  const ref = React.useRef<HTMLDivElement>(null);

  const refresh = React.useCallback(async () => {
    try { const result = await notificationClient.list(audience); setRows(Array.isArray(result) ? result : []); setError(false); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, [audience]);

  React.useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    window.addEventListener(REFRESH_EVENT, refresh);
    return () => { window.clearInterval(timer); window.removeEventListener(REFRESH_EVENT, refresh); };
  }, [refresh]);

  // Platform operators do not have an active organization SSE connection.
  // Their stream uses its own short-lived, server-signed ticket.
  React.useEffect(() => {
    if (audience !== 'platform') return;
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    async function connect() {
      if (cancelled) return;
      try {
        const ticket = await notificationClient.platformStreamTicket();
        if (cancelled) return;
        source = new EventSource(platformStreamUrl(ticket));
        source.addEventListener('notification', () => void refresh());
        source.onerror = () => {
          source?.close();
          if (!cancelled) retry = setTimeout(() => void connect(), 5000);
        };
      } catch {
        if (!cancelled) retry = setTimeout(() => void connect(), 10_000);
      }
    }
    void connect();
    return () => { cancelled=true; if (retry) clearTimeout(retry); source?.close(); };
  }, [audience, refresh]);

  React.useEffect(() => {
    const closeOutside = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const closeEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown',closeOutside);
    document.addEventListener('keydown',closeEscape);
    return () => { document.removeEventListener('mousedown',closeOutside); document.removeEventListener('keydown',closeEscape); };
  }, []);

  const unread = rows.filter(row => !row.readAt).length;
  const mark = async (id?: string) => {
    try {
      await notificationClient.markRead(audience,id);
      setRows(old => old.map(row => (!id || row.id === id) ? {...row,readAt:new Date().toISOString()} : row));
    } catch { setError(true); }
  };
  const settingsPath = audience === 'platform' ? '/admin/notification-settings' : '/notification-settings';

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label="Notifications" aria-haspopup="dialog" aria-expanded={open}
        onClick={event => {
          if (!open && placement === 'sidebar') {
            const box = event.currentTarget.getBoundingClientRect();
            const width = Math.min(340,window.innerWidth-16);
            setMenuPosition({left:Math.max(8,Math.min(box.left,window.innerWidth-width-8)),bottom:window.innerHeight-box.top+8});
          }
          setOpen(value => !value);
          if (!open) void refresh();
        }}
        className={`relative flex items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] ${placement === 'sidebar' ? 'h-11 w-11' : 'h-9 w-9'}`}>
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-0.5 text-[9px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className={`theme-dropdown z-[200] flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl ${placement === 'sidebar' ? 'fixed w-[min(21rem,calc(100vw-1rem))]' : 'absolute right-0 top-11 w-[min(21rem,calc(100vw-1rem))]'}`}
          style={placement === 'sidebar' ? {left:menuPosition.left,bottom:menuPosition.bottom,maxHeight:`calc(100dvh - ${menuPosition.bottom + 8}px)`} : undefined}>
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Notifications</span>
            <div className="flex items-center gap-3">
              {unread > 0 && <button type="button" aria-label="Mark all notifications as read" title="Mark all as read"
                onClick={() => void mark()} className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
                <CheckCheck aria-hidden="true" className="h-4 w-4" />
              </button>}
              <button type="button" aria-label="Notification settings" title="Notification settings" className="text-[var(--text-muted)] hover:text-[var(--text-primary)]" onClick={() => { setOpen(false); navigate(settingsPath); }}>
                <Settings2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="max-h-80 min-h-0 overflow-y-auto">
            {loading && <div role="status" className="flex items-center justify-center gap-2 p-5 text-xs text-[var(--text-muted)]"><Loader2 className="h-4 w-4 animate-spin" /> Loading notifications…</div>}
            {error && <div role="alert" className="flex items-center justify-between gap-2 px-4 py-3 text-xs text-[var(--text-secondary)]">
              Notifications temporarily unavailable. <button type="button" className="text-blue-600 underline" onClick={() => void refresh()}>Retry</button>
            </div>}
            {!loading && rows.length === 0 && !error && <div className="flex flex-col items-center gap-2 p-10 text-xs text-[var(--text-muted)]"><MailCheck className="h-6 w-6" /> All caught up</div>}
            {rows.map(row => (
              <div key={row.id} className={`flex items-start gap-2 border-b border-[var(--border)] px-3 py-2 last:border-0 ${row.readAt ? '' : 'bg-blue-500/5'}`}>
                <button type="button" className="flex min-w-0 flex-1 items-start gap-3 rounded-lg px-1 py-1 text-left hover:bg-[var(--bg-subtle)]"
                  onClick={() => {
                    if (!row.readAt) void mark(row.id);
                    if (row.actionPath?.startsWith('/') && !row.actionPath.startsWith('//')) { setOpen(false); navigate(row.actionPath); }
                  }}>
                  <span className="mt-0.5 shrink-0">{notificationIcon(row.eventKey)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-[var(--text-primary)]">{row.title}</span>
                    <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">{row.message}</span>
                    <span className="mt-1 block text-[10px] text-[var(--text-muted)]">{timeAgo(row.occurredAt)}</span>
                  </span>
                  {!row.readAt && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" aria-label="Unread" />}
                </button>
                {!row.readAt && <button type="button" aria-label={`Mark ${row.title} as read`} title="Mark as read"
                  onClick={() => void mark(row.id)}
                  className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
                  <CheckCheck aria-hidden="true" className="h-4 w-4" />
                </button>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
