import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api';
import { PhoneOutgoing, PhoneIncoming, Clock, DollarSign, Activity, UserCheck, MessageCircleQuestion, BarChart3, Users, PieChart as PieChartIcon, FileText } from 'lucide-react';
import { XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area, Legend } from 'recharts';
import PageShell from './ui/PageShell';
import BreadcrumbTitle from './ui/BreadcrumbTitle';
import Button from './ui/Button';
import Widget from './ui/Widget';
import PieChart from './ui/PieChart';
import KpiCard from './ui/KpiCard';
import EmptyState from './ui/EmptyState';
import { CallLog } from '../types';
import { callCostInr, formatInr, COST_PER_MINUTE_INR_FALLBACK } from '../lib/pricing';
import PrintableReport from './PrintableReport';
import FilterBar from './ui/FilterBar';
import DataTable, { Column } from './ui/DataTable';

const CHART_TOOLTIP = {
  contentStyle: {
    background: 'var(--tooltip-bg, #1e293b)',
    border: 'none',
    borderRadius: 10,
    color: 'var(--tooltip-text, #f8fafc)',
    fontSize: 12,
  },
};

type Granularity = 'day' | 'month' | 'year';
type DirectionFilter = 'all' | 'inbound' | 'outbound';


interface DialTaskCallResult {
  status: 'Pending' | 'Calling' | 'Completed' | 'No Answer' | 'Skipped' | 'Callback Scheduled';
  duration: number;
  sentiment: 'Positive' | 'Neutral' | 'Negative' | 'Unknown';
  intent: 'Interested' | 'Not Interested' | 'Callback Scheduled' | 'Wrong Number' | 'Unknown';
  summary: string;
  recordingUrl?: string;
  // The real call_logs id, matching lead_responses.call_id one-to-one —
  // lets the Q&A lookup target this exact call instead of guessing by
  // phone (which returns every answer that number ever gave, across every
  // call/task). Absent on data captured before this field existed.
  callId?: string;
  callbackTime?: string;
  // True only when the callee actually engaged — see callFinalizer.js.
  callAnswered?: boolean;
  conversationOutcome?: string;
}

interface DialTask {
  id: string;
  name: string;
  workflowId?: string;
  workflowRunMetadata?: {
    workflowId: string;
    workflowName?: string | null;
    runAt: string;
    runDate?: string;
    runTime?: string;
    timezone?: string;
  };
  leadIds: string[];
  status: string;
  createdAt: string;
  callResults: Record<string, DialTaskCallResult>;
}

interface ReportsViewProps {
  callLogs: CallLog[];
  dialerTasks: DialTask[];
  leads: { id: string; name: string; phone: string }[];
  costPerMinuteInr?: number;
  orgName?: string;
  // Drives Leads by Source vs. "<object> by Stage" below — same isLending
  // switch Executive Desk used before this widget moved here.
  industry?: string;
}

// Moved here from the Executive Desk — same /api/dashboard/metrics
// response, just this one field.
interface ObjectMetrics {
  objectKey: string;
  objectLabel: string;
  totalRecords: number;
  stageDistribution: { stage: string; count: number }[];
  recordsTrend: { month: string; count: number }[];
}


// One readable label for a call's actual connectivity outcome — folds
// status and callAnswered together, since "Completed" alone doesn't say
// whether the callee actually engaged (see callFinalizer.js's
// callAnswered heuristic) vs. picked up, said nothing/one word, and hung
// up. Used for Success Rate and Inbound vs Outbound below.
function getCallOutcome(status: string, callAnswered?: boolean, conversationOutcome?: CallLog['conversationOutcome']): string {
  switch (conversationOutcome) {
    case 'callback_scheduled': return 'Callback Scheduled';
    case 'callback_and_enquiry': return 'Callback + Enquiry';
    case 'enquiry': return 'Enquiry';
    case 'busy': return 'Busy';
    case 'no_answer': return 'No Answer';
    case 'answering_machine': return 'Answering Machine';
    default:
      if (status === 'Completed') return callAnswered === false ? 'Not Answered' : 'Answered';
      return status;
  }
}

// ── Business-level Call Outcome vs. Call Status ─────────────────────────
// Kept deliberately separate: CALL STATUS (getCallOutcome above) is about
// connectivity — did the phone call itself connect and get engaged with.
// CALL OUTCOME is the business result of the conversation — what call_logs
// (and a dialer task's per-lead callResults) already store as `intent`.
// "Successful outcome" isn't hard-coded to a fixed list of industry labels
// (the backend has no per-org configurable-outcomes model yet — a real
// gap, not something to fake with mock data) — the one real, existing
// signal for "this call achieved a positive business result" is
// intent === 'Interested', already the convention Executive Desk and
// Campaign use for the same concept ("Successful Outcomes" KPI,
// topInterestedClients). Outcome Analysis below is still dynamic in the
// sense that it plots whatever intent values actually appear in the data,
// not a hard-coded slice list.
function isSuccessfulOutcome(intent?: string | null): boolean {
  return intent === 'Interested';
}

const INTENT_COLOR: Record<string, string> = {
  'Interested': '#059669',
  'Not Interested': '#e11d48',
  'Callback Scheduled': '#2563eb',
  'Wrong Number': '#d97706',
  'Unknown': '#94a3b8',
};
function intentColor(intent: string): string {
  return INTENT_COLOR[intent] || '#7c3aed';
}

// Matches EnquiriesView.tsx's own STATUS_COLOR chip mapping (Badge colors
// there translate to these same hues here for the donut).
const ENQUIRY_STATUS_COLOR: Record<string, string> = {
  'new': '#d97706',
  'contacted': '#2563eb',
  'resolved': '#059669',
};
function enquiryStatusColor(status: string): string {
  return ENQUIRY_STATUS_COLOR[status] || '#94a3b8';
}
function enquiryStatusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// ↑/↓ trend chip for a KPI card — compares this period's value against
// the immediately preceding period of the same length. No previous-period
// data (e.g. a brand-new org) reads as "—", not a misleading 0%/∞% swing.
function trendBadge(current: number, previous: number): { label: string; color: 'green' | 'rose' | 'neutral' } {
  if (previous <= 0) return current > 0 ? { label: 'New', color: 'green' } : { label: '—', color: 'neutral' };
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { label: '0%', color: 'neutral' };
  return pct > 0 ? { label: `↑ ${pct}%`, color: 'green' } : { label: `↓ ${Math.abs(pct)}%`, color: 'rose' };
}

const DURATION_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: '0-30s', min: 0, max: 30 },
  { label: '30-60s', min: 30, max: 60 },
  { label: '1-2m', min: 60, max: 120 },
  { label: '2-5m', min: 120, max: 300 },
  { label: '5-10m', min: 300, max: 600 },
  { label: '10m+', min: 600, max: Infinity },
];

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function ReportsView({ callLogs, dialerTasks, leads, costPerMinuteInr = COST_PER_MINUTE_INR_FALLBACK, orgName = 'ChiefVoice', industry }: ReportsViewProps) {
  const isLending = !industry || industry === 'lending';
  const [direction, setDirection] = useState<DirectionFilter>('all');
  const [granularity] = useState<Granularity>('day');
  const [fromDate, setFromDate] = useState(daysAgo(30));
  const [toDate, setToDate] = useState(daysAgo(0));

  // Leads by Source — moved here from Executive Desk; same
  // /api/dashboard/metrics call that page used to make.
  const [channelPerformance, setChannelPerformance] = useState<{ source: string; count: number }[]>([]);
  const [primaryObject, setPrimaryObject] = useState<ObjectMetrics | null>(null);
  useEffect(() => {
    apiFetch('/api/dashboard/metrics')
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: { channelPerformance?: { source: string; count: number }[]; objectMetrics?: ObjectMetrics[] }) => {
        setChannelPerformance(data.channelPerformance ?? []);
        setPrimaryObject(data.objectMetrics?.[0] ?? null);
      })
      .catch(err => console.error('Failed to load dashboard metrics:', err));
  }, []);

  // Groups tasks by their own name (dialer_tasks.name — NOT a
  // "workflowName" field, which never existed on the real row; see
  // db.getScheduledCallbacks' identical bug), so repeated runs of the same
  // campaign ("Loan Follow-up — Week 1", "...— Week 2") sit together in
  // the dropdown instead of being an undifferentiated flat list. A task
  // with no name falls back into "Other Tasks". Groups are ordered by
  // their own most-recently-created task, and tasks within a group
  // newest-first.
  const taskGroups = useMemo(() => {
    const byWorkflow = new Map<string, DialTask[]>();
    for (const t of dialerTasks) {
      const key = t.name || 'Other Tasks';
      if (!byWorkflow.has(key)) byWorkflow.set(key, []);
      byWorkflow.get(key)!.push(t);
    }
    const groups = Array.from(byWorkflow.entries()).map(([label, tasks]) => ({
      label,
      tasks: [...tasks].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    }));
    groups.sort((a, b) => new Date(b.tasks[0].createdAt).getTime() - new Date(a.tasks[0].createdAt).getTime());
    return groups;
  }, [dialerTasks]);
  const [showPreview, setShowPreview] = useState(false);

  // ── Campaign Details table (bottom, full width) ─────────────────────────
  // Every dialer task is one campaign run — sorted newest first so the
  // dropdown defaults to whatever's most likely being checked right now.
  const campaignOptions = useMemo(
    () => [...dialerTasks].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [dialerTasks]
  );
  const [campaignDetailTaskId, setCampaignDetailTaskId] = useState<string>('');
  useEffect(() => {
    // Keep the selection valid as the task list loads/changes; default to
    // the most recent campaign rather than leaving the dropdown empty.
    if (campaignOptions.length === 0) { setCampaignDetailTaskId(''); return; }
    if (!campaignOptions.some(t => t.id === campaignDetailTaskId)) {
      setCampaignDetailTaskId(campaignOptions[0].id);
    }
  }, [campaignOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  const campaignDetailTask = campaignOptions.find(t => t.id === campaignDetailTaskId) || null;

  interface CampaignDetailRow {
    leadId: string;
    leadName: string;
    phone: string;
    status: string;
    sentiment: string;
    answers: Record<string, string>;
  }
  const [campaignDetailRows, setCampaignDetailRows] = useState<CampaignDetailRow[]>([]);
  const [campaignDetailColumns, setCampaignDetailColumns] = useState<string[]>([]);
  const [campaignDetailLoading, setCampaignDetailLoading] = useState(false);

  useEffect(() => {
    if (!campaignDetailTask) { setCampaignDetailRows([]); setCampaignDetailColumns([]); return; }
    let cancelled = false;
    setCampaignDetailLoading(true);

    const leadEntries = Object.entries(campaignDetailTask.callResults)
      .filter(([, r]) => r.callId);

    Promise.all(leadEntries.map(async ([leadId, result]) => {
      const lead = leads.find(l => l.id === leadId);
      let answers: Record<string, string> = {};
      try {
        const res = await apiFetch(`/api/calls/${encodeURIComponent(result.callId!)}/lead-responses`);
        if (res.ok) {
          const rows: { label?: string; question: string; answer: string }[] = await res.json();
          for (const row of rows) {
            if (row.answer) answers[row.label || row.question] = row.answer;
          }
        }
      } catch { /* leave answers empty for this lead */ }
      const row: CampaignDetailRow = {
        leadId,
        leadName: lead?.name || 'Unknown',
        phone: lead?.phone || '—',
        status: result.conversationOutcome === 'callback_scheduled' ? 'Callback Scheduled'
          : result.conversationOutcome === 'callback_and_enquiry' ? 'Callback + Enquiry'
          : result.conversationOutcome === 'enquiry' ? 'Enquiry'
          : result.conversationOutcome === 'busy' ? 'Busy'
          : result.conversationOutcome === 'no_answer' ? 'No Answer'
          : result.conversationOutcome === 'answering_machine' ? 'Answering Machine'
          : result.status,
        sentiment: result.sentiment,
        answers,
      };
      return row;
    })).then((rows) => {
      if (cancelled) return;
      // Column set is the union of every label actually extracted for
      // THIS campaign, in first-seen order — so switching campaigns
      // naturally changes the column count/labels to match whatever that
      // workflow's variables were, with no separate workflow lookup needed.
      const columns: string[] = [];
      const seen = new Set<string>();
      for (const row of rows) {
        for (const label of Object.keys(row.answers)) {
          if (!seen.has(label)) { seen.add(label); columns.push(label); }
        }
      }
      setCampaignDetailRows(rows);
      setCampaignDetailColumns(columns);
      setCampaignDetailLoading(false);
    }).catch(() => {
      if (!cancelled) { setCampaignDetailRows([]); setCampaignDetailColumns([]); setCampaignDetailLoading(false); }
    });

    return () => { cancelled = true; };
  }, [campaignDetailTask, leads]);

  const inRange = (iso: string, from: string, to: string) => {
    const d = new Date(iso);
    return d >= new Date(from + 'T00:00:00') && d <= new Date(to + 'T23:59:59');
  };

  const filteredCalls = useMemo(() => {
    return callLogs.filter((c) => {
      if (!inRange(c.createdAt, fromDate, toDate)) return false;
      if (direction !== 'all' && c.direction !== direction) return false;
      return true;
    });
  }, [callLogs, fromDate, toDate, direction]);

  // Immediately preceding period of the same length — e.g. "last 7 days"
  // compares against the 7 days before that. Powers the ↑/↓ trend chip on
  // every KPI card below.
  const [prevFromDate, prevToDate] = useMemo(() => {
    const from = new Date(fromDate + 'T00:00:00');
    const to = new Date(toDate + 'T23:59:59');
    const spanMs = to.getTime() - from.getTime();
    const prevTo = new Date(from.getTime() - 24 * 60 * 60 * 1000);
    const prevFrom = new Date(prevTo.getTime() - spanMs);
    return [prevFrom.toISOString().slice(0, 10), prevTo.toISOString().slice(0, 10)];
  }, [fromDate, toDate]);

  const prevFilteredCalls = useMemo(() => {
    return callLogs.filter((c) => {
      if (!inRange(c.createdAt, prevFromDate, prevToDate)) return false;
      if (direction !== 'all' && c.direction !== direction) return false;
      return true;
    });
  }, [callLogs, prevFromDate, prevToDate, direction]);

  function summarize(calls: CallLog[]) {
    const totalCalls = calls.length;
    const totalTalkTime = calls.reduce((sum, c) => sum + (c.duration || 0), 0);
    const avgCallDuration = totalCalls > 0 ? Math.round(totalTalkTime / totalCalls) : 0;
    const successCalls = calls.filter(c => c.status === 'Completed' && c.callAnswered !== false).length;
    const successRate = totalCalls > 0 ? Math.round((successCalls / totalCalls) * 100) : 0;
    const totalCost = calls.reduce((sum, c) => sum + callCostInr(c.duration || 0, costPerMinuteInr), 0);
    return { totalCalls, totalTalkTime, avgCallDuration, successRate, totalCost };
  }

  // Page-wide summary KPIs — scoped to the same From/To/Direction filters
  // as filteredCalls above, NOT to whichever task is selected further down
  // (that row stays task-scoped, for "how did this one run do").
  const periodSummary = useMemo(() => summarize(filteredCalls), [filteredCalls]);
  const prevPeriodSummary = useMemo(() => summarize(prevFilteredCalls), [prevFilteredCalls]);

  // Enquiries — fetched once (a generous page size, not the whole table)
  // with their real createdAt/callId so both the KPI and the Inquiry
  // Analysis widget can filter/bucket by the same global date range
  // client-side, the same way filteredCalls does for calls. The backend
  // doesn't support filtering this collection by date server-side yet.
  const [allEnquiries, setAllEnquiries] = useState<{ id: string; callId: string | null; queryText: string; status: string; createdAt: string }[]>([]);
  useEffect(() => {
    apiFetch('/api/enquiries?page=1&limit=1000')
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: { rows?: typeof allEnquiries }) => setAllEnquiries(data.rows ?? []))
      .catch(err => console.error('Failed to load enquiries:', err));
  }, []);
  const filteredEnquiries = useMemo(() => allEnquiries.filter(e => inRange(e.createdAt, fromDate, toDate)), [allEnquiries, fromDate, toDate]);
  const prevFilteredEnquiries = useMemo(() => allEnquiries.filter(e => inRange(e.createdAt, prevFromDate, prevToDate)), [allEnquiries, prevFromDate, prevToDate]);

  // Agent id -> name, for Agent Performance (dialerTasks only carries the
  // agent's id).
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});
  useEffect(() => {
    apiFetch('/api/agents')
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: { id: string; name: string }[]) => setAgentNames(Object.fromEntries((Array.isArray(data) ? data : []).map(a => [a.id, a.name]))))
      .catch(err => console.error('Failed to load agents:', err));
  }, []);

  // Tasks whose run falls inside the selected period — drives Success Rate
  // by Campaign, Agent Performance, and the campaign/agent filters on
  // Inbound vs Outbound below, so those widgets also respect the global
  // date filter (a callResult entry has no createdAt of its own, so a
  // task's own createdAt is the closest available date to filter by).
  const tasksInPeriod = useMemo(() => (dialerTasks as DialTask[]).filter(t => inRange(t.createdAt, fromDate, toDate)), [dialerTasks, fromDate, toDate]);

  // callId -> {workflowName, agentId} — lets any call_logs-derived widget
  // (Inbound vs Outbound's campaign/agent filters, Inquiry Analysis's
  // campaign/agent breakdown) join back to the campaign/agent that placed
  // it, since call_logs itself doesn't carry either.
  const callTaskIndex = useMemo(() => {
    const idx = new Map<string, { workflowName: string; agentId: string | null }>();
    for (const task of tasksInPeriod) {
      for (const result of Object.values(task.callResults || {})) {
        if (result.callId) idx.set(result.callId, { workflowName: task.name || 'Other', agentId: (task as any).assignedTeamMemberId || null });
      }
    }
    return idx;
  }, [tasksInPeriod]);

  // Duration buckets — Widget 2: Call Duration Distribution.
  const durationDistribution = useMemo(() => {
    return DURATION_BUCKETS.map(b => ({
      bucket: b.label,
      count: filteredCalls.filter(c => (c.duration || 0) >= b.min && (c.duration || 0) < b.max).length,
    }));
  }, [filteredCalls]);

  // Widget 4: Outcome Analysis — dynamic donut over whatever intent
  // values actually appear in this period's calls.
  const outcomeAnalysis = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of filteredCalls) {
      const intent = c.intent || 'Unknown';
      counts[intent] = (counts[intent] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([label, value]) => ({ label, value, color: intentColor(label) }))
      .sort((a, b) => b.value - a.value);
  }, [filteredCalls]);

  // Widget 3: Success Rate by Campaign — business-outcome success
  // (intent === 'Interested'), not the connectivity-level "Answered" used
  // for Call Status elsewhere. Sortable by success rate (asc/desc).
  const [campaignSortAsc, setCampaignSortAsc] = useState(false);
  const campaignSuccessRate = useMemo(() => {
    const byWorkflow: Record<string, { total: number; successful: number }> = {};
    for (const task of tasksInPeriod) {
      const name = task.name || 'Other';
      if (!byWorkflow[name]) byWorkflow[name] = { total: 0, successful: 0 };
      for (const result of Object.values(task.callResults || {})) {
        if (!result?.status || result.status === 'Pending') continue;
        byWorkflow[name].total++;
        if (isSuccessfulOutcome(result.intent)) byWorkflow[name].successful++;
      }
    }
    const rows = Object.entries(byWorkflow).map(([campaign, { total, successful }]) => ({
      campaign, total, successful, rate: total > 0 ? Math.round((successful / total) * 100) : 0,
    }));
    rows.sort((a, b) => campaignSortAsc ? a.rate - b.rate : b.rate - a.rate);
    return rows.slice(0, 10);
  }, [tasksInPeriod, campaignSortAsc]);

  // Widget 5: Agent Performance — selectable metric, computed once per
  // agent so switching the dropdown is instant (no re-fetch).
  type AgentMetricKey = 'totalCalls' | 'answeredCalls' | 'inquiries' | 'successfulOutcomes' | 'successRate' | 'avgDuration';
  const [agentMetric, setAgentMetric] = useState<AgentMetricKey>('totalCalls');
  const agentPerformance = useMemo(() => {
    const byAgent: Record<string, { totalCalls: number; answeredCalls: number; successfulOutcomes: number; totalDuration: number }> = {};
    for (const task of tasksInPeriod) {
      const agentId = (task as any).assignedTeamMemberId || 'unassigned';
      for (const result of Object.values(task.callResults || {})) {
        if (!result?.status || result.status === 'Pending') continue;
        if (!byAgent[agentId]) byAgent[agentId] = { totalCalls: 0, answeredCalls: 0, successfulOutcomes: 0, totalDuration: 0 };
        byAgent[agentId].totalCalls++;
        byAgent[agentId].totalDuration += result.duration || 0;
        if (getCallOutcome(result.status, result.callAnswered) === 'Answered') byAgent[agentId].answeredCalls++;
        if (isSuccessfulOutcome(result.intent)) byAgent[agentId].successfulOutcomes++;
      }
    }
    // Inquiries per agent — joined via callTaskIndex (enquiry -> callId -> task -> agent).
    const inquiriesByAgent: Record<string, number> = {};
    for (const e of filteredEnquiries) {
      const agentId = (e.callId && callTaskIndex.get(e.callId)?.agentId) || 'unassigned';
      inquiriesByAgent[agentId] = (inquiriesByAgent[agentId] || 0) + 1;
    }
    const agentIds = new Set([...Object.keys(byAgent), ...Object.keys(inquiriesByAgent)]);
    const rows = Array.from(agentIds).map(agentId => {
      const stats = byAgent[agentId] || { totalCalls: 0, answeredCalls: 0, successfulOutcomes: 0, totalDuration: 0 };
      return {
        agent: agentId === 'unassigned' ? 'Unassigned' : (agentNames[agentId] || 'Unknown Agent'),
        totalCalls: stats.totalCalls,
        answeredCalls: stats.answeredCalls,
        inquiries: inquiriesByAgent[agentId] || 0,
        successfulOutcomes: stats.successfulOutcomes,
        successRate: stats.totalCalls > 0 ? Math.round((stats.successfulOutcomes / stats.totalCalls) * 100) : 0,
        avgDuration: stats.totalCalls > 0 ? Math.round(stats.totalDuration / stats.totalCalls) : 0,
      };
    });
    rows.sort((a, b) => (b[agentMetric] as number) - (a[agentMetric] as number));
    return rows.slice(0, 10);
  }, [tasksInPeriod, agentNames, agentMetric, filteredEnquiries, callTaskIndex]);

  // Widget 6: Inbound vs Outbound Analysis — optional campaign/agent
  // filters on top of the global date range, joined via callTaskIndex.
  const [ioCampaignFilter, setIoCampaignFilter] = useState('all');
  const [ioAgentFilter, setIoAgentFilter] = useState('all');
  const inboundOutboundAnalysis = useMemo(() => {
    const scoped = filteredCalls.filter(c => {
      if (ioCampaignFilter === 'all' && ioAgentFilter === 'all') return true;
      const link = callTaskIndex.get(c.id);
      if (ioCampaignFilter !== 'all' && link?.workflowName !== ioCampaignFilter) return false;
      if (ioAgentFilter !== 'all' && (link?.agentId || 'unassigned') !== ioAgentFilter) return false;
      return true;
    });
    const bucket = (dir: 'inbound' | 'outbound') => {
      const calls = scoped.filter(c => c.direction === dir);
      const answered = calls.filter(c => getCallOutcome(c.status, c.callAnswered, c.conversationOutcome) === 'Answered').length;
      return { direction: dir === 'inbound' ? 'Inbound' : 'Outbound', total: calls.length, answered, notAnswered: calls.length - answered };
    };
    return [bucket('inbound'), bucket('outbound')];
  }, [filteredCalls, ioCampaignFilter, ioAgentFilter, callTaskIndex]);

  // Widget 7: Inquiry Analysis — daily counts over the period.
  const inquiryAnalysis = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (const e of filteredEnquiries) {
      const key = new Date(e.createdAt).toISOString().slice(0, 10);
      buckets[key] = (buckets[key] || 0) + 1;
    }
    return Object.entries(buckets).map(([period, count]) => ({ period, count })).sort((a, b) => a.period.localeCompare(b.period));
  }, [filteredEnquiries]);

  // Widget 7b: Enquiries by Status — new/contacted/resolved breakdown, so
  // it's visible whether the team is actually keeping up with enquiries
  // this period, not just how many came in (inquiryAnalysis above).
  const enquiriesByStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of filteredEnquiries) {
      const status = e.status || 'new';
      counts[status] = (counts[status] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([status, value]) => ({ label: enquiryStatusLabel(status), value, color: enquiryStatusColor(status) }))
      .sort((a, b) => b.value - a.value);
  }, [filteredEnquiries]);

  // Widget 1: Call Volume Over Time (daily, inbound/outbound) and
  // Widget 8: Call Outcomes Over Time (daily, by intent) — same daily
  // bucketing pass over filteredCalls, two different breakdowns.
  const callVolumeOverTime = useMemo(() => {
    const buckets: Record<string, { period: string; inbound: number; outbound: number }> = {};
    for (const c of filteredCalls) {
      const key = new Date(c.createdAt).toISOString().slice(0, 10);
      if (!buckets[key]) buckets[key] = { period: key, inbound: 0, outbound: 0 };
      if (c.direction === 'inbound') buckets[key].inbound++;
      else if (c.direction === 'outbound') buckets[key].outbound++;
    }
    return Object.values(buckets).sort((a, b) => a.period.localeCompare(b.period));
  }, [filteredCalls]);

  const outcomesOverTime = useMemo(() => {
    const buckets: Record<string, { period: string } & Record<string, number>> = {};
    const intentsSeen = new Set<string>();
    for (const c of filteredCalls) {
      const key = new Date(c.createdAt).toISOString().slice(0, 10);
      if (!buckets[key]) buckets[key] = { period: key } as { period: string } & Record<string, number>;
      const intent = c.intent || 'Unknown';
      intentsSeen.add(intent);
      buckets[key][intent] = (buckets[key][intent] || 0) + 1;
    }
    return { data: Object.values(buckets).sort((a, b) => a.period.localeCompare(b.period)), intents: Array.from(intentsSeen) };
  }, [filteredCalls]);

  // Widget 10: Cost Analysis — daily total cost, plus the two per-unit
  // metrics that can actually be derived from existing data (cost per
  // call, cost per successful outcome). No per-call AI/token or telephony
  // cost breakdown exists in call_logs, so those two metrics from the
  // spec are intentionally not shown here rather than invented.
  const costOverTime = useMemo(() => {
    const buckets: Record<string, { period: string; cost: number }> = {};
    for (const c of filteredCalls) {
      const key = new Date(c.createdAt).toISOString().slice(0, 10);
      if (!buckets[key]) buckets[key] = { period: key, cost: 0 };
      buckets[key].cost += callCostInr(c.duration || 0, costPerMinuteInr);
    }
    return Object.values(buckets).sort((a, b) => a.period.localeCompare(b.period));
  }, [filteredCalls, costPerMinuteInr]);
  const costPerCall = periodSummary.totalCalls > 0 ? periodSummary.totalCost / periodSummary.totalCalls : 0;
  const successfulOutcomesInPeriod = filteredCalls.filter(c => isSuccessfulOutcome(c.intent)).length;
  const costPerSuccessfulOutcome = successfulOutcomesInPeriod > 0 ? periodSummary.totalCost / successfulOutcomesInPeriod : 0;

  // Widget 11: Call Activity by Hour of Day — which hours actually see
  // call volume in this period, so staffing/dialer-window decisions have
  // real data behind them instead of a guess. Pairs with Cost Analysis
  // above to fill out the last widget row (previously left half-empty
  // with an odd widget count).
  const callsByHour = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, label: `${hour}:00`, count: 0 }));
    for (const c of filteredCalls) {
      buckets[new Date(c.createdAt).getHours()].count++;
    }
    return buckets;
  }, [filteredCalls]);
  const peakHour = useMemo(
    () => callsByHour.reduce((best, b) => (b.count > best.count ? b : best), callsByHour[0]),
    [callsByHour]
  );

  return (
    <PageShell
      title={<BreadcrumbTitle group="Dashboard" page="Reports" />}
      subtitle="Calls, campaigns, agents, and cost — for the selected date range."
      action={
        <Button icon={FileText} onClick={() => setShowPreview(true)}>
          Preview Report
        </Button>
      }
    >
        {/* ── Global date-range filter — everything below (KPIs and all 10
            widgets) is scoped to this one control. ── */}
        <Widget colSpan={12} showHeader={false} padding="md">
          <FilterBar
            dates={[
              { key: 'from', label: 'From', value: fromDate, onChange: setFromDate },
              { key: 'to', label: 'To', value: toDate, onChange: setToDate },
            ]}
            selects={[
              {
                key: 'direction',
                label: 'Direction',
                value: direction,
                onChange: (v) => setDirection(v as DirectionFilter),
                options: [
                  { label: 'All calls', value: 'all' },
                  { label: 'Incoming only', value: 'inbound' },
                  { label: 'Outgoing only', value: 'outbound' },
                ],
              },
            ]}
            actions={
              <>
                {[7, 30, 90].map((n) => (
                  <button
                    key={n}
                    onClick={() => { setFromDate(daysAgo(n)); setToDate(daysAgo(0)); }}
                    className="px-3 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors"
                    style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--border)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-subtle)'; }}
                  >
                    Last {n}d
                  </button>
                ))}
              </>
            }
          />
        </Widget>

        {/* Page-wide KPI tiles — scoped to the global date filter above,
            each with a ↑/↓ trend chip vs. the immediately preceding period
            of the same length. Not to be confused with the task-scoped
            row below (that's "how did this one run do"). */}
        <KpiCard
          colSpan={3} icon={PhoneOutgoing} iconBg="#eff6ff" iconColor="#2563eb" label="Call Volume"
          value={periodSummary.totalCalls}
          badge={trendBadge(periodSummary.totalCalls, prevPeriodSummary.totalCalls).label}
          badgeColor={trendBadge(periodSummary.totalCalls, prevPeriodSummary.totalCalls).color}
          secondaryLabel="Total Talk Time"
          secondaryValue={formatDuration(periodSummary.totalTalkTime)}
          secondaryBadge={trendBadge(periodSummary.totalTalkTime, prevPeriodSummary.totalTalkTime).label}
          secondaryBadgeColor={trendBadge(periodSummary.totalTalkTime, prevPeriodSummary.totalTalkTime).color}
        />
        <KpiCard
          colSpan={3} icon={UserCheck} iconBg="#f0fdf4" iconColor="#16a34a" label="Call Performance"
          value={`${periodSummary.successRate}%`}
          badge={trendBadge(periodSummary.successRate, prevPeriodSummary.successRate).label}
          badgeColor={trendBadge(periodSummary.successRate, prevPeriodSummary.successRate).color}
          secondaryLabel="Avg Call Duration"
          secondaryValue={formatDuration(periodSummary.avgCallDuration)}
          secondaryBadge={trendBadge(periodSummary.avgCallDuration, prevPeriodSummary.avgCallDuration).label}
          secondaryBadgeColor={trendBadge(periodSummary.avgCallDuration, prevPeriodSummary.avgCallDuration).color}
        />
        <KpiCard
          colSpan={3} icon={MessageCircleQuestion} iconBg="#fffbeb" iconColor="#d97706" label="Total Enquiries"
          value={filteredEnquiries.length}
          badge={trendBadge(filteredEnquiries.length, prevFilteredEnquiries.length).label}
          badgeColor={trendBadge(filteredEnquiries.length, prevFilteredEnquiries.length).color}
        />
        <KpiCard
          colSpan={3} icon={DollarSign} iconBg="#fffbeb" iconColor="#d97706" label="Total Cost"
          value={formatInr(periodSummary.totalCost)} sub={`at ₹${costPerMinuteInr}/min`}
          badge={trendBadge(periodSummary.totalCost, prevPeriodSummary.totalCost).label}
          badgeColor={trendBadge(periodSummary.totalCost, prevPeriodSummary.totalCost).color}
        />

        {/* ══════════════════════════════════════════════════════════════
            REPORTS WIDGETS — 12 widgets, 2 per row, all reading from
            filteredCalls/filteredEnquiries/tasksInPeriod above, so every
            one of them already respects the global date filter.
            ══════════════════════════════════════════════════════════════ */}

        {/* Row 1a: Call Volume Over Time */}
        <Widget colSpan={6} title="Call Volume Over Time" subtitle="Inbound vs. outbound calls per day." icon={PhoneIncoming} accent="#2563eb" padding="md" hover bodyOverflow="hidden">
          <div className="h-52 sm:h-56 md:h-64 w-full mt-1">
            {callVolumeOverTime.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={callVolumeOverTime} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="period" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <RechartsTooltip {...CHART_TOOLTIP} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="inbound" name="Inbound" stroke="#2563eb" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="outbound" name="Outbound" stroke="#f97316" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <EmptyState heading="No calls in this period" />}
          </div>
        </Widget>

        {/* Row 1b: Call Duration Distribution */}
        <Widget colSpan={6} title="Call Duration Distribution" subtitle="How long calls typically run." icon={BarChart3} accent="#7c3aed" padding="md" hover bodyOverflow="hidden">
          <div className="h-64 w-full mt-1">
            {filteredCalls.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={durationDistribution} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="bucket" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <RechartsTooltip {...CHART_TOOLTIP} />
                  <Bar dataKey="count" name="Calls" fill="#7c3aed" radius={[4, 4, 0, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState heading="No calls in this period" />}
          </div>
        </Widget>

        {/* Row 2a: Success Rate by Campaign */}
        <Widget
          colSpan={6}
          title="Success Rate by Campaign"
          subtitle="% of leads with a successful outcome (intent: Interested)."
          icon={BarChart3}
          accent="#059669"
          padding="md"
          hover
          bodyOverflow="hidden"
          action={
            <button
              onClick={() => setCampaignSortAsc(s => !s)}
              className="text-[10px] font-semibold px-2.5 py-1 rounded-lg border cursor-pointer"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              Sort: {campaignSortAsc ? 'Lowest first' : 'Highest first'}
            </button>
          }
        >
          <div className="w-full mt-1" className="min-h-[240px] h-[clamp(240px,32vw,300px)]">
            {campaignSuccessRate.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={campaignSuccessRate} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" domain={[0, 100]} unit="%" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="campaign" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={window.innerWidth < 640 ? 82 : 120} />
                  <RechartsTooltip {...CHART_TOOLTIP} formatter={(v: number, _n, p: any) => [`${v}% (${p?.payload?.successful ?? 0}/${p?.payload?.total ?? 0})`, 'Success Rate']} />
                  <Bar dataKey="rate" name="Success Rate" fill="#059669" radius={[0, 3, 3, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState heading="No campaign calls in this period" message="Run a dialing task from Campaign to see performance here." />}
          </div>
        </Widget>

        {/* Row 2b: Outcome Analysis — same fixed height as Success Rate by
            Campaign next to it, donut centered, so the two widgets in
            this row line up instead of one looking squashed. */}
        <Widget colSpan={6} title="Outcome Analysis" subtitle="Distribution of call outcomes (intent) this period." icon={PieChartIcon} accent="#d97706" padding="md" hover>
          {outcomeAnalysis.length > 0 ? (
            <div className="flex flex-col items-center justify-center gap-5 overflow-y-auto" className="min-h-[240px] h-[clamp(240px,32vw,300px)]">
              <PieChart slices={outcomeAnalysis} size={180} />
              <div className="w-full max-w-xs space-y-1.5">
                {outcomeAnalysis.map(s => (
                  <div key={s.label} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      {s.label}
                    </span>
                    <span className="font-semibold text-slate-700">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <EmptyState heading="No calls in this period" />}
        </Widget>

        {/* Row 3a: Agent Performance */}
        <Widget
          colSpan={6}
          title="Agent Performance"
          subtitle="Per AI calling agent, this period."
          icon={Users}
          accent="#2563eb"
          padding="md"
          hover
          bodyOverflow="hidden"
          action={
            <select
              value={agentMetric}
              onChange={(e) => setAgentMetric(e.target.value as typeof agentMetric)}
              className="text-[11px] font-semibold px-2 py-1.5 rounded-lg border bg-[var(--bg-surface)] cursor-pointer max-w-[46vw] truncate"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              <option value="successRate">Success Rate</option>
              <option value="successfulOutcomes">Successful Outcomes</option>
              <option value="totalCalls">Total Calls</option>
              <option value="answeredCalls">Answered Calls</option>
              <option value="inquiries">Inquiries</option>
              <option value="avgDuration">Avg Call Duration</option>
            </select>
          }
        >
          <div className="w-full mt-1" style={{ height: Math.max(150, Math.min(300, agentPerformance.length * 34)) }}>
            {agentPerformance.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agentPerformance} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} unit={agentMetric === 'successRate' ? '%' : agentMetric === 'avgDuration' ? 's' : undefined} />
                  <YAxis type="category" dataKey="agent" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={120} />
                  <RechartsTooltip {...CHART_TOOLTIP} />
                  <Bar dataKey={agentMetric} name={agentMetric === 'successRate' ? 'Success Rate' : agentMetric === 'avgDuration' ? 'Avg Duration (s)' : agentMetric} fill="#2563eb" radius={[0, 3, 3, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState heading="No campaign calls in this period" message="Run a dialing task from Campaign to see agent performance here." />}
          </div>
        </Widget>

        {/* Row 3b: Inbound vs Outbound Analysis */}
        <Widget
          colSpan={6}
          title="Inbound vs Outbound Analysis"
          subtitle="Total and answered calls, by direction."
          icon={PhoneOutgoing}
          accent="#7c3aed"
          padding="md"
          hover
          bodyOverflow="hidden"
          action={
            <div className="flex flex-wrap items-center justify-end gap-1.5 max-w-full">
              <select
                value={ioCampaignFilter}
                onChange={(e) => setIoCampaignFilter(e.target.value)}
                className="text-[10px] font-semibold px-2 py-1 rounded-lg border bg-[var(--bg-surface)] cursor-pointer"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                <option value="all">All Campaigns</option>
                {taskGroups.map(g => <option key={g.label} value={g.label}>{g.label}</option>)}
              </select>
              <select
                value={ioAgentFilter}
                onChange={(e) => setIoAgentFilter(e.target.value)}
                className="text-[10px] font-semibold px-2 py-1 rounded-lg border bg-[var(--bg-surface)] cursor-pointer"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                <option value="all">All Agents</option>
                {Object.entries(agentNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
          }
        >
          <div className="h-64 w-full mt-1">
            {inboundOutboundAnalysis.some(r => r.total > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={inboundOutboundAnalysis} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="direction" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <RechartsTooltip {...CHART_TOOLTIP} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="answered" name="Answered" stackId="calls" fill="#059669" />
                  <Bar dataKey="notAnswered" name="Not Answered" stackId="calls" fill="#e11d48" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState heading="No calls in this period" />}
          </div>
        </Widget>

        {/* Row 4a: Inquiry Analysis */}
        <Widget colSpan={6} title="Inquiry Analysis" subtitle="Customer inquiries handled, per day." icon={MessageCircleQuestion} accent="#d97706" padding="md" hover bodyOverflow="hidden">
          <div className="h-64 w-full mt-1">
            {inquiryAnalysis.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={inquiryAnalysis} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="period" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <RechartsTooltip {...CHART_TOOLTIP} />
                  <Bar dataKey="count" name="Inquiries" fill="#d97706" radius={[4, 4, 0, 0]} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState heading="No inquiries in this period" />}
          </div>
        </Widget>

        {/* Row 4a-2: Enquiries by Status */}
        <Widget colSpan={6} title="Enquiries by Status" subtitle="Are inbound enquiries actually getting worked, or just piling up?" icon={MessageCircleQuestion} accent="#2563eb" padding="md" hover>
          {enquiriesByStatus.length > 0 ? (
            <div className="flex flex-col items-center justify-center gap-5 overflow-y-auto" style={{ height: 300 }}>
              <PieChart slices={enquiriesByStatus} size={180} />
              <div className="w-full max-w-xs space-y-1.5">
                {enquiriesByStatus.map(s => (
                  <div key={s.label} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      {s.label}
                    </span>
                    <span className="font-semibold text-slate-700">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <EmptyState heading="No enquiries in this period" />}
        </Widget>

        {/* Row 4b: Call Outcomes Over Time */}
        <Widget colSpan={6} title="Call Outcomes Over Time" subtitle="Daily outcome (intent) breakdown." icon={Activity} accent="#2563eb" padding="md" hover bodyOverflow="hidden">
          <div className="h-64 w-full mt-1">
            {outcomesOverTime.data.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={outcomesOverTime.data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="period" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <RechartsTooltip {...CHART_TOOLTIP} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {outcomesOverTime.intents.map(intent => (
                    <Area key={intent} type="monotone" dataKey={intent} name={intent} stackId="1" stroke={intentColor(intent)} fill={intentColor(intent)} fillOpacity={0.5} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyState heading="No calls in this period" />}
          </div>
        </Widget>

        {/* Row 5a: Leads by Source / Pipeline by Stage — moved here from
            Executive Desk, same /api/dashboard/metrics data. */}
        <Widget
          colSpan={6}
          title={isLending ? 'Leads by Source' : `${primaryObject?.objectLabel || 'Pipeline'} by Stage`}
          subtitle={isLending ? 'How your leads are actually arriving.' : 'Where records currently sit in the pipeline.'}
          icon={Activity}
          accent="#7c3aed"
          padding="md"
          hover
          bodyOverflow="hidden"
        >
          <div className="h-64 w-full mt-1">
            {isLending
              ? channelPerformance.length > 0
                ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={channelPerformance} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="source" stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                      <RechartsTooltip {...CHART_TOOLTIP} />
                      <Bar dataKey="count" name="Leads" fill="#7c3aed" radius={[4, 4, 0, 0]} barSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                )
                : <EmptyState heading="No leads yet" />
              : primaryObject?.stageDistribution && primaryObject.stageDistribution.length > 0
                ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={primaryObject.stageDistribution} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="stage" stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                      <RechartsTooltip {...CHART_TOOLTIP} />
                      <Bar dataKey="count" name="Records" fill="#7c3aed" radius={[4, 4, 0, 0]} barSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                )
                : <EmptyState heading="No pipeline stages configured yet" />
            }
          </div>
        </Widget>

        {/* Row 5b: Cost Analysis — only metrics that can actually be
            derived from existing data (total cost per day, cost per call,
            cost per successful outcome). No per-call AI/token or
            telephony cost breakdown exists in call_logs yet, so those two
            metrics from the spec are intentionally left out here rather
            than invented. */}
        <Widget colSpan={6} title="Cost Analysis" subtitle="Total cost per day, this period." icon={DollarSign} accent="#d97706" padding="md" hover bodyOverflow="hidden">
          <div className="flex items-center gap-4 mb-3 text-xs">
            <span className="text-slate-500">Cost / Call: <strong className="text-slate-700">{formatInr(costPerCall)}</strong></span>
            <span className="text-slate-500">Cost / Successful Outcome: <strong className="text-slate-700">{successfulOutcomesInPeriod > 0 ? formatInr(costPerSuccessfulOutcome) : '—'}</strong></span>
          </div>
          <div className="h-44 sm:h-48 md:h-52 w-full">
            {costOverTime.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costOverTime} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="period" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatInr(v)} />
                  <RechartsTooltip {...CHART_TOOLTIP} formatter={(v: number) => [formatInr(v), 'Cost']} />
                  <Bar dataKey="cost" name="Cost" fill="#d97706" radius={[4, 4, 0, 0]} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState heading="No calls in this period" />}
          </div>
          <p className="text-[10px] text-slate-400 mt-2">AI/token and telephony cost aren't broken out per call in the current data — only the totals above are shown.</p>
        </Widget>

        {/* Row 5c: Call Activity by Hour of Day */}
        <Widget colSpan={6} title="Call Activity by Hour of Day" subtitle="When calls actually happen — useful for dialer/staffing windows." icon={Clock} accent="#2563eb" padding="md" hover bodyOverflow="hidden">
          {filteredCalls.length > 0 && (
            <p className="text-xs text-slate-500 mb-1">
              Peak hour: <strong className="text-slate-700">{peakHour.label}</strong> ({peakHour.count} call{peakHour.count === 1 ? '' : 's'})
            </p>
          )}
          <div className="h-56 w-full mt-1">
            {filteredCalls.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={callsByHour} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={10} tickLine={false} interval={2} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <RechartsTooltip {...CHART_TOOLTIP} />
                  <Bar dataKey="count" name="Calls" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={10} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState heading="No calls in this period" />}
          </div>
        </Widget>

        {/* Row 6: Campaign Details — full width. One row per lead in the
            selected campaign, with the base call columns plus one column
            per workflow variable actually extracted for that campaign —
            switching the dropdown changes both the rows AND the column
            set, since a different campaign's workflow has different
            variables. Reuses GET /api/calls/:id/lead-responses (already
            self-resolves each answer's real name/dataType from the
            call's dialer task -> workflowId), one fetch per lead in the
            selected campaign only — not for every campaign at once. */}
        <Widget
          colSpan={12}
          title="Campaign Details"
          subtitle="Extracted answers for every lead in one campaign — pick a campaign to see its own questions as columns."
          icon={Users}
          accent="#2563eb"
          padding="none"
          hover
          action={
            <select
              value={campaignDetailTaskId}
              onChange={(e) => setCampaignDetailTaskId(e.target.value)}
              className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border bg-[var(--bg-surface)] cursor-pointer max-w-xs"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              {campaignOptions.length === 0 && <option value="">No campaigns yet</option>}
              {campaignOptions.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} — {new Date(t.workflowRunMetadata?.runAt || t.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </option>
              ))}
            </select>
          }
        >
          {campaignDetailLoading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading campaign details…</div>
          ) : !campaignDetailTask ? (
            <EmptyState heading="No campaigns yet" message="Run a dialing task from Campaign to see its details here." />
          ) : campaignDetailRows.length === 0 ? (
            <EmptyState heading="No completed calls in this campaign yet" />
          ) : (() => {
            const columns: Column<CampaignDetailRow>[] = [
              { key: 'leadName', header: 'Name', cell: (r) => <span className="font-semibold text-slate-800">{r.leadName}</span> },
              { key: 'phone', header: 'Phone', cell: (r) => <span className="text-slate-500 font-mono text-xs">{r.phone}</span> },
              { key: 'status', header: 'Status', cell: (r) => <span className="text-slate-600 text-xs">{r.status}</span> },
              { key: 'sentiment', header: 'Sentiment', cell: (r) => <span className="text-slate-600 text-xs">{r.sentiment}</span> },
              ...campaignDetailColumns.map((label): Column<CampaignDetailRow> => ({
                key: label,
                header: label,
                cell: (r) => r.answers[label]
                  ? <span className="text-slate-700 text-xs">{r.answers[label]}</span>
                  : <span className="text-slate-300 italic text-xs">—</span>,
              })),
            ];
            return (
              <DataTable
                bare
                resizable
                paginated
                columns={columns}
                rows={campaignDetailRows}
                rowKey={(r) => r.leadId}
              />
            );
          })()}
        </Widget>

      {showPreview && (
        <PrintableReport
          onClose={() => setShowPreview(false)}
          orgName={orgName}
          fromDate={fromDate}
          toDate={toDate}
          direction={direction}
          granularity={granularity}
          filteredCalls={filteredCalls}
          dialerTasks={dialerTasks}
          leads={leads}
          costPerMinuteInr={costPerMinuteInr}
        />
      )}
    </PageShell>
  );
}

