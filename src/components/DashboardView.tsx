import React, { useState, useEffect, useMemo } from 'react';
import {
  PhoneIncoming,
  PhoneOutgoing,
  UserCheck,
  MessageCircleQuestion,
  Flame,
  Activity,
  PieChart as PieChartIcon,
  BarChart3,
  Users,
  History,
  Smile,
  CalendarClock,
  Phone,
} from 'lucide-react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
} from 'recharts';
import { apiFetch } from '../lib/api';
import { formatPhone } from '../lib/phone';
import { Lead, Loan, CallLog, OrganizationSettings } from '../types';
import { COST_PER_MINUTE_INR_FALLBACK, formatInr, callCostInr } from '../lib/pricing';
import PageShell from './ui/PageShell';
import BreadcrumbTitle from './ui/BreadcrumbTitle';
import Widget from './ui/Widget';
import EmptyState from './ui/EmptyState';
import KpiCard from './ui/KpiCard';
import PieChart from './ui/PieChart';
import DataTable, { Column } from './ui/DataTable';
import FilterBar from './ui/FilterBar';
import SlideOver from './ui/SlideOver';

// Loosely typed like ReportsView's DialTask — this page only needs
// the task's own name + each lead's call outcome, not the full shape.
// `name` — NOT `workflowName`, which doesn't exist on the real
// dialer_tasks row (see db.getScheduledCallbacks' identical bug) — is
// this campaign/task's own name, e.g. "Term Insurance Outreach — Sept".
interface DashboardDialTask {
  id: string;
  name?: string;
  createdAt: string;
  // Despite the name, this is the wizard-selected AI calling agent's id
  // (org_agents), not a human team member — same field DialerSimulator.tsx
  // uses to resolve which agent placed a campaign's calls.
  assignedTeamMemberId?: string;
  callResults: Record<string, { status: string; callAnswered?: boolean; intent?: string; callId?: string }>;
}

interface DashboardViewProps {
  leads: Lead[];
  loans: Loan[];
  callLogs: CallLog[];
  dialerTasks?: DashboardDialTask[];
  orgSettings: OrganizationSettings;
  costPerMinuteInr?: number;
}

// ── CALL STATUS (connectivity) vs. CALL OUTCOME (business result) ──────
// Kept deliberately separate, per spec: a call can be "Completed" (someone
// picked up, wasn't a machine) while still not being a real conversation
// (see callFinalizer.js's callAnswered heuristic) — that's Call Status.
// Call Outcome is the business result of the conversation, which this app
// already stores as `intent` on every call. There's no per-org
// configurable-outcomes model in the backend (a real gap, not something
// to fake with mock data) — the one existing "this call achieved a
// positive business result" signal is intent === 'Interested', the same
// convention already used for "Successful Outcomes" / topInterestedClients
// elsewhere in the app. Call Outcomes (the donut) is still dynamic in the
// sense that it plots whatever intent values actually appear in the data,
// not a hard-coded industry-specific label list.
function getCallStatus(status: string, callAnswered?: boolean): string {
  if (status === 'Completed') return callAnswered === false ? 'Not Answered' : 'Answered';
  return status;
}
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

const SENTIMENT_COLOR: Record<string, string> = {
  'Positive': '#059669',
  'Neutral': '#64748b',
  'Negative': '#e11d48',
  'Unknown': '#94a3b8',
};
function sentimentColor(sentiment: string): string {
  return SENTIMENT_COLOR[sentiment] || '#7c3aed';
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}m ${s}s`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ↑/↓ trend chip for a KPI card — compares this period's value against
// the immediately preceding period of the same length.
function trendBadge(current: number, previous: number): { label: string; color: 'green' | 'rose' | 'neutral' } {
  if (previous <= 0) return current > 0 ? { label: 'New', color: 'green' } : { label: '—', color: 'neutral' };
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { label: '0%', color: 'neutral' };
  return pct > 0 ? { label: `↑ ${pct}%`, color: 'green' } : { label: `↓ ${Math.abs(pct)}%`, color: 'rose' };
}

const CHART_TOOLTIP = {
  contentStyle: {
    background: 'var(--tooltip-bg, #1e293b)',
    border: 'none',
    borderRadius: 10,
    color: 'var(--tooltip-text, #f8fafc)',
    fontSize: 12,
  },
};

export default function DashboardView({
  leads,
  loans,
  callLogs,
  dialerTasks = [],
  orgSettings,
  costPerMinuteInr = COST_PER_MINUTE_INR_FALLBACK,
}: DashboardViewProps) {
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});
  const [allEnquiries, setAllEnquiries] = useState<{ id: string; callId: string | null; createdAt: string }[]>([]);
  interface ScheduledCallback {
    id: string;
    leadName: string;
    callerNumber?: string;
    kind?: 'callback' | 'not_answered';
    callbackTime?: string;
    callbackReason?: string;
    nextRetryAt?: string;
  }
  const [scheduledCallbacks, setScheduledCallbacks] = useState<ScheduledCallback[]>([]);

  const loadExtras = () => {
    // Just for id -> name resolution (Agent Performance/Recent Calls) —
    // dialerTasks only carries the agent's id (assignedTeamMemberId).
    apiFetch('/api/agents')
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: { id: string; name: string }[]) => setAgentNames(Object.fromEntries((Array.isArray(data) ? data : []).map(a => [a.id, a.name]))))
      .catch(err => console.error('Failed to load agents:', err));
    // Enquiries with real createdAt (a generous page size, not the whole
    // table) so the Inquiries KPI can respect the same global date filter
    // as everything else on this page. The backend doesn't support
    // filtering this collection by date server-side yet.
    apiFetch('/api/enquiries?page=1&limit=1000')
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: { rows?: typeof allEnquiries }) => setAllEnquiries(data.rows ?? []))
      .catch(err => console.error('Failed to load enquiries:', err));
    // Not scoped by the global date filter — a callback's own time is
    // always in the future regardless of when the original call happened,
    // so filtering it by "calls in this period" would be meaningless.
    apiFetch('/api/scheduled-callbacks')
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: ScheduledCallback[]) => setScheduledCallbacks(Array.isArray(data) ? data : []))
      .catch(err => console.error('Failed to load scheduled callbacks:', err));
  };
  useEffect(loadExtras, []);

  // ── Global date-range filter — supports the requested presets plus a
  // free custom range via the same From/To date inputs. ──
  const [fromDate, setFromDate] = useState(daysAgo(29)); // "Last 30 days" default, inclusive of today
  const [toDate, setToDate] = useState(daysAgo(0));
  const [activePreset, setActivePreset] = useState<'today' | 'yesterday' | '7d' | '30d' | 'custom'>('30d');

  const applyPreset = (preset: typeof activePreset) => {
    setActivePreset(preset);
    const today = daysAgo(0);
    if (preset === 'today') { setFromDate(today); setToDate(today); }
    else if (preset === 'yesterday') { setFromDate(daysAgo(1)); setToDate(daysAgo(1)); }
    else if (preset === '7d') { setFromDate(daysAgo(6)); setToDate(today); }
    else if (preset === '30d') { setFromDate(daysAgo(29)); setToDate(today); }
  };

  const inRange = (iso: string, from: string, to: string) => {
    const d = new Date(iso);
    return d >= new Date(from + 'T00:00:00') && d <= new Date(to + 'T23:59:59');
  };

  const filteredCalls = useMemo(() => callLogs.filter(c => inRange(c.createdAt, fromDate, toDate)), [callLogs, fromDate, toDate]);
  const filteredEnquiries = useMemo(() => allEnquiries.filter(e => inRange(e.createdAt, fromDate, toDate)), [allEnquiries, fromDate, toDate]);

  // Immediately preceding period of the same length — powers the ↑/↓
  // trend chip on every KPI card.
  const [prevFromDate, prevToDate] = useMemo(() => {
    const from = new Date(fromDate + 'T00:00:00');
    const to = new Date(toDate + 'T23:59:59');
    const spanMs = to.getTime() - from.getTime();
    const prevTo = new Date(from.getTime() - 24 * 60 * 60 * 1000);
    const prevFrom = new Date(prevTo.getTime() - spanMs);
    return [prevFrom.toISOString().slice(0, 10), prevTo.toISOString().slice(0, 10)];
  }, [fromDate, toDate]);
  const prevFilteredCalls = useMemo(() => callLogs.filter(c => inRange(c.createdAt, prevFromDate, prevToDate)), [callLogs, prevFromDate, prevToDate]);
  const prevFilteredEnquiries = useMemo(() => allEnquiries.filter(e => inRange(e.createdAt, prevFromDate, prevToDate)), [allEnquiries, prevFromDate, prevToDate]);

  // Tasks whose run falls inside the selected period — drives Campaign
  // Performance, Agent Performance, and Recent Calls' Campaign/Agent
  // columns, so those also respect the global date filter.
  const tasksInPeriod = useMemo(() => dialerTasks.filter(t => inRange(t.createdAt, fromDate, toDate)), [dialerTasks, fromDate, toDate]);

  // callId -> {campaign, agentId} — lets call_logs-derived widgets (Recent
  // Calls) join back to the campaign/agent that placed a call, since
  // call_logs itself doesn't carry either.
  const callTaskIndex = useMemo(() => {
    const idx = new Map<string, { campaign: string; agentId: string | null }>();
    for (const task of tasksInPeriod) {
      for (const result of Object.values(task.callResults || {})) {
        if (result.callId) idx.set(result.callId, { campaign: task.name || 'Other', agentId: task.assignedTeamMemberId || null });
      }
    }
    return idx;
  }, [tasksInPeriod]);

  function summarize(calls: CallLog[]) {
    const totalCalls = calls.length;
    const answeredCalls = calls.filter(c => c.status === 'Completed' && c.callAnswered !== false).length;
    const successfulOutcomes = calls.filter(c => isSuccessfulOutcome(c.intent)).length;
    return { totalCalls, answeredCalls, successfulOutcomes };
  }
  const periodSummary = useMemo(() => summarize(filteredCalls), [filteredCalls]);
  const prevPeriodSummary = useMemo(() => summarize(prevFilteredCalls), [prevFilteredCalls]);
  const answerRate = periodSummary.totalCalls > 0 ? Math.round((periodSummary.answeredCalls / periodSummary.totalCalls) * 100) : 0;

  // Widget 1: Call Outcomes — dynamic donut over whatever intent values
  // actually appear in this period's calls.
  const callOutcomes = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of filteredCalls) {
      const intent = c.intent || 'Unknown';
      counts[intent] = (counts[intent] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([label, value]) => ({ label, value, color: intentColor(label) }))
      .sort((a, b) => b.value - a.value);
  }, [filteredCalls]);

  // Widget 1b: Sentiment Breakdown — how calls actually FELT to the
  // caller, distinct from Call Outcomes above (which plots the business
  // result, `intent`). c.sentiment is set by the sentiment-analyzer system
  // agent on every call but wasn't shown anywhere on this dashboard.
  const sentimentBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of filteredCalls) {
      const sentiment = c.sentiment || 'Unknown';
      counts[sentiment] = (counts[sentiment] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([label, value]) => ({ label, value, color: sentimentColor(label) }))
      .sort((a, b) => b.value - a.value);
  }, [filteredCalls]);

  // Widget 2: Inbound vs Outbound Calls — daily line, by direction.
  const inboundOutboundOverTime = useMemo(() => {
    const buckets: Record<string, { period: string; inbound: number; outbound: number }> = {};
    for (const c of filteredCalls) {
      const key = new Date(c.createdAt).toISOString().slice(0, 10);
      if (!buckets[key]) buckets[key] = { period: key, inbound: 0, outbound: 0 };
      if (c.direction === 'inbound') buckets[key].inbound++;
      else if (c.direction === 'outbound') buckets[key].outbound++;
    }
    return Object.values(buckets).sort((a, b) => a.period.localeCompare(b.period));
  }, [filteredCalls]);

  // Widget 3: Calls & Outcomes Over Time — daily line, total calls vs.
  // successful outcomes, so an exec can see whether more calls are
  // actually converting to real business results.
  const callsAndOutcomesOverTime = useMemo(() => {
    const buckets: Record<string, { period: string; totalCalls: number; successfulOutcomes: number }> = {};
    for (const c of filteredCalls) {
      const key = new Date(c.createdAt).toISOString().slice(0, 10);
      if (!buckets[key]) buckets[key] = { period: key, totalCalls: 0, successfulOutcomes: 0 };
      buckets[key].totalCalls++;
      if (isSuccessfulOutcome(c.intent)) buckets[key].successfulOutcomes++;
    }
    return Object.values(buckets).sort((a, b) => a.period.localeCompare(b.period));
  }, [filteredCalls]);

  // Shared per-campaign / per-agent stat shape — Widgets 4 & 5 both
  // switch between the same 5 metrics, just grouped differently.
  type MetricKey = 'totalCalls' | 'answeredCalls' | 'inquiries' | 'successfulOutcomes' | 'successRate';
  const METRIC_LABEL: Record<MetricKey, string> = {
    totalCalls: 'Total Calls', answeredCalls: 'Answered Calls', inquiries: 'Inquiries',
    successfulOutcomes: 'Successful Outcomes', successRate: 'Success Rate',
  };

  // Widget 4: Campaign Performance
  const [campaignMetric, setCampaignMetric] = useState<MetricKey>('totalCalls');
  const campaignPerformance = useMemo(() => {
    const byWorkflow: Record<string, { totalCalls: number; answeredCalls: number; successfulOutcomes: number }> = {};
    for (const task of tasksInPeriod) {
      const name = task.name || 'Other';
      if (!byWorkflow[name]) byWorkflow[name] = { totalCalls: 0, answeredCalls: 0, successfulOutcomes: 0 };
      for (const result of Object.values(task.callResults || {})) {
        if (!result?.status || result.status === 'Pending') continue;
        byWorkflow[name].totalCalls++;
        if (getCallStatus(result.status, result.callAnswered) === 'Answered') byWorkflow[name].answeredCalls++;
        if (isSuccessfulOutcome(result.intent)) byWorkflow[name].successfulOutcomes++;
      }
    }
    const inquiriesByCampaign: Record<string, number> = {};
    for (const e of filteredEnquiries) {
      const campaign = (e.callId && callTaskIndex.get(e.callId)?.campaign) || 'Other';
      inquiriesByCampaign[campaign] = (inquiriesByCampaign[campaign] || 0) + 1;
    }
    const names = new Set([...Object.keys(byWorkflow), ...Object.keys(inquiriesByCampaign)]);
    const rows = Array.from(names).map(campaign => {
      const s = byWorkflow[campaign] || { totalCalls: 0, answeredCalls: 0, successfulOutcomes: 0 };
      return {
        campaign,
        totalCalls: s.totalCalls,
        answeredCalls: s.answeredCalls,
        inquiries: inquiriesByCampaign[campaign] || 0,
        successfulOutcomes: s.successfulOutcomes,
        successRate: s.totalCalls > 0 ? Math.round((s.successfulOutcomes / s.totalCalls) * 100) : 0,
      };
    });
    rows.sort((a, b) => (b[campaignMetric] as number) - (a[campaignMetric] as number));
    return rows.slice(0, 8);
  }, [tasksInPeriod, filteredEnquiries, callTaskIndex, campaignMetric]);

  // Widget 5: Agent Performance
  const [agentMetric, setAgentMetric] = useState<MetricKey>('totalCalls');
  const agentPerformance = useMemo(() => {
    const byAgent: Record<string, { totalCalls: number; answeredCalls: number; successfulOutcomes: number }> = {};
    for (const task of tasksInPeriod) {
      const agentId = task.assignedTeamMemberId || 'unassigned';
      if (!byAgent[agentId]) byAgent[agentId] = { totalCalls: 0, answeredCalls: 0, successfulOutcomes: 0 };
      for (const result of Object.values(task.callResults || {})) {
        if (!result?.status || result.status === 'Pending') continue;
        byAgent[agentId].totalCalls++;
        if (getCallStatus(result.status, result.callAnswered) === 'Answered') byAgent[agentId].answeredCalls++;
        if (isSuccessfulOutcome(result.intent)) byAgent[agentId].successfulOutcomes++;
      }
    }
    const inquiriesByAgent: Record<string, number> = {};
    for (const e of filteredEnquiries) {
      const agentId = (e.callId && callTaskIndex.get(e.callId)?.agentId) || 'unassigned';
      inquiriesByAgent[agentId] = (inquiriesByAgent[agentId] || 0) + 1;
    }
    const agentIds = new Set([...Object.keys(byAgent), ...Object.keys(inquiriesByAgent)]);
    const rows = Array.from(agentIds).map(agentId => {
      const s = byAgent[agentId] || { totalCalls: 0, answeredCalls: 0, successfulOutcomes: 0 };
      return {
        agent: agentId === 'unassigned' ? 'Unassigned' : (agentNames[agentId] || 'Unknown Agent'),
        totalCalls: s.totalCalls,
        answeredCalls: s.answeredCalls,
        inquiries: inquiriesByAgent[agentId] || 0,
        successfulOutcomes: s.successfulOutcomes,
        successRate: s.totalCalls > 0 ? Math.round((s.successfulOutcomes / s.totalCalls) * 100) : 0,
      };
    });
    rows.sort((a, b) => (b[agentMetric] as number) - (a[agentMetric] as number));
    return rows.slice(0, 8);
  }, [tasksInPeriod, filteredEnquiries, callTaskIndex, agentNames, agentMetric]);

  // Widget 6b: Scheduled Callbacks — soonest-first, capped to keep the
  // widget compact; the full list already has its own dedicated page
  // (Scheduled Callbacks in the sidebar) for anything beyond a quick glance.
  const upcomingCallbacks = useMemo(
    () => [...scheduledCallbacks]
      .sort((a, b) => new Date(a.callbackTime || a.nextRetryAt || 0).getTime() - new Date(b.callbackTime || b.nextRetryAt || 0).getTime())
      .slice(0, 6),
    [scheduledCallbacks]
  );

  // Widget 6: Recent Calls — most recent within the selected period.
  const recentCalls = useMemo(
    () => [...filteredCalls].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 15),
    [filteredCalls]
  );
  const [selectedCall, setSelectedCall] = useState<CallLog | null>(null);

  return (
    <PageShell
      title={<BreadcrumbTitle group="Dashboard" page="Executive Desk" />}
      subtitle="Call activity, engagement, and business outcomes — for the selected date range."
      onRefresh={loadExtras}
    >
      {/* ── Global date-range filter ── */}
      <Widget colSpan={12} showHeader={false} padding="md">
        <FilterBar
          dates={[
            { key: 'from', label: 'From', value: fromDate, onChange: (v) => { setFromDate(v); setActivePreset('custom'); } },
            { key: 'to', label: 'To', value: toDate, onChange: (v) => { setToDate(v); setActivePreset('custom'); } },
          ]}
          actions={
            <>
              {([
                ['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'],
              ] as [typeof activePreset, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => applyPreset(key)}
                  className="px-3 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors"
                  style={{
                    background: activePreset === key ? '#2563eb' : 'var(--bg-subtle)',
                    borderColor: activePreset === key ? '#2563eb' : 'var(--border)',
                    color: activePreset === key ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  {label}
                </button>
              ))}
            </>
          }
        />
      </Widget>

      {/* ── KPI row ── */}
      <KpiCard
        colSpan={3} icon={PhoneIncoming} iconBg="#eff6ff" iconColor="#2563eb" label="Total Calls"
        value={periodSummary.totalCalls}
        badge={trendBadge(periodSummary.totalCalls, prevPeriodSummary.totalCalls).label}
        badgeColor={trendBadge(periodSummary.totalCalls, prevPeriodSummary.totalCalls).color}
      />
      <KpiCard
        colSpan={3} icon={UserCheck} iconBg="#f0fdf4" iconColor="#16a34a" label="Answered Calls"
        value={periodSummary.answeredCalls}
        sub={periodSummary.totalCalls > 0 ? `${answerRate}% answer rate` : undefined}
        badge={trendBadge(periodSummary.answeredCalls, prevPeriodSummary.answeredCalls).label}
        badgeColor={trendBadge(periodSummary.answeredCalls, prevPeriodSummary.answeredCalls).color}
      />
      <KpiCard
        colSpan={3} icon={MessageCircleQuestion} iconBg="#fffbeb" iconColor="#d97706" label="Inquiries"
        value={filteredEnquiries.length}
        badge={trendBadge(filteredEnquiries.length, prevFilteredEnquiries.length).label}
        badgeColor={trendBadge(filteredEnquiries.length, prevFilteredEnquiries.length).color}
      />
      <KpiCard
        colSpan={3} icon={Flame} iconBg="#fdf4ff" iconColor="#9333ea" label="Successful Outcomes"
        value={periodSummary.successfulOutcomes}
        badge={trendBadge(periodSummary.successfulOutcomes, prevPeriodSummary.successfulOutcomes).label}
        badgeColor={trendBadge(periodSummary.successfulOutcomes, prevPeriodSummary.successfulOutcomes).color}
      />

      {/* ── Widget Row 1: Call Outcomes | Inbound vs Outbound ── */}
      <Widget colSpan={6} title="Call Outcomes" subtitle="Distribution of call outcomes this period." icon={PieChartIcon} accent="#059669" padding="md" hover>
        {callOutcomes.length > 0 ? (
          <div className="flex flex-col items-center gap-4 mt-1">
            <PieChart slices={callOutcomes} size={150} />
            <div className="w-full max-w-xs space-y-1.5">
              {callOutcomes.map(s => (
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

      <Widget colSpan={6} title="Inbound vs Outbound Calls" subtitle="Call volume over time, by direction." icon={PhoneOutgoing} accent="#2563eb" padding="md" hover bodyOverflow="hidden">
        <div className="h-56 sm:h-60 md:h-64 w-full mt-1">
          {inboundOutboundOverTime.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={inboundOutboundOverTime} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="period" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip {...CHART_TOOLTIP} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="inbound" name="Inbound" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="outbound" name="Outbound" stroke="#f97316" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyState heading="No calls in this period" />}
        </div>
      </Widget>

      {/* ── Widget Row 1b: Sentiment Breakdown | Scheduled Callbacks ── */}
      <Widget colSpan={6} title="Sentiment Breakdown" subtitle="How calls actually felt to the caller, this period." icon={Smile} accent="#059669" padding="md" hover>
        {sentimentBreakdown.length > 0 ? (
          <div className="flex flex-col items-center gap-4 mt-1">
            <PieChart slices={sentimentBreakdown} size={150} />
            <div className="w-full max-w-xs space-y-1.5">
              {sentimentBreakdown.map(s => (
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

      <Widget colSpan={6} title="Scheduled Callbacks" subtitle="Upcoming automatic redials — busy callers and no-answers." icon={CalendarClock} accent="#2563eb" padding="none" hover scrollable maxBodyHeight="min(280px, 42vh)">
        {upcomingCallbacks.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {upcomingCallbacks.map(cb => (
              <div key={cb.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <Phone className="h-3.5 w-3.5 text-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">{cb.leadName}</p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {cb.callerNumber ? formatPhone(cb.callerNumber) : ''}
                      {cb.kind === 'not_answered' ? ' · Not Answered' : cb.callbackReason ? ` · "${cb.callbackReason}"` : ''}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-slate-500 shrink-0 whitespace-nowrap">
                  {(cb.callbackTime || cb.nextRetryAt) ? new Date((cb.callbackTime || cb.nextRetryAt)!).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                </span>
              </div>
            ))}
          </div>
        ) : <EmptyState heading="No callbacks scheduled" message="Calls where the caller asked for a redial, or that went unanswered, will show up here." />}
      </Widget>

      {/* ── Widget Row 2: Calls & Outcomes Over Time | Campaign Performance ── */}
      <Widget colSpan={6} title="Calls & Outcomes Over Time" subtitle="Is more call activity producing more successful outcomes?" icon={Activity} accent="#2563eb" padding="md" hover bodyOverflow="hidden">
        <div className="h-64 w-full mt-1">
          {callsAndOutcomesOverTime.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={callsAndOutcomesOverTime} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="period" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip {...CHART_TOOLTIP} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="totalCalls" name="Total Calls" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="successfulOutcomes" name="Successful Outcomes" stroke="#059669" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyState heading="No calls in this period" />}
        </div>
      </Widget>

      <Widget
        colSpan={6}
        title="Campaign Performance"
        subtitle="Compare campaigns by a metric of your choice."
        icon={BarChart3}
        accent="#7c3aed"
        padding="md"
        hover
        bodyOverflow="hidden"
        action={
          <select
            value={campaignMetric}
            onChange={(e) => setCampaignMetric(e.target.value as MetricKey)}
            className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border bg-[var(--bg-surface)] cursor-pointer"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            {(Object.keys(METRIC_LABEL) as MetricKey[]).map(k => <option key={k} value={k}>{METRIC_LABEL[k]}</option>)}
          </select>
        }
      >
        <div className="w-full mt-1" style={{ height: Math.max(150, campaignPerformance.length * 32) }}>
          {campaignPerformance.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={campaignPerformance} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} unit={campaignMetric === 'successRate' ? '%' : undefined} />
                <YAxis type="category" dataKey="campaign" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={120} />
                <Tooltip {...CHART_TOOLTIP} />
                <Bar dataKey={campaignMetric} name={METRIC_LABEL[campaignMetric]} fill="#7c3aed" radius={[0, 3, 3, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState heading="No campaign calls in this period" message="Run a dialing task from Campaign to see performance here." />}
        </div>
      </Widget>

      {/* ── Widget Row 3: Agent Performance | Recent Calls ── */}
      <Widget
        colSpan={6}
        title="Agent Performance"
        subtitle="Compare AI calling agents by a metric of your choice."
        icon={Users}
        accent="#2563eb"
        padding="md"
        hover
        bodyOverflow="hidden"
        action={
          <select
            value={agentMetric}
            onChange={(e) => setAgentMetric(e.target.value as MetricKey)}
            className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border bg-[var(--bg-surface)] cursor-pointer"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            {(Object.keys(METRIC_LABEL) as MetricKey[]).map(k => <option key={k} value={k}>{METRIC_LABEL[k]}</option>)}
          </select>
        }
      >
        <div className="w-full mt-1" style={{ height: Math.min(260, Math.max(130, agentPerformance.length * 26)) }}>
          {agentPerformance.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agentPerformance} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} unit={agentMetric === 'successRate' ? '%' : undefined} />
                <YAxis type="category" dataKey="agent" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={120} />
                <Tooltip {...CHART_TOOLTIP} />
                <Bar dataKey={agentMetric} name={METRIC_LABEL[agentMetric]} fill="#2563eb" radius={[0, 3, 3, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState heading="No campaign calls in this period" message="Run a dialing task from Campaign to see agent performance here." />}
        </div>
      </Widget>

      <Widget colSpan={6} title="Recent Calls" icon={History} accent="#64748b" padding="none" hover scrollable maxBodyHeight="280px">
        {(() => {
          const columns: Column<CallLog>[] = [
            { key: 'id', header: 'Call ID', cell: (c) => <span className="font-mono text-[10px] text-slate-400">{c.id.slice(0, 8)}</span> },
            { key: 'when', header: 'Date/Time', cell: (c) => <span className="text-slate-400 whitespace-nowrap">{new Date(c.createdAt).toLocaleString()}</span> },
            { key: 'customer', header: 'Customer', cell: (c) => <span className="font-semibold text-slate-800">{c.leadName}</span> },
            { key: 'campaign', header: 'Campaign', cell: (c) => <span className="text-slate-500">{callTaskIndex.get(c.id)?.campaign || '—'}</span> },
            {
              key: 'agent',
              header: 'Agent',
              cell: (c) => {
                const agentId = callTaskIndex.get(c.id)?.agentId;
                return <span className="text-slate-500">{agentId ? (agentNames[agentId] || 'Unknown Agent') : '—'}</span>;
              },
            },
            { key: 'direction', header: 'Direction', cell: (c) => <span className="text-slate-500 capitalize">{c.direction || '—'}</span> },
            { key: 'duration', header: 'Duration', cell: (c) => <span className="font-mono">{formatDuration(c.duration)}</span> },
            { key: 'status', header: 'Call Status', cell: (c) => <span className="text-slate-500">{getCallStatus(c.status, c.callAnswered)}</span> },
            {
              key: 'outcome',
              header: 'Outcome',
              cell: (c) => (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap" style={{ color: intentColor(c.intent || 'Unknown'), backgroundColor: `${intentColor(c.intent || 'Unknown')}1a` }}>
                  {c.intent || 'Unknown'}
                </span>
              ),
            },
          ];
          return (
            <DataTable
              bare
              columns={columns}
              rows={recentCalls}
              rowKey={(c) => c.id}
              onRowClick={(c) => setSelectedCall(c)}
              emptyMessage="No calls in this period."
            />
          );
        })()}
      </Widget>

      {/* Call detail — opens on clicking a Recent Calls row. */}
      <SlideOver
        open={!!selectedCall}
        onClose={() => setSelectedCall(null)}
        title={selectedCall?.leadName}
        subtitle={selectedCall ? new Date(selectedCall.createdAt).toLocaleString() : undefined}
      >
        {selectedCall && (() => {
          const link = callTaskIndex.get(selectedCall.id);
          type FieldRow = { key: string; field: string; value: React.ReactNode };
          const rows: FieldRow[] = [
            { key: 'campaign', field: 'Campaign', value: link?.campaign || '—' },
            { key: 'agent', field: 'Agent', value: link?.agentId ? (agentNames[link.agentId] || 'Unknown Agent') : '—' },
            { key: 'direction', field: 'Direction', value: <span className="capitalize">{selectedCall.direction || '—'}</span> },
            { key: 'duration', field: 'Duration', value: formatDuration(selectedCall.duration) },
            { key: 'status', field: 'Call Status', value: getCallStatus(selectedCall.status, selectedCall.callAnswered) },
            { key: 'outcome', field: 'Outcome', value: selectedCall.intent || 'Unknown' },
            { key: 'cost', field: 'Cost', value: formatInr(callCostInr(selectedCall.duration || 0, costPerMinuteInr)) },
          ];
          const columns: Column<FieldRow>[] = [
            { key: 'field', header: 'Field', width: '35%', cell: (r) => <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px] whitespace-nowrap">{r.field}</span> },
            { key: 'value', header: 'Value', cell: (r) => <span className="text-slate-700">{r.value}</span> },
          ];
          return (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <DataTable bare resizable columns={columns} rows={rows} rowKey={(r) => r.key} />
              </div>
              {selectedCall.summary && (
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Summary</p>
                  <p className="text-xs text-slate-600 italic">"{selectedCall.summary}"</p>
                </div>
              )}
              {selectedCall.transcript && selectedCall.transcript.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Transcript</p>
                  {selectedCall.transcript.map((line, i) => (
                    <div key={i} className="text-xs">
                      <span className="font-semibold text-slate-700">{line.speaker}: </span>
                      <span className="text-slate-600">{line.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </SlideOver>
    </PageShell>
  );
}
