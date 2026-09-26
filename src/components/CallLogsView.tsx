import React, { useState, useEffect } from 'react';
import { Eye, PlayCircle, Download, X, Check, ChevronDown, MessageCircleQuestion, RefreshCw } from 'lucide-react';
import SlideOver from './ui/SlideOver';
import { CallLog, Lead } from '../types';
import { callCostInr, formatInr } from '../lib/pricing';
import { normalizePhone, formatPhone } from '../lib/phone';
import { apiFetch, getPlayableRecordingUrl } from '../lib/api';
import PageShell from './ui/PageShell';
import Widget from './ui/Widget';
import Button from './ui/Button';
import Badge from './ui/Badge';
import FilterBar from './ui/FilterBar';
import EmptyState from './ui/EmptyState';
import Markdown from './ui/Markdown';
import DataTable, { Column } from './ui/DataTable';

interface CallLogsViewProps {
  callLogs: CallLog[];
  costPerMinuteInr?: number;
  leads?: Lead[];
}

const SENTIMENT_COLOR: Record<string, 'green' | 'rose' | 'slate'> = {
  Positive: 'green',
  Negative: 'rose',
  Neutral: 'slate',
  Unknown: 'slate',
};

function formatCallOutcome(c: CallLog): { label: string; color: 'green' | 'amber' | 'rose' | 'blue' | 'slate' } {
  switch (c.conversationOutcome) {
    case 'callback_scheduled': return { label: 'Callback Scheduled', color: 'blue' };
    case 'callback_and_enquiry': return { label: 'Callback + Enquiry', color: 'blue' };
    case 'enquiry': return { label: 'Enquiry', color: 'amber' };
    case 'busy': return { label: 'Busy', color: 'slate' };
    case 'no_answer': return { label: 'No Answer', color: 'rose' };
    case 'answering_machine': return { label: 'Answering Machine', color: 'rose' };
    default: return { label: c.status, color: c.status === 'Completed' ? 'green' : 'slate' };
  }
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// All exportable fields
const EXPORT_FIELDS = [
  { key: 'name',      label: 'Caller Name' },
  { key: 'phone',     label: 'Phone Number' },
  { key: 'direction', label: 'Direction' },
  { key: 'duration',  label: 'Duration (s)' },
  { key: 'cost',      label: 'Cost (INR)' },
  { key: 'status',    label: 'Status' },
  { key: 'sentiment', label: 'Sentiment' },
  { key: 'intent',    label: 'Intent' },
  { key: 'summary',   label: 'Summary' },
  { key: 'answers',   label: 'Q&A Answers' },
  { key: 'date',      label: 'Date & Time' },
];

function exportCSV(
  filename: string,
  fields: string[],
  rows: CallLog[],
  resolveName: (c: CallLog) => string,
  costPerMinute: number,
) {
  const headers = EXPORT_FIELDS.filter(f => fields.includes(f.key)).map(f => f.label);
  const data = rows.map(c => {
    const answers = (c as any).answers as Record<string, string> | undefined;
    const answersStr = answers
      ? Object.entries(answers).map(([q, a]) => `${q}: ${a}`).join(' | ')
      : '';
    return EXPORT_FIELDS
      .filter(f => fields.includes(f.key))
      .map(f => {
        switch (f.key) {
          case 'name':      return resolveName(c);
          case 'phone':     return c.callerNumber || '';
          case 'direction': return c.direction ?? 'unknown';
          case 'duration':  return String(c.duration ?? 0);
          case 'cost':      return callCostInr(c.duration, costPerMinute).toFixed(2);
          case 'status':    return c.status;
          case 'sentiment': return c.sentiment;
          case 'intent':    return c.intent;
          case 'summary':   return c.summary;
          case 'answers':   return answersStr;
          case 'date':      return new Date(c.createdAt).toLocaleString();
          default:          return '';
        }
      });
  });

  const csv = [headers, ...data]
    .map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function CallLogsView({ callLogs, costPerMinuteInr, leads = [] }: CallLogsViewProps) {
  const [searchTerm, setSearchTerm]   = useState('');
  const [selected, setSelected]       = useState<CallLog | null>(null);
  const [fromDate, setFromDate]       = useState('');
  const [toDate, setToDate]           = useState('');
  const [showExport, setShowExport]   = useState(false);
  const [exportFields, setExportFields] = useState<string[]>(EXPORT_FIELDS.map(f => f.key));

  function resolveCallerName(c: CallLog): string {
    if (c.leadName && c.leadName !== 'Unknown') return c.leadName;
    const match = leads.find(l => normalizePhone(l.phone) === c.callerNumber);
    if (match) return match.name;
    return formatPhone(c.callerNumber) || c.callerNumber || 'Unknown';
  }

  const filtered = callLogs.filter(c => {
    const displayName = resolveCallerName(c);
    const matchesSearch = !searchTerm.trim() ||
      displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.summary.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    const created = new Date(c.createdAt);
    if (fromDate && created < new Date(fromDate + 'T00:00:00')) return false;
    if (toDate && created > new Date(toDate + 'T23:59:59')) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const totalDuration = filtered.reduce((sum, c) => sum + (c.duration || 0), 0);
  const totalCost = filtered.reduce((sum, c) => sum + callCostInr(c.duration || 0, costPerMinuteInr), 0);

  const selectedAnswers = selected ? (selected as any).answers as Record<string, string> | undefined : undefined;

  const [selectedEnquiries, setSelectedEnquiries] = useState<{ id: string; queryText: string; status: 'new' | 'contacted' | 'resolved' }[]>([]);
  const [loadingSelectedEnquiries, setLoadingSelectedEnquiries] = useState(false);
  useEffect(() => {
    if (!selected) {
      setSelectedEnquiries([]);
      return;
    }
    let cancelled = false;
    setLoadingSelectedEnquiries(true);
    apiFetch(`/api/enquiries?callId=${encodeURIComponent(selected.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((result: { rows: { id: string; queryText: string; status: 'new' | 'contacted' | 'resolved' }[] } | null) => {
        if (!cancelled) setSelectedEnquiries(Array.isArray(result?.rows) ? result.rows : []);
      })
      .catch(() => { if (!cancelled) setSelectedEnquiries([]); })
      .finally(() => { if (!cancelled) setLoadingSelectedEnquiries(false); });
    return () => { cancelled = true; };
  }, [selected]);

  const hasActiveFilters = Boolean(searchTerm.trim() || fromDate || toDate);
  const clearFilters = () => { setSearchTerm(''); setFromDate(''); setToDate(''); };

  function toggleField(key: string) {
    setExportFields(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  return (
    <PageShell
      title="Call Logs"
      subtitle="Every real inbound and outbound call — transcript, recording, and sentiment."
      action={
        <div className="relative">
          <Button icon={Download} variant="secondary" size="sm" onClick={() => setShowExport(v => !v)}>
            Export CSV <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
          {showExport && (
            <div className="absolute right-0 mt-2 w-64 rounded-xl shadow-xl border z-50 p-3 space-y-1"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Select fields to export</p>
              {EXPORT_FIELDS.map(f => (
                <label key={f.key} className="flex items-center gap-2 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-[var(--bg-subtle)]">
                  <div
                    className={`h-4 w-4 rounded flex items-center justify-center shrink-0 border transition-colors ${exportFields.includes(f.key) ? 'bg-blue-600 border-blue-600' : 'border-[var(--border)]'}`}
                    onClick={() => toggleField(f.key)}
                  >
                    {exportFields.includes(f.key) && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{f.label}</span>
                </label>
              ))}
              <div className="flex gap-2 mt-3 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <button className="text-xs underline" style={{ color: 'var(--text-muted)' }}
                  onClick={() => setExportFields(EXPORT_FIELDS.map(f => f.key))}>All</button>
                <button className="text-xs underline" style={{ color: 'var(--text-muted)' }}
                  onClick={() => setExportFields([])}>None</button>
                <Button size="sm" className="ml-auto" onClick={() => {
                  exportCSV('call_logs.csv', exportFields, sorted, resolveCallerName, costPerMinuteInr ?? 0);
                  setShowExport(false);
                }}>
                  Download
                </Button>
              </div>
            </div>
          )}
        </div>
      }
      layout="fill"
    >
      <div className="flex-1 flex flex-col overflow-hidden px-8 pb-8 pt-6">
        <Widget className="flex-1 min-h-0" bodyClassName="flex flex-col min-h-0 overflow-hidden" showHeader={false} padding="none">
          <div className="border-b border-[var(--border)] bg-[var(--bg-surface)] p-4 shrink-0">
            <FilterBar
              search={{ value: searchTerm, onChange: setSearchTerm, placeholder: 'Search by caller or summary…' }}
              dates={[
                { key: 'from', label: 'From', value: fromDate, onChange: setFromDate },
                { key: 'to', label: 'To', value: toDate, onChange: setToDate },
              ]}
              onClear={clearFilters}
              hasActiveFilters={hasActiveFilters}
              resultCount={{ filtered: filtered.length, total: callLogs.length, label: 'calls' }}
              actions={
                <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <span><strong className="text-[var(--text-primary)]">{formatDuration(totalDuration)}</strong> duration</span>
                  <span className="h-4 w-px bg-[var(--border)]" />
                  <span><strong className="text-[var(--text-primary)]">{formatInr(totalCost)}</strong> cost</span>
                </div>
              }
            />
          </div>

          {(() => {
            const columns: Column<CallLog>[] = [
              {
                key: 'caller',
                header: 'Caller',
                cell: (c) => (
                  <>
                    <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{resolveCallerName(c)}</div>
                    {c.direction && <div className="text-[10px] font-normal mt-0.5" style={{ color: 'var(--text-muted)' }}>{c.direction}</div>}
                  </>
                ),
              },
              { key: 'duration', header: 'Duration', cell: (c) => <span className="font-mono">{formatDuration(c.duration)}</span> },
              { key: 'cost', header: 'Cost', cell: (c) => <span className="font-mono">{formatInr(callCostInr(c.duration, costPerMinuteInr))}</span> },
              { key: 'status', header: 'Status', cell: (c) => { const outcome = formatCallOutcome(c); return <Badge color={outcome.color}>{outcome.label}</Badge>; } },
              { key: 'sentiment', header: 'Sentiment', cell: (c) => <Badge color={SENTIMENT_COLOR[c.sentiment] ?? 'slate'}>{c.sentiment}</Badge> },
              { key: 'when', header: 'When', cell: (c) => <span style={{ color: 'var(--text-muted)' }}>{new Date(c.createdAt).toLocaleString()}</span> },
              { key: 'actions', header: 'Actions', align: 'right', cell: (c) => <Button variant="secondary" size="xs" icon={Eye} onClick={() => setSelected(c)} className="ml-auto">View</Button> },
            ];
            return sorted.length === 0 ? (
              <EmptyState heading={searchTerm ? 'No calls match your search' : 'No calls yet'} message="Real inbound and outbound calls will appear here automatically." />
            ) : (
              <DataTable bare resizable paginated defaultPageSize={25} className="flex-1 min-h-0" columns={columns} rows={sorted} rowKey={(c) => c.id} />
            );
          })()}
        </Widget>
      </div>
      {/* Detail modal */}
      {selected && (
        <SlideOver
          open
          onClose={() => setSelected(null)}
          title={resolveCallerName(selected)}
          subtitle={`${new Date(selected.createdAt).toLocaleString()} · ${formatDuration(selected.duration)} · ${formatInr(callCostInr(selected.duration, costPerMinuteInr))} · ${selected.direction ?? 'unknown'}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-5">

            {/* Recording */}
            {selected.recordingUrl && (
              <div className="rounded-xl p-3 flex items-center gap-3 border" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
                <PlayCircle className="h-5 w-5 text-blue-600 shrink-0" />
                <audio controls src={getPlayableRecordingUrl(selected.id, selected.recordingUrl)} className="w-full h-8" />
              </div>
            )}

            {/* Meta row */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: 'Status',    value: selected.status },
                { label: 'Outcome',   value: formatCallOutcome(selected).label },
                { label: 'Callback',  value: selected.callbackStatus === 'scheduled' && selected.callbackTime
                    ? new Date(selected.callbackTime).toLocaleString()
                    : 'None' },
                { label: 'Enquiry',   value: selected.enquiryStatus === 'open' ? 'Open' : 'None' },
                { label: 'Sentiment', value: selected.sentiment },
                { label: 'Intent',    value: selected.intent },
              ].map(item => (
                <div key={item.label} className="rounded-xl p-3 border" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>{item.label}</p>
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{item.value}</p>
                </div>
              ))}
            </div>

            {/* Enquiry raised during this call, if any */}
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Enquiry</h4>
              {loadingSelectedEnquiries ? (
                <div className="rounded-xl p-3 border text-[11px] flex items-center gap-2" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Checking for enquiries…
                </div>
              ) : selectedEnquiries.length > 0 ? (
                <div className="rounded-xl p-3 border bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 space-y-2">
                  {selectedEnquiries.map((eq) => (
                    <div key={eq.id} className="flex items-start justify-between gap-3 bg-white/70 dark:bg-black/20 border border-amber-100 dark:border-amber-500/20 rounded-lg px-3 py-2">
                      <p className="text-xs flex-1 leading-relaxed" style={{ color: 'var(--text-primary)' }}>"{eq.queryText}"</p>
                      <span
                        className={`shrink-0 text-[9px] font-mono uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                          eq.status === 'new'
                            ? 'bg-amber-200 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300'
                            : eq.status === 'contacted'
                            ? 'bg-blue-200 dark:bg-blue-500/20 text-blue-800 dark:text-blue-300'
                            : 'bg-emerald-200 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                        }`}
                      >
                        {eq.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl p-3 border text-[11px] flex items-center gap-2" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                  <MessageCircleQuestion className="h-3.5 w-3.5" /> No enquiry raised on this call.
                </div>
              )}
            </div>

            {/* AI Summary */}
            {selected.summary && (
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>AI Summary</h4>
                <div className="rounded-xl p-3 border" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
                  <Markdown>{selected.summary}</Markdown>
                </div>
              </div>
            )}

            {/* Q&A Answers */}
            {selectedAnswers && Object.keys(selectedAnswers).length > 0 && (
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Workflow Answers</h4>
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)' }}>
                        <th className="px-4 py-2 text-left font-bold text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Question</th>
                        <th className="px-4 py-2 text-left font-bold text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Answer</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                      {Object.entries(selectedAnswers).map(([q, a]) => {
                        // Defensive: `a` should always be a plain string
                        // (see callFinalizer.js's answers map), but a raw
                        // {label, question, answer} object slipping through
                        // here would otherwise crash the whole page with
                        // React error #31 (objects aren't valid children)
                        // instead of just showing this one row oddly.
                        const display = typeof a === 'string' ? a : (a && typeof a === 'object' ? (a as any).answer ?? '' : String(a ?? ''));
                        return (
                          <tr key={q} className="hover:bg-[var(--bg-subtle)]">
                            <td className="px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>{q}</td>
                            <td className="px-4 py-2.5 font-semibold" style={{ color: 'var(--text-primary)' }}>{display || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Transcript */}
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Transcript</h4>
              {selected.transcript.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No transcript captured for this call.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {selected.transcript.map((line, i) => (
                    <div key={i} className={`flex flex-col ${line.speaker === 'AI' ? 'items-start' : 'items-end'}`}>
                      <span className="text-[9px] font-mono mb-0.5" style={{ color: 'var(--text-muted)' }}>{line.speaker} · {line.timestamp}</span>
                      <div
                        className="rounded-xl px-3 py-2 text-xs max-w-[85%]"
                        style={line.speaker === 'AI'
                          ? { background: '#eff6ff', color: '#1e3a5f' }
                          : { background: 'var(--bg-subtle)', color: 'var(--text-primary)' }
                        }
                      >
                        {line.text}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Export this call */}
            <div className="pt-2 border-t flex justify-end" style={{ borderColor: 'var(--border)' }}>
              <Button icon={Download} variant="secondary" size="sm" onClick={() => {
                exportCSV(
                  `call_${selected.id}.csv`,
                  EXPORT_FIELDS.map(f => f.key),
                  [selected],
                  resolveCallerName,
                  costPerMinuteInr ?? 0,
                );
              }}>
                Export this call
              </Button>
            </div>

          </div>
        </SlideOver>
      )}
    </PageShell>
  );
}
