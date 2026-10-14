import React from 'react';
import { Bell, Mail, Save } from 'lucide-react';
import { notificationClient, type NotificationAudience, type NotificationChannel, type NotificationPreference } from './api';

export default function NotificationSettingsPage({ audience }: { audience: NotificationAudience }) {
  const [events, setEvents] = React.useState<NotificationPreference[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    notificationClient.preferences(audience).then(rows => { if (alive) setEvents(rows); })
      .catch(err => { if (alive) setError(err instanceof Error ? err.message : 'Could not load preferences.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [audience]);

  const toggle = (key: string, channel: NotificationChannel) => {
    setNotice('');
    setEvents(old => old.map(item => item.key === key
      ? { ...item, defaults: { ...item.defaults, [channel]: !item.defaults[channel] } } : item));
  };
  const all = (enabled: boolean) => {
    setNotice('');
    setEvents(old => old.map(item => ({ ...item, defaults: { browser: enabled, email: enabled } })));
  };
  const save = async () => {
    setSaving(true); setError(''); setNotice('');
    try {
      const changes = events.flatMap(event => (['browser','email'] as const).map(channel => ({
        eventKey: event.key, channel, enabled: event.defaults[channel],
      })));
      setEvents(await notificationClient.setPreferences(audience, changes));
      setNotice('Notification preferences saved.');
      window.dispatchEvent(new Event('chiefx-notification-change'));
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save preferences.'); }
    finally { setSaving(false); }
  };

  const categories = [...new Set(events.map(event => event.category))];
  return (
    <section className="mx-auto w-full max-w-4xl space-y-5 p-5 md:p-8" aria-label="Notification settings">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Notification Settings</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Choose which business events you receive in-app and by email.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => all(true)} disabled={loading || saving} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-primary)] disabled:opacity-50">Enable all</button>
          <button type="button" onClick={() => all(false)} disabled={loading || saving} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-primary)] disabled:opacity-50">Disable all</button>
        </div>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 text-xs text-[var(--text-secondary)]">
        <span className="font-semibold">In-app</span> notifications appear in the bell and update through the live event stream. <span className="font-semibold">Email</span> requires SMTP to be configured on the server. Transport connection messages are never notifications.
      </div>
      {loading && <p role="status" className="text-sm text-[var(--text-muted)]">Loading notification preferences…</p>}
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-600">{notice}</p>}
      {!loading && categories.map(category => (
        <div key={category} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]">
          <div className="grid grid-cols-[minmax(0,1fr)_64px_64px] gap-3 border-b border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3 sm:grid-cols-[minmax(0,1fr)_110px_110px]">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">{category}</h2>
            <span className="flex justify-center gap-1 text-[11px] text-[var(--text-secondary)]"><Bell className="h-3.5 w-3.5" /> In-app</span>
            <span className="flex justify-center gap-1 text-[11px] text-[var(--text-secondary)]"><Mail className="h-3.5 w-3.5" /> Email</span>
          </div>
          {events.filter(event => event.category === category).map(event => (
            <div key={event.key} className="grid grid-cols-[minmax(0,1fr)_64px_64px] items-center gap-3 border-b border-[var(--border)] px-4 py-3 last:border-0 sm:grid-cols-[minmax(0,1fr)_110px_110px]">
              <span className="text-sm text-[var(--text-primary)]">{event.label}</span>
              {(['browser','email'] as const).map(channel => (
                <label key={channel} className="flex justify-center">
                  <input type="checkbox" className="h-4 w-4 accent-blue-600" aria-label={event.label + ' ' + (channel === 'browser' ? 'In-app' : 'Email')} checked={event.defaults[channel]}
                    onChange={() => toggle(event.key,channel)} disabled={saving} />
                </label>
              ))}
            </div>
          ))}
        </div>
      ))}
      {!loading && <div className="flex justify-end">
        <button type="button" onClick={() => void save()} disabled={saving || events.length === 0}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save preferences'}
        </button>
      </div>}
    </section>
  );
}
