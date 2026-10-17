import { apiFetch, getApiBase } from '../lib/api';
export type NotificationAudience = 'platform' | 'organization';
export type NotificationChannel = 'browser' | 'email';
export interface ProductNotification {
  id: string;
  eventKey: string;
  title: string;
  message: string;
  actionPath: string | null;
  occurredAt: string;
  readAt: string | null;
  scopeType: 'platform' | 'organization' | 'workspace';
  scopeOwnerId: string | null;
}
export interface NotificationPreference {
  key: string;
  label: string;
  category: string;
  defaults: Record<NotificationChannel, boolean>;
}
export interface NotificationChange {
  eventKey: string;
  channel: NotificationChannel;
  enabled: boolean;
}
export const notificationBase = (audience: NotificationAudience) =>
  audience === 'platform' ? '/api/platform/notifications' : '/api/notifications';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(url, init);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(typeof data.error === 'string' ? data.error : 'Notifications could not be loaded.');
  }
  return response.json() as Promise<T>;
}
export const notificationClient = {
  list: async (audience: NotificationAudience) =>
    (await request<{ rows: ProductNotification[] }>(notificationBase(audience) + '?limit=50')).rows,
  preferences: async (audience: NotificationAudience) =>
    (await request<{ events: NotificationPreference[] }>(notificationBase(audience) + '/preferences')).events,
  setPreferences: async (audience: NotificationAudience, changes: NotificationChange[]) =>
    (await request<{ events: NotificationPreference[] }>(notificationBase(audience) + '/preferences', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes }),
    })).events,
  markRead: async (audience: NotificationAudience, id?: string) =>
    request<{ updated: number }>(notificationBase(audience) + '/read', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(id ? { id } : {}),
    }),
  clear: async (audience: NotificationAudience) =>
    request<{ cleared: number }>(notificationBase(audience) + '/clear', { method: 'POST' }),
  platformStreamTicket: async () =>
    (await request<{ ticket: string }>(notificationBase('platform') + '/stream-ticket', { method: 'POST' })).ticket,
};
export const platformStreamUrl = (ticket: string) =>
  getApiBase() + '/api/platform/notifications/stream?ticket=' + encodeURIComponent(ticket);
