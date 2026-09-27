import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Globe2,
  Loader2,
  LockKeyhole,
  PhoneOff,
  Plus,
  Save,
  Search,
  ShieldBan,
  ShieldCheck,
  Trash2,
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
        body: JSON.stringify({ phone: newPhone.trim(), reason: newReason.trim() || undefined }),
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

  if (loading || !window_) {
    return (
      <PageShell title="Compliance" onRefresh={() => loadAll()}>
        <div className="col-span-12 flex min-h-[420px] items-center justify-center text-sm text-[var(--text-muted)]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading compliance settings…
        </div>
      </PageShell>
    );
  }

  const isRestricted = window_.enabled;
  const hoursLabel = isRestricted
    ? `${formatHour(window_.startHour)} – ${formatHour(window_.endHour)}`
    : 'Any time';

  return (
    <PageShell
      title="Compliance"
      subtitle="Control outbound calling rules and keep protected numbers out of campaigns."
      onRefresh={() => loadAll()}
    >
      <div className="col-span-12 space-y-5">
        <div className="grid grid-cols-12 gap-4">
          <KpiCard
            className="!col-span-12 md:!col-span-4 min-h-[122px]"
            label="Calling protection"
            value={isRestricted ? 'Protected' : 'Open'}
            sub={isRestricted ? 'Calls are limited to the configured window' : 'No calling-hour restriction is active'}
            badge={isRestricted ? 'ACTIVE' : 'REVIEW'}
            badgeColor={isRestricted ? 'green' : 'amber'}
            icon={isRestricted ? ShieldCheck : AlertTriangle}
            iconBg="var(--bg-subtle)"
            iconColor={isRestricted ? '#059669' : '#d97706'}
            iconPosition="left"
          />
          <KpiCard
            className="!col-span-12 md:!col-span-4 min-h-[122px]"
            label="Protected numbers"
            value={dnc.length}
            sub={dnc.length === 1 ? '1 number excluded from outbound calls' : 'Numbers excluded from outbound calls'}
            icon={ShieldBan}
            iconBg="var(--bg-subtle)"
            iconColor="#e11d48"
            iconPosition="left"
          />
          <KpiCard
            className="!col-span-12 md:!col-span-4 min-h-[122px]"
            label="Calling schedule"
            value={hoursLabel}
            sub={window_.timezone || 'Timezone not configured'}
            icon={Clock3}
            iconBg="var(--bg-subtle)"
            iconColor="#2563eb"
            iconPosition="left"
          />
        </div>

        {message && (
          <div className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-400'
              : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-400'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            <span>{message.text}</span>
          </div>
        )}

        <div className="grid grid-cols-12 items-stretch gap-4 xl:gap-5 lg:h-[calc(100vh-430px)] lg:min-h-[560px]">
          <div className="col-span-12 lg:col-span-6 min-w-0 h-full">
            <Widget
              colSpan={12}
              responsive={false}
              title="Calling window"
              subtitle="Choose when outbound AI calls are allowed to run."
              icon={Clock3}
              accent="#2563eb"
              padding="none"
              className="h-full !col-span-12 flex flex-col overflow-hidden"
              action={
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                  isRestricted
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-400'
                    : 'border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-muted)]'
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${isRestricted ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  {isRestricted ? 'Restricted' : 'Open'}
                </span>
              }
            >
              <div className="flex h-full min-h-0 flex-col p-5 sm:p-6">
                <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                  isRestricted
                    ? 'border-blue-200 bg-blue-50/60 dark:border-blue-900/50 dark:bg-blue-950/10'
                    : 'border-[var(--border)] bg-[var(--bg-subtle)]'
                }`}>
                  <input
                    type="checkbox"
                    checked={isRestricted}
                    onChange={e => setWindow({ ...window_, enabled: e.target.checked })}
                    className="mt-1 h-4 w-4 rounded border-[var(--border)]"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                      Restrict outbound calling hours
                      {isRestricted && <LockKeyhole className="h-3.5 w-3.5 text-blue-500" />}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">
                      Calls outside this window will be blocked by outbound campaigns.
                    </span>
                  </span>
                </label>

                {isRestricted ? (
                  <div className="mt-5 space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3.5">
                        <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Start time</label>
                        <select
                          value={window_.startHour}
                          onChange={e => setWindow({ ...window_, startHour: Number(e.target.value) })}
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-blue-500"
                        >
                          {hourOptions.map(hour => <option key={hour} value={hour}>{formatHour(hour)}</option>)}
                        </select>
                      </div>
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3.5">
                        <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">End time</label>
                        <select
                          value={window_.endHour}
                          onChange={e => setWindow({ ...window_, endHour: Number(e.target.value) })}
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-blue-500"
                        >
                          {hourOptions.map(hour => <option key={hour} value={hour}>{formatHour(hour)}</option>)}
                        </select>
                      </div>
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3.5">
                        <label className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                          <Globe2 className="h-3.5 w-3.5" /> Timezone
                        </label>
                        <input
                          value={window_.timezone}
                          onChange={e => setWindow({ ...window_, timezone: e.target.value })}
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-blue-500"
                          placeholder="Asia/Kolkata"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 rounded-xl border border-blue-200/70 bg-blue-50/50 px-3.5 py-3 text-xs text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/10 dark:text-blue-300">
                      <Clock3 className="h-4 w-4 shrink-0" />
                      <span>Outbound calls are allowed from <strong>{hoursLabel}</strong> in <strong>{window_.timezone}</strong>.</span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 dark:border-amber-900/50 dark:bg-amber-950/20">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div>
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Calling-hour protection is disabled</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-amber-700/80 dark:text-amber-300/70">Outbound campaigns are not restricted by this setting.</p>
                    </div>
                  </div>
                )}

                <div className="mt-6 flex flex-col gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[11px] text-[var(--text-muted)]">Save changes to apply this rule to outbound campaigns.</p>
                  <Button variant="primary" size="sm" icon={Save} loading={savingWindow} onClick={handleSaveWindow}>Save changes</Button>
                </div>
              </div>
            </Widget>
          </div>

          <div className="col-span-12 lg:col-span-6 min-w-0 h-full">
            <Widget
              colSpan={12}
              responsive={false}
              title="Do-not-call list"
              subtitle="Numbers that outbound campaigns must never contact."
              icon={ShieldBan}
              accent="#e11d48"
              padding="none"
              className="h-full !col-span-12"
              action={
                <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-semibold text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400">
                  {dnc.length} protected
                </span>
              }
            >
              <div className="flex h-full min-h-0 flex-col p-5 sm:p-6">
                <div className="rounded-xl border border-rose-200/70 bg-rose-50/40 p-3.5 dark:border-rose-900/40 dark:bg-rose-950/10">
                  <div className="flex items-start gap-2.5">
                    <PhoneOff className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                    <div>
                      <p className="text-xs font-semibold text-rose-700 dark:text-rose-400">Protected numbers are skipped</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-rose-600/80 dark:text-rose-400/70">Add a number once and it stays excluded from outbound dialing.</p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    <input
                      value={newPhone}
                      onChange={e => setNewPhone(e.target.value)}
                      placeholder="Phone number"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-rose-400"
                    />
                    <div className="flex gap-2">
                      <input
                        value={newReason}
                        onChange={e => setNewReason(e.target.value)}
                        placeholder="Reason (optional)"
                        className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-rose-400"
                      />
                      <Button variant="primary" size="sm" icon={Plus} loading={adding} disabled={!newPhone.trim()} onClick={handleAddDnc}>Add</Button>
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <SearchInput value={dncSearch} onChange={setDncSearch} placeholder="Search protected numbers..." />
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-[var(--text-primary)]">Protected numbers</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{filteredDnc.length} shown</p>
                  </div>
                </div>

                <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-auto pr-1">
                  {filteredDnc.length === 0 ? (
                    <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg-subtle)]">
                        <ShieldBan className="h-5 w-5 text-[var(--text-muted)]" />
                      </div>
                      <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{dnc.length ? 'No matching numbers' : 'No protected numbers'}</p>
                      <p className="mt-1 max-w-xs text-[11px] leading-4 text-[var(--text-muted)]">{dnc.length ? 'Try another phone number or reason.' : 'Numbers added above will be skipped by outbound campaigns.'}</p>
                    </div>
                  ) : (
                    filteredDnc.map(entry => (
                      <div key={entry.id} className="group flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5 transition hover:border-rose-200 dark:hover:border-rose-900/50">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400">
                          <PhoneOff className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{entry.phone}</p>
                          <p className="truncate text-[11px] text-[var(--text-muted)]">{entry.reason || 'Protected number'}</p>
                        </div>
                        <button
                          type="button"
                          aria-label={`Remove ${entry.phone} from do-not-call list`}
                          onClick={() => handleRemoveDnc(entry.id)}
                          className="rounded-lg p-2 text-[var(--text-muted)] transition hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
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
      </div>
    </PageShell>
  );
}
