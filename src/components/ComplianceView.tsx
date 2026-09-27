import React, { useEffect, useMemo, useState } from 'react';
import {
  ShieldBan,
  Plus,
  Trash2,
  Clock3,
  Loader2,
  CheckCircle2,
  PhoneOff,
  Globe2,
  ShieldCheck,
  UsersRound,
  AlertTriangle,
  Search,
  Save,
  LockKeyhole,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import PageShell from './ui/PageShell';
import Widget from './ui/Widget';
import Button from './ui/Button';
import KpiCard from './ui/KpiCard';
import SearchInput from './ui/SearchInput';

interface DncEntry {
  id: string;
  phone: string;
  reason: string | null;
  createdAt: string;
}

interface CallingWindow {
  enabled: boolean;
  startHour: number;
  endHour: number;
  timezone: string;
}

const hourOptions = Array.from({ length: 24 }, (_, hour) => hour);

function formatHour(hour: number) {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const normalized = hour % 12 || 12;
  return `${normalized}:00 ${suffix}`;
}

export default function ComplianceView() {
  const [dnc, setDnc] = useState<DncEntry[]>([]);
  const [window_, setWindow] = useState<CallingWindow | null>(null);
  const [loading, setLoading] = useState(true);
  const [newPhone, setNewPhone] = useState('');
  const [newReason, setNewReason] = useState('');
  const [dncSearch, setDncSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [savingWindow, setSavingWindow] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadAll = (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    Promise.all([
      apiFetch('/api/compliance/dnc').then(r => r.json()),
      apiFetch('/api/compliance/calling-window').then(r => r.json()),
    ])
      .then(([dncList, win]) => {
        setDnc(Array.isArray(dncList) ? dncList : []);
        setWindow(win);
      })
      .catch(() => setMessage({ type: 'error', text: 'Unable to load compliance settings.' }))
      .finally(() => {
        if (showSpinner) setLoading(false);
      });
  };

  useEffect(() => { loadAll(true); }, []);

  const filteredDnc = useMemo(() => {
    const query = dncSearch.trim().toLowerCase();
    if (!query) return dnc;
    return dnc.filter(entry =>
      entry.phone.toLowerCase().includes(query) ||
      (entry.reason || '').toLowerCase().includes(query)
    );
  }, [dnc, dncSearch]);

  const handleAddDnc = async () => {
    if (!newPhone.trim()) return;
    setMessage(null);
    setAdding(true);
    try {
      const res = await apiFetch('/api/compliance/dnc', {
        method: 'POST',
        body: JSON.stringify({
          phone: newPhone.trim(),
          reason: newReason.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to add number');
      const entry = await res.json();
      setDnc(prev => [entry, ...prev]);
      setNewPhone('');
      setNewReason('');
      setMessage({ type: 'success', text: 'Number added to the do-not-call list.' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to add number.' });
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveDnc = async (id: string) => {
    const entry = dnc.find(item => item.id === id);
    if (!entry || !window.confirm(`Remove ${entry.phone} from the do-not-call list?`)) return;
    setMessage(null);
    const res = await apiFetch(`/api/compliance/dnc/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setDnc(prev => prev.filter(item => item.id !== id));
      setMessage({ type: 'success', text: 'Number removed from the do-not-call list.' });
    } else {
      setMessage({ type: 'error', text: (await res.json()).error || 'Failed to remove number.' });
    }
  };

  const handleSaveWindow = async () => {
    if (!window_) return;
    setMessage(null);
    setSavingWindow(true);
    try {
      const res = await apiFetch('/api/compliance/calling-window', {
        method: 'POST',
        body: JSON.stringify(window_),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save calling window');
      setWindow(await res.json());
      setMessage({ type: 'success', text: 'Calling window saved successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to save calling window.' });
    } finally {
      setSavingWindow(false);
    }
  };

  const protectionLabel = window_?.enabled ? 'Outbound calling is restricted' : 'No calling-hour restriction';
  const hoursLabel = window_?.enabled
    ? `${formatHour(window_.startHour)} – ${formatHour(window_.endHour)}`
    : 'Any hour';
  const timezoneLabel = window_?.timezone || 'Not configured';

  if (loading || !window_) {
    return (
      <PageShell title="Compliance" subtitle="Protect outbound calling with clear, enforceable safeguards." onRefresh={() => loadAll()}>
        <div className="col-span-12 flex min-h-[360px] items-center justify-center text-[var(--text-muted)]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading compliance settings…
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Compliance"
      subtitle="Protect outbound calling with clear, enforceable safeguards."
      onRefresh={() => loadAll()}
    >
      <div className="col-span-12 space-y-5">
        <div className="grid grid-cols-12 gap-3 xl:gap-4">
          <KpiCard
            className="!col-span-12 sm:!col-span-6 xl:!col-span-4 min-h-[112px]"
            label="Calling protection"
            value={window_.enabled ? 'Protected' : 'Open'}
            sub={protectionLabel}
            badge={window_.enabled ? 'ACTIVE' : 'REVIEW'}
            badgeColor={window_.enabled ? 'green' : 'amber'}
            icon={window_.enabled ? ShieldCheck : AlertTriangle}
            iconBg="var(--bg-subtle)"
            iconColor={window_.enabled ? '#059669' : '#d97706'}
            iconPosition="left"
          />
          <KpiCard
            className="!col-span-12 sm:!col-span-6 xl:!col-span-4 min-h-[112px]"
            label="Protected numbers"
            value={dnc.length}
            sub={dnc.length === 1 ? '1 number will be excluded' : 'Numbers excluded from outbound dialing'}
            icon={ShieldBan}
            iconBg="var(--bg-subtle)"
            iconColor="#e11d48"
            iconPosition="left"
          />
          <KpiCard
            className="!col-span-12 sm:!col-span-6 xl:!col-span-4 min-h-[112px]"
            label="Allowed calling hours"
            value={hoursLabel}
            sub={timezoneLabel}
            icon={Clock3}
            iconBg="var(--bg-subtle)"
            iconColor="#2563eb"
            iconPosition="left"
          />
        </div>

        {message && (
          <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-400'
              : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-400'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        <div className="grid grid-cols-12 items-start gap-4 xl:gap-5">
          <Widget
            colSpan={7}
            title="Calling window"
            subtitle="Define when outbound AI calls are allowed to run."
            icon={Clock3}
            accent="#2563eb"
            padding="md"
            className="col-span-12 lg:col-span-7 min-h-0"
            action={
              <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                window_.enabled
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-400'
                  : 'border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-muted)]'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${window_.enabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                {window_.enabled ? 'Restricted' : 'Open'}
              </div>
            }
          >
            <div className="space-y-4">
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${
                window_.enabled
                  ? 'border-blue-200 bg-blue-50/60 dark:border-blue-900/50 dark:bg-blue-950/10'
                  : 'border-[var(--border)] bg-[var(--bg-subtle)]'
              }`}>
                <input
                  type="checkbox"
                  checked={window_.enabled}
                  onChange={e => setWindow({ ...window_, enabled: e.target.checked })}
                  className="mt-1 h-4 w-4 rounded border-[var(--border)]"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                    Restrict outbound calling hours
                    {window_.enabled && <LockKeyhole className="h-3.5 w-3.5 text-blue-500" />}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-[var(--text-muted)]">
                    Calls outside this window will be blocked by outbound campaigns.
                  </span>
                </span>
              </label>

              {window_.enabled ? (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3">
                      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Start time</label>
                      <select
                        value={window_.startHour}
                        onChange={e => setWindow({ ...window_, startHour: Number(e.target.value) })}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-blue-500"
                      >
                        {hourOptions.map(hour => <option key={hour} value={hour}>{formatHour(hour)}</option>)}
                      </select>
                    </div>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3">
                      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">End time</label>
                      <select
                        value={window_.endHour}
                        onChange={e => setWindow({ ...window_, endHour: Number(e.target.value) })}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-blue-500"
                      >
                        {hourOptions.map(hour => <option key={hour} value={hour}>{formatHour(hour)}</option>)}
                      </select>
                    </div>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3">
                      <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        <Globe2 className="h-3.5 w-3.5" /> Timezone
                      </label>
                      <input
                        value={window_.timezone}
                        onChange={e => setWindow({ ...window_, timezone: e.target.value })}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-blue-500"
                        placeholder="Asia/Kolkata"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 rounded-xl border border-blue-200/70 bg-blue-50/50 px-3 py-2.5 text-xs text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/10 dark:text-blue-300">
                    <Clock3 className="h-4 w-4 shrink-0" />
                    <span>Calls are permitted from <strong>{hoursLabel}</strong> in <strong>{timezoneLabel}</strong>.</span>
                  </div>
                </>
              ) : (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span><strong>Calling-hour protection is disabled.</strong> Outbound campaigns are not restricted by this setting.</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
                <span className="text-[11px] text-[var(--text-muted)]">Changes are applied to outbound campaigns after saving.</span>
                <Button variant="primary" size="sm" icon={Save} loading={savingWindow} onClick={handleSaveWindow}>Save changes</Button>
              </div>
            </div>
          </Widget>

          <Widget
            colSpan={5}
            title="Do-not-call list"
            subtitle="Numbers that outbound campaigns must never contact."
            icon={ShieldBan}
            accent="#e11d48"
            padding="md"
            className="col-span-12 lg:col-span-5 min-h-0"
            action={
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-semibold text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400">
                {dnc.length} protected
              </span>
            }
          >
            <div className="space-y-3">
              <div className="rounded-xl border border-rose-200/70 bg-rose-50/40 p-3 dark:border-rose-900/40 dark:bg-rose-950/10">
                <div className="mb-2.5 flex items-start gap-2">
                  <PhoneOff className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                  <div>
                    <p className="text-xs font-semibold text-rose-700 dark:text-rose-400">Protected numbers are always skipped</p>
                    <p className="mt-0.5 text-[11px] leading-4 text-rose-600/80 dark:text-rose-400/70">Add a number once to keep it excluded from outbound dialing.</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <input
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    placeholder="Phone number"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-rose-400"
                  />
                  <div className="flex gap-2">
                    <input
                      value={newReason}
                      onChange={e => setNewReason(e.target.value)}
                      placeholder="Reason (optional)"
                      className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-rose-400"
                    />
                    <Button variant="primary" size="sm" icon={Plus} loading={adding} disabled={!newPhone.trim()} onClick={handleAddDnc}>Add</Button>
                  </div>
                </div>
              </div>

              <SearchInput value={dncSearch} onChange={setDncSearch} placeholder="Search protected numbers..." />

              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Protected numbers</span>
                <span className="text-[10px] text-[var(--text-muted)]">{filteredDnc.length} shown</span>
              </div>

              <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {filteredDnc.length === 0 ? (
                  <div className="flex min-h-36 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center">
                    <ShieldBan className="h-6 w-6 text-[var(--text-muted)]" />
                    <p className="mt-2 text-sm font-semibold text-[var(--text)]">{dnc.length ? 'No matching numbers' : 'No protected numbers'}</p>
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">{dnc.length ? 'Try a different phone number or reason.' : 'Numbers added above will be skipped by outbound campaigns.'}</p>
                  </div>
                ) : (
                  filteredDnc.map(entry => (
                    <div key={entry.id} className="group flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5 transition-colors hover:border-rose-200 hover:bg-rose-50/30 dark:hover:border-rose-900/50 dark:hover:bg-rose-950/10">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400">
                        <PhoneOff className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[var(--text)]">{entry.phone}</p>
                        {entry.reason && <p className="truncate text-[11px] text-[var(--text-muted)]">{entry.reason}</p>}
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${entry.phone} from do-not-call list`}
                        onClick={() => handleRemoveDnc(entry.id)}
                        className="shrink-0 rounded-lg p-2 text-[var(--text-muted)] transition hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Widget>
        </div>
      </div>
    </PageShell>
  );
}
