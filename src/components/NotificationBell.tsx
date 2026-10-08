<title>Notification Bell</title>
import React, { useEffect, useRef, useState } from 'react';
import { Bell, Phone, Activity, X, CheckCheck, CreditCard, Loader2 } from 'lucide-react';
import { BillingApiError, billingClient, newBillingIdempotencyKey } from '../lib/billing';

export interface AppNotification {
  id: string;
  type: string;
  message: string;
  timestamp: number;
  read: boolean;
  title?: string;
  source?: 'live' | 'billing';
  eventKey?: string;
  scopeType?: 'organization' | 'workspace';
  scopeOwnerId?: string;
}

interface Props {
  notifications: AppNotification[];
  onMarkAllRead: () => void;
  onClear: () => void;
}

function typeIcon(type: string) {
  if (type === 'call_started' || type === 'call_completed') return <Phone className="h-3.5 w-3.5 text-blue-500 shrink-0" />;
  if (type.startsWith('billing.') || type.startsWith('payment.')) return <CreditCard className="h-3.5 w-3.5 text-emerald-600 shrink-0" />;
  return <Activity className="h-3.5 w-3.5 text-slate-400 shrink-0" />;
}

function timeAgo(ts: number) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function NotificationBell({ notifications, onMarkAllRead, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const [billingNotifications, setBillingNotifications] = useState<AppNotification[]>([]);
  const [loadingBilling, setLoadingBilling] = useState(false);
  const [billingError, setBillingError] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const activeScope = () => {
    try {
      const orgId = sessionStorage.getItem('chiefx_active_org_id') || localStorage.getItem('chiefx_active_org_id');
      const workspaceId = sessionStorage.getItem('chiefx_active_workspace_id') || localStorage.getItem('chiefx_active_workspace_id');
      return { orgId, workspaceId };
    } catch { return { orgId: null, workspaceId: null }; }
  };
  const scope = activeScope();
  const visibleBilling = billingNotifications.filter((item) => item.scopeType === 'organization'
    ? !scope.orgId || item.scopeOwnerId === scope.orgId
    : !scope.workspaceId || item.scopeOwnerId === scope.workspaceId);
  const allNotifications = [...notifications, ...visibleBilling];
  const unread = allNotifications.filter(n => !n.read).length;

  const loadBillingNotifications = async () => {
    setLoadingBilling(true);
    setBillingError('');
    try {
      const page = await billingClient.notifications(null, 25);
      const mapped = page.rows.map((item) => ({
        id: item.id,
        type: `billing.${item.eventKey}`,
        message: item.message,
        title: item.title,
        timestamp: Date.parse(item.occurredAt),
        read: Boolean(item.readAt),
        source: 'billing' as const,
        eventKey: item.eventKey,
        scopeType: item.scopeType,
        scopeOwnerId: item.scopeOwnerId,
      }));
      setBillingNotifications(mapped);
    } catch (error) {
      setBillingError(error instanceof BillingApiError && error.status === 404
        ? 'Billing alerts are not available on this server yet.'
        : error instanceof Error ? error.message : 'Billing notifications could not be loaded.');
    } finally { setLoadingBilling(false); }
  };

  const markVisibleRead = async () => {
    onMarkAllRead();
    const unreadBilling = visibleBilling.filter((item) => !item.read);
    if (!unreadBilling.length) return;
    const results = await Promise.allSettled(unreadBilling.map((item) => billingClient.markNotificationRead(item.id, { idempotencyKey: newBillingIdempotencyKey() })));
    const succeeded = new Set(unreadBilling.filter((_, index) => results[index].status === 'fulfilled').map((item) => item.id));
    setBillingNotifications((current) => current.map((item) => succeeded.has(item.id) ? { ...item, read: true } : item));
    const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failure) setBillingError(failure.reason instanceof Error ? failure.reason.message : 'Billing notifications could not be marked read.');
  };

  const markBillingNotificationRead = async (notification: AppNotification) => {
    if (notification.source !== 'billing' || notification.read) return;
    try {
      await billingClient.markNotificationRead(notification.id, { idempotencyKey: newBillingIdempotencyKey() });
      setBillingNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read: true } : item));
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Notification could not be marked read.');
    }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(o => !o); if (!open) { onMarkAllRead(); void loadBillingNotifications(); } }}
        className="relative flex items-center justify-center h-8 w-8 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-0.5 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="theme-dropdown absolute right-0 top-10 w-80 rounded-2xl shadow-2xl border z-50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-800">Notifications</span>
            <div className="flex items-center gap-2">
              {visibleBilling.some((item) => !item.read) && (
                <button onClick={() => void markVisibleRead()} className="text-[10px] text-slate-400 hover:text-emerald-600 transition-colors">
                  Mark billing read
                </button>
              )}
              {notifications.length > 0 && (
                <button onClick={onClear} className="text-[10px] text-slate-400 hover:text-rose-500 flex items-center gap-1 transition-colors">
                  <X className="h-3 w-3" /> Clear call alerts
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-80">
            {loadingBilling && <div className="flex items-center justify-center gap-2 py-3 text-[11px] text-slate-400"><Loader2 className="h-3 w-3 animate-spin" /> Loading billing alerts…</div>}
            {billingError && <div className="px-4 py-2 text-[11px] text-rose-600">{billingError}<button onClick={() => void loadBillingNotifications()} className="ml-2 underline">Retry</button></div>}
            {!loadingBilling && !billingError && allNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <CheckCheck className="h-6 w-6 mb-2 opacity-40" />
                <p className="text-xs">All caught up</p>
              </div>
            ) : (
              allNotifications.slice().sort((a, b) => b.timestamp - a.timestamp).map(n => (
                <button type="button" onClick={() => void markBillingNotificationRead(n)} key={`${n.source || 'live'}:${n.id}`} className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-slate-50 dark:border-[var(--border-subtle)] last:border-0 ${n.read ? '' : 'bg-blue-50/40 dark:bg-blue-500/10'}`}>
                  <div className="mt-0.5">{typeIcon(n.type)}</div>
                  <div className="flex-1 min-w-0">
                    {n.title && <p className="text-xs font-semibold text-slate-800 leading-snug">{n.title}</p>}
                    <p className="text-xs text-slate-700 leading-snug">{n.message}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{timeAgo(n.timestamp)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
