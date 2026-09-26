import React, { useEffect, useState } from 'react';
import { ShieldBan, Plus, Trash2, Clock, Loader2, CheckCircle2, PhoneOff, Globe2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import PageShell from './ui/PageShell';
import Widget from './ui/Widget';
import Button from './ui/Button';

interface DncEntry { id: string; phone: string; reason: string | null; createdAt: string; }
interface CallingWindow { enabled: boolean; startHour: number; endHour: number; timezone: string; }

export default function ComplianceView() {
  const [dnc, setDnc] = useState<DncEntry[]>([]);
  const [window_, setWindow] = useState<CallingWindow | null>(null);
  const [loading, setLoading] = useState(true);
  const [newPhone, setNewPhone] = useState('');
  const [newReason, setNewReason] = useState('');
  const [adding, setAdding] = useState(false);
  const [savingWindow, setSavingWindow] = useState(false);

  const loadAll = (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    Promise.all([
      apiFetch('/api/compliance/dnc').then(r => r.json()),
      apiFetch('/api/compliance/calling-window').then(r => r.json()),
    ]).then(([dncList, win]) => {
      setDnc(Array.isArray(dncList) ? dncList : []);
      setWindow(win);
    }).finally(() => { if (showSpinner) setLoading(false); });
  };

  useEffect(() => { loadAll(true); }, []);

  const handleAddDnc = async () => {
    if (!newPhone.trim()) return;
    setAdding(true);
    const res = await apiFetch('/api/compliance/dnc', { method: 'POST', body: JSON.stringify({ phone: newPhone.trim(), reason: newReason.trim() || undefined }) });
    setAdding(false);
    if (res.ok) { const entry = await res.json(); setDnc(prev => [entry, ...prev]); setNewPhone(''); setNewReason(''); }
    else alert((await res.json()).error || 'Failed to add');
  };

  const handleRemoveDnc = async (id: string) => {
    const res = await apiFetch(`/api/compliance/dnc/${id}`, { method: 'DELETE' });
    if (res.ok) setDnc(prev => prev.filter(e => e.id !== id));
  };

  const handleSaveWindow = async () => {
    if (!window_) return;
    setSavingWindow(true);
    const res = await apiFetch('/api/compliance/calling-window', { method: 'POST', body: JSON.stringify(window_) });
    setSavingWindow(false);
    if (res.ok) setWindow(await res.json());
    else alert((await res.json()).error || 'Failed to save');
  };

  return (
    <PageShell title="Compliance" subtitle="Control who can be called and when outbound AI calls are allowed." onRefresh={() => loadAll()}>
      {loading || !window_ ? (
        <div className="col-span-12 flex min-h-[240px] items-center justify-center text-[var(--text-muted)]"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading compliance settings…</div>
      ) : (
        <div className="col-span-12 grid grid-cols-12 gap-4 xl:gap-5">
          <Widget colSpan={6} title="Calling Window" subtitle="Set the hours when outbound AI calls are permitted." icon={Clock} accent="#2563eb" padding="md" className="col-span-12 lg:col-span-6">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3 sm:p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" checked={window_.enabled} onChange={e => setWindow({ ...window_, enabled: e.target.checked })} className="mt-1 h-4 w-4 rounded" />
                <span><span className="block text-sm font-semibold text-[var(--text)]">Restrict outbound calling hours</span><span className="mt-0.5 block text-xs text-[var(--text-muted)]">Calls outside this window will not be placed.</span></span>
              </label>
            </div>
            {window_.enabled ? (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3"><label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Start hour</label><input type="number" min={0} max={23} value={window_.startHour} onChange={e => setWindow({ ...window_, startHour: Number(e.target.value) })} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-blue-500" /><p className="mt-1 text-[11px] text-[var(--text-muted)]">0–23 hour format</p></div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3"><label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">End hour</label><input type="number" min={0} max={23} value={window_.endHour} onChange={e => setWindow({ ...window_, endHour: Number(e.target.value) })} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-blue-500" /><p className="mt-1 text-[11px] text-[var(--text-muted)]">0–23 hour format</p></div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3 sm:col-span-2 lg:col-span-1"><label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"><Globe2 className="h-3.5 w-3.5" />Timezone</label><input value={window_.timezone} onChange={e => setWindow({ ...window_, timezone: e.target.value })} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-blue-500" placeholder="Asia/Kolkata" /><p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">IANA timezone</p></div>
              </div>
            ) : <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4 shrink-0" /> Calling-hour restriction is disabled.</div>}
            <div className="mt-4 flex justify-end"><Button variant="primary" size="sm" loading={savingWindow} onClick={handleSaveWindow}>Save calling window</Button></div>
          </Widget>

          <Widget colSpan={6} title="Do-Not-Call List" subtitle="Numbers that must be excluded from outbound AI dialing." icon={ShieldBan} accent="#e11d48" padding="md" className="col-span-12 lg:col-span-6">
            <div className="rounded-xl border border-rose-200/70 bg-rose-50/40 p-3 dark:border-rose-900/40 dark:bg-rose-950/10 sm:p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-medium text-rose-700 dark:text-rose-400"><PhoneOff className="h-4 w-4 shrink-0" /> Protected numbers will be skipped by outbound campaigns.</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Phone number" className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-rose-400" />
                <input value={newReason} onChange={e => setNewReason(e.target.value)} placeholder="Reason (optional)" className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-rose-400" />
                <Button variant="primary" size="sm" icon={Plus} loading={adding} onClick={handleAddDnc}>Add</Button>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3"><span className="text-xs font-semibold text-[var(--text-muted)]">{dnc.length} protected {dnc.length === 1 ? 'number' : 'numbers'}</span>{dnc.length > 0 && <span className="text-[11px] text-[var(--text-muted)]">Scroll to view all</span>}</div>
            <div className="mt-2 max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {dnc.length === 0 ? <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center"><ShieldBan className="h-6 w-6 text-[var(--text-muted)]" /><p className="mt-2 text-sm font-medium text-[var(--text)]">No protected numbers</p><p className="mt-1 text-xs text-[var(--text-muted)]">Add a number above to prevent outbound calls.</p></div> : dnc.map(e => (
                <div key={e.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400"><PhoneOff className="h-3.5 w-3.5" /></div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[var(--text)]">{e.phone}</p>{e.reason && <p className="truncate text-xs text-[var(--text-muted)]">{e.reason}</p>}</div>
                  <button type="button" aria-label={`Remove ${e.phone} from do-not-call list`} onClick={() => handleRemoveDnc(e.id)} className="shrink-0 rounded-lg p-2 text-[var(--text-muted)] transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/20"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </Widget>
        </div>
      )}
    </PageShell>
  );
  );
}
