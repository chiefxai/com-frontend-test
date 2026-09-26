import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Loader2, Phone, MessageCircleQuestion, Megaphone, ArrowUpRight, ArrowDownLeft, PhoneMissed, CalendarClock, Search, Filter, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatPhone } from '../lib/phone';
import PageShell from './ui/PageShell';
import BreadcrumbTitle from './ui/BreadcrumbTitle';
import Widget from './ui/Widget';
import EmptyState from './ui/EmptyState';
import DataTable, { Column } from './ui/DataTable';

interface ScheduledCallback {
  id: string;
  leadName: string;
  callerNumber?: string;
  direction?: 'inbound' | 'outbound';
  status?: string;
  // "callback" — the caller explicitly asked to be called back.
  // "not_answered" — nobody picked up, or it hit voicemail/an answering
  // machine — still queued for an automatic redial, just for a different
  // reason. See db.getScheduledCallbacks.
  kind?: 'callback' | 'not_answered';
  reason?: string;
  callbackTime?: string;
  callbackReason?: string;
  nextRetryAt?: string;
  createdAt: string;
  campaignId?: string | null;
  campaignName?: string | null;
  /** @deprecated use campaignName — same dialer task name */
  workflowName?: string | null;
  campaignQuestions?: string[];
  workflowQuestions?: string[];
  callerTimezone?: string;
  callbackTimeLocalLabel?: string;
  nextRetryAtLocalLabel?: string;
  scheduleLocalLabel?: string;
}

const KIND_CHIP: Record<'callback' | 'not_answered', { label: string; className: string }> = {
  callback: { label: 'Callback', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  not_answered: { label: 'Not Answered', className: 'bg-rose-50 text-rose-700 border-rose-200' },
};

export default function ScheduledCallbacksView() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ScheduledCallback[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState('all');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [search, setSearch] = useState('');

  const campaignOptions = Array.from(
    new Map(
      rows
        .filter((r) => r.campaignId || r.campaignName || r.workflowName)
        .map((r) => [
          r.campaignId || r.campaignName || r.workflowName || '',
          r.campaignName || r.workflowName || 'Unnamed campaign',
        ])
    ).entries()
  ).map(([id, name]) => ({ id, name }));

  const statusOptions = Array.from(
    new Set(rows.map((r) => r.status).filter((v): v is string => Boolean(v)))
  ).sort();

  const filteredRows = rows.filter((r) => {
    const campaignId = r.campaignId || r.campaignName || r.workflowName || '';
    const haystack = [
      r.leadName,
      r.callerNumber,
      r.reason,
      r.callbackReason,
      r.campaignName,
      r.workflowName,
    ].filter(Boolean).join(' ').toLowerCase();

    return (
      (campaignFilter === 'all' || campaignId === campaignFilter) &&
      (statusFilter === 'all' || r.status === statusFilter) &&
      (kindFilter === 'all' || (r.kind || 'not_answered') === kindFilter) &&
      (directionFilter === 'all' || (r.direction || 'outbound') === directionFilter) &&
      (!search.trim() || haystack.includes(search.trim().toLowerCase()))
    );
  });

  const hasActiveFilters =
    campaignFilter !== 'all' ||
    statusFilter !== 'all' ||
    kindFilter !== 'all' ||
    directionFilter !== 'all' ||
    Boolean(search.trim());

  const clearFilters = () => {
    setCampaignFilter('all');
    setStatusFilter('all');
    setKindFilter('all');
    setDirectionFilter('all');
    setSearch('');
  };

  const load = (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    apiFetch('/api/scheduled-callbacks')
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          console.error('Failed to load scheduled callbacks:', body?.error || r.status);
          return [];
        }
        return r.json();
      })
      .then((result: ScheduledCallback[] | null) => setRows(Array.isArray(result) ? result : []))
      .catch((err) => console.error('Failed to load scheduled callbacks:', err))
      .finally(() => { if (showSpinner) setLoading(false); });
  };

  // No live push for this yet (unlike the dialer queue's SSE feed) — a
  // call landing in "Callback Scheduled" or an automatic redial clearing
  // one out both only show up on the next load, so poll modestly instead
  // of leaving the page to go stale until manually refreshed.
  useEffect(() => {
    load(true);
    const interval = setInterval(() => load(false), 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <PageShell
      title={<BreadcrumbTitle group="Campaign" page="Scheduled Callbacks" />}
      subtitle="Calls waiting on an automatic redial — either the caller asked to be called back, or nobody answered — with the reason and when it'll try again."
      onRefresh={() => load()}
      layout="fill"
    >
      <div className="flex-1 flex flex-col overflow-hidden px-8 pb-8 pt-6">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
        ) : (
          <Widget className="flex-1" showHeader={false} padding="none">
            {rows.length === 0
              ? <EmptyState icon={Clock} heading="Nothing pending a redial" message="A caller asking to be called back, or a call nobody answered, will show up here with the reason and next attempt time." />
              : (() => {
                  const columns: Column<ScheduledCallback>[] = [
                    {
                      key: 'kind',
                      header: 'Status',
                      cell: (r) => {
                        const chip = KIND_CHIP[r.kind || 'not_answered'];
                        return (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border whitespace-nowrap ${chip.className}`}>
                            {r.kind === 'callback' ? <CalendarClock className="h-3 w-3" /> : <PhoneMissed className="h-3 w-3" />}
                            {chip.label}
                          </span>
                        );
                      },
                    },
                    {
                      key: 'who',
                      header: 'Who',
                      cell: (r) => (
                        <div>
                          <div className="font-medium text-slate-700 flex items-center gap-1.5">
                            {r.direction === 'inbound' ? <ArrowDownLeft className="h-3 w-3 text-blue-500" /> : <ArrowUpRight className="h-3 w-3 text-emerald-500" />}
                            {r.leadName || 'Unknown'}
                          </div>
                          {r.callerNumber && (
                            <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-400">
                              <Phone className="h-3 w-3" /> {formatPhone(r.callerNumber)}
                            </div>
                          )}
                        </div>
                      ),
                    },
                    {
                      key: 'reason',
                      header: 'Reason',
                      cell: (r) => (r.reason || r.callbackReason)
                        ? <span className="text-slate-600 max-w-sm block italic">"{r.reason || r.callbackReason}"</span>
                        : <span className="text-slate-300 italic">Not specified</span>,
                    },
                    {
                      key: 'when',
                      header: 'Timing',
                      cell: (r) => (
                        <div>
                          {r.kind === 'callback' && (
                            <div className="text-slate-700 font-medium whitespace-nowrap">
                              {r.callbackTimeLocalLabel || r.scheduleLocalLabel
                                || (r.callbackTime
                                  ? new Date(r.callbackTime).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                                  : 'Not specified')}
                            </div>
                          )}
                          {r.nextRetryAt && (
                            <div className={r.kind === 'callback' ? 'text-[10px] text-slate-400 mt-0.5 whitespace-nowrap' : 'text-xs text-slate-700 font-medium whitespace-nowrap'}>
                              {r.kind === 'callback' ? 'Next attempt: ' : 'Retries at '}
                              {r.nextRetryAtLocalLabel
                                || new Date(r.nextRetryAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                              {r.callerTimezone ? ` (${r.callerTimezone})` : ''}
                            </div>
                          )}
                        </div>
                      ),
                    },
                    {
                      key: 'campaign',
                      header: 'Campaign',
                      cell: (r) => {
                        const name = r.campaignName || r.workflowName;
                        const campaignId = r.campaignId;
                        if (!name) {
                          return <span className="text-slate-300 italic text-xs">No campaign (inbound)</span>;
                        }
                        return (
                          <div className="flex flex-col gap-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                if (campaignId) {
                                  navigate(`/voice-simulator/outbound?campaign=${encodeURIComponent(campaignId)}`);
                                }
                              }}
                              className={`inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline cursor-pointer text-left ${campaignId ? '' : 'pointer-events-none'}`}
                              title={campaignId ? 'Open this campaign in Voice Simulator' : undefined}
                            >
                              <Megaphone className="h-3 w-3 shrink-0" /> {name}
                            </button>
                            <button
                              type="button"
                              onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                              className="text-[10px] text-slate-400 hover:text-indigo-600 text-left"
                            >
                              View questions
                            </button>
                          </div>
                        );
                      },
                    },
                    {
                      key: 'scheduled',
                      header: 'Scheduled On',
                      cell: (r) => <span className="text-slate-400 text-xs whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</span>,
                    },
                  ];
                  return (
                    <>
                      <div className="border-b border-[var(--border)] bg-[var(--bg-surface)] p-4">
                        <div className="flex flex-col xl:flex-row xl:items-center gap-3">
                          <div className="relative flex-1 min-w-[220px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                            <input
                              value={search}
                              onChange={(e) => setSearch(e.target.value)}
                              placeholder="Search lead, phone, reason or campaign..."
                              className="w-full h-9 pl-9 pr-3 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-blue-500"
                            />
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                              <Filter className="h-3.5 w-3.5" /> Filters
                            </div>

                            <select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)}
                              className="h-9 min-w-[170px] rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-xs text-[var(--text-primary)] outline-none focus:border-blue-500">
                              <option value="all">All campaigns</option>
                              {campaignOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>

                            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                              className="h-9 min-w-[130px] rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-xs text-[var(--text-primary)] outline-none focus:border-blue-500">
                              <option value="all">All statuses</option>
                              {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                            </select>

                            <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}
                              className="h-9 min-w-[125px] rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-xs text-[var(--text-primary)] outline-none focus:border-blue-500">
                              <option value="all">All types</option>
                              <option value="callback">Callback</option>
                              <option value="not_answered">Not Answered</option>
                            </select>

                            <select value={directionFilter} onChange={(e) => setDirectionFilter(e.target.value)}
                              className="h-9 min-w-[120px] rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-xs text-[var(--text-primary)] outline-none focus:border-blue-500">
                              <option value="all">All directions</option>
                              <option value="outbound">Outbound</option>
                              <option value="inbound">Inbound</option>
                            </select>

                            {hasActiveFilters && (
                              <button type="button" onClick={clearFilters}
                                className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]">
                                <X className="h-3.5 w-3.5" /> Clear
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between mt-3 text-[10px] text-[var(--text-muted)]">
                          <span>{filteredRows.length} of {rows.length} callbacks</span>
                          {campaignFilter !== 'all' && (
                            <span className="font-medium text-blue-600">
                              Campaign filter active
                            </span>
                          )}
                        </div>
                      </div>

                      {filteredRows.length === 0 ? (
                        <div className="py-14 text-center">
                          <Filter className="h-7 w-7 mx-auto text-[var(--text-muted)] mb-2" />
                          <p className="text-sm font-semibold text-[var(--text-primary)]">No callbacks match these filters</p>
                          <p className="text-xs text-[var(--text-muted)] mt-1">Change the campaign, status, type, direction, or search term.</p>
                          {hasActiveFilters && (
                            <button type="button" onClick={clearFilters} className="mt-3 text-xs font-semibold text-blue-600 hover:underline">Clear all filters</button>
                          )}
                        </div>
                      ) : (
                      <DataTable
                        bare
                        resizable
                        paginated
                        columns={columns}
                        rows={filteredRows}
                        rowKey={(r) => r.id}
                      />
                      )}
                      {expandedId && (() => {
                        const row = filteredRows.find((r) => r.id === expandedId) || rows.find((r) => r.id === expandedId);
                        const questions = row.campaignQuestions || row.workflowQuestions;
                        const campaignLabel = row.campaignName || row.workflowName;
                        if (!row || !questions?.length) return null;
                        return (
                          <div className="border-t border-slate-100 p-4 bg-slate-50/60">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
                              <MessageCircleQuestion className="h-3.5 w-3.5" /> {campaignLabel} — Questions
                            </div>
                            <ol className="space-y-1 text-xs text-slate-600 list-decimal list-inside">
                              {questions.map((q, i) => <li key={i}>{q}</li>)}
                            </ol>
                          </div>
                        );
                      })()}
                      </div>
                    </>
                  );
                })()
            }
          </Widget>
        )}
      </div>
    </PageShell>
  );
}
