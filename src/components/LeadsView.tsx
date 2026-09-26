import React from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Phone, ArrowRightCircle, CheckCircle2, Download, Megaphone, Clock } from 'lucide-react';
import { Lead } from '../types';
import { formatPhone } from '../lib/phone';
import { usePipelineStages, stageLabel } from '../lib/pipelineStages';
import { CsvField } from '../lib/csvExport';
import PageShell from './ui/PageShell';
import Widget from './ui/Widget';
import Badge from './ui/Badge';
import EmptyState from './ui/EmptyState';
import DataTable, { Column } from './ui/DataTable';
import FilterBar from './ui/FilterBar';
import ContactDetailsSlideOver from './ui/ContactDetailsSlideOver';
import ExportCsvModal from './ui/ExportCsvModal';

// Leads = contacts currently in the "lead" stage of the universal
// contact -> campaign -> lead -> opportunity -> client pipeline (see
// src/lib/pipelineStages.ts) — i.e. contacts who've actually engaged
// (answered a call), past the raw Contact/Campaign stages but not yet a
// qualified Opportunity or a converted Client. A filtered VIEW over the same
// `leads` (Contacts) data App.tsx already manages, not a separate entity —
// advancing a lead here just edits its `status` the same way Contact
// Directory's edit form would, which the backend maps to the next
// pipeline stage (see db.replaceLeads / routes/leads.js PATCH).
const STAGE_COLOR: Record<string, 'blue' | 'amber' | 'green' | 'rose' | 'slate' | 'indigo'> = {
  contact: 'slate',
  campaign: 'blue',
  lead: 'indigo',
  opportunity: 'amber',
  client: 'green',
};

// Minimal shape of a dialer task ("campaign") needed here — just enough
// to list campaigns and check which leads were part of one. Matches the
// DialTask shape defined locally in DialerSimulator.tsx/ReportsView.tsx.
interface CampaignTask {
  id: string;
  name: string;
  leadIds: string[];
  createdAt: string;
  // Present on the real dialerTasks rows App.tsx passes down (typed
  // loosely as any[] there) — only the callId is needed here, to fetch
  // the same "Extracted Campaign Answers" the Active Campaign List's own
  // Workflow View shows for this lead.
  callResults?: { [leadId: string]: { callId?: string } };
}

interface LeadsViewProps {
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  dialerTasks?: CampaignTask[];
}

// The most recent call (by owning task's createdAt) that has a callId for
// this lead, across every campaign it's ever been part of — same data
// DialerSimulator's Workflow View reads from, just not scoped to one
// selected task here since Leads has no single "selected campaign".
function latestCallIdForLead(leadId: string, dialerTasks: CampaignTask[]): string | null {
  const withCallId = [...dialerTasks]
    .filter((t) => t.callResults?.[leadId]?.callId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return withCallId[0]?.callResults?.[leadId]?.callId ?? null;
}

// The dialer task (campaign) this lead was most recently dialed under —
// prefer tasks that already have callResults for this lead (actual dial)
// over tasks that only list the lead in leadIds, since the same workflow
// can spawn multiple campaigns and membership alone is ambiguous.
function latestCampaignTaskForLead(leadId: string, dialerTasks: CampaignTask[]): CampaignTask | null {
  const byCreated = (a: CampaignTask, b: CampaignTask) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  const dialed = [...dialerTasks]
    .filter((t) => t.callResults && leadId in t.callResults)
    .sort(byCreated);
  if (dialed[0]) return dialed[0];
  const listed = [...dialerTasks]
    .filter((t) => t.leadIds?.includes(leadId))
    .sort(byCreated);
  return listed[0] ?? null;
}

function latestCampaignForLead(leadId: string, dialerTasks: CampaignTask[]): string | null {
  return latestCampaignTaskForLead(leadId, dialerTasks)?.name ?? null;
}

export default function LeadsView({ leads, setLeads, dialerTasks = [] }: LeadsViewProps) {
  const navigate = useNavigate();
  const { stages } = usePipelineStages();
  const [advancingId, setAdvancingId] = React.useState<string | null>(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [sourceFilter, setSourceFilter] = React.useState('All');
  const [campaignFilter, setCampaignFilter] = React.useState('All');
  const [statusFilter, setStatusFilter] = React.useState('All');
  const [selectedLead, setSelectedLead] = React.useState<Lead | null>(null);
  const [exportOpen, setExportOpen] = React.useState(false);

  const activeLeads = leads.filter((l) => l.pipelineStage === 'lead');
  const uniqueSources = [...new Set(activeLeads.map((l) => l.source).filter(Boolean))].sort();
  const campaignOptions = [...dialerTasks].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const selectedCampaign = campaignOptions.find((t) => t.id === campaignFilter) || null;
  const statusOptions = [...new Set(activeLeads.map((l) => l.status).filter(Boolean))].sort();
  const filteredLeads = activeLeads.filter((l) => {
    const matchesSearch = !searchTerm ||
      l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.phone.includes(searchTerm) ||
      (l.email || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSource = sourceFilter === 'All' || l.source === sourceFilter;
    const matchesCampaign = !selectedCampaign || selectedCampaign.leadIds.includes(l.id);
    const matchesStatus = statusFilter === 'All' || l.status === statusFilter;
    return matchesSearch && matchesSource && matchesCampaign && matchesStatus;
  });

  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    sourceFilter !== 'All' ||
    campaignFilter !== 'All' ||
    statusFilter !== 'All';

  const clearFilters = () => {
    setSearchTerm('');
    setSourceFilter('All');
    setCampaignFilter('All');
    setStatusFilter('All');
  };

  // Advances a lead's `status` the same way an edit in Contact Directory
  // would — just local state, same as every other Contact edit in this
  // app. App.tsx's existing debounced sync (or, for a lending-object org,
  // its per-record PATCH effect) picks up the change and persists it; the
  // backend independently derives the matching pipelineStage from the new
  // status (Qualified -> opportunity, Converted -> client), but it's set
  // here too so the row moves off this filtered list immediately instead
  // of waiting on a resync to reflect what the backend is about to do.
  const advance = (lead: Lead, toStatus: Lead['status'], toStage: Lead['pipelineStage']) => {
    setAdvancingId(lead.id);
    setLeads(leads.map((l) => (l.id === lead.id ? { ...l, status: toStatus, pipelineStage: toStage } : l)));
    setSelectedLead(null); // the row is about to leave this filtered list
    setTimeout(() => setAdvancingId(null), 400);
  };

  const csvFields: CsvField<Lead>[] = [
    { key: 'name', label: 'Name', getValue: (l) => l.name },
    { key: 'phone', label: 'Phone', getValue: (l) => formatPhone(l.phone) || l.phone },
    { key: 'email', label: 'Email', getValue: (l) => l.email },
    { key: 'source', label: 'Source', getValue: (l) => l.source },
    { key: 'campaign', label: 'Campaign', getValue: (l) => latestCampaignForLead(l.id, dialerTasks) || '' },
    { key: 'stage', label: 'Stage', getValue: (l) => stageLabel(stages, l.pipelineStage) },
    { key: 'status', label: 'CRM Status', getValue: (l) => l.status },
    { key: 'score', label: 'AI Score', getValue: (l) => l.score },
    { key: 'amountRequested', label: 'Amount Requested', getValue: (l) => l.amountRequested },
    { key: 'employer', label: 'Employer', getValue: (l) => l.financialInfo?.employer },
    { key: 'monthlyIncome', label: 'Monthly Income', getValue: (l) => l.financialInfo?.monthlyIncome },
    { key: 'notes', label: 'Notes', getValue: (l) => l.notes },
    { key: 'tags', label: 'Tags', getValue: (l) => (l.tags || []).join('; ') },
    { key: 'createdAt', label: 'Added On', getValue: (l) => new Date(l.createdAt).toLocaleString() },
  ];

  const columns: Column<Lead>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (l) => (
        <div>
          <p className="font-semibold text-slate-800 dark:text-[var(--text-primary)]">{l.name}</p>
          <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-400 dark:text-[var(--text-muted)]">
            <Phone className="h-3 w-3" /> {formatPhone(l.phone) || l.phone}
          </div>
        </div>
      ),
    },
    { key: 'source', header: 'Source', cell: (l) => <span className="text-xs text-slate-500 dark:text-[var(--text-secondary)]">{l.source}</span> },
    {
      key: 'callbackTime',
      header: 'Advisor callback',
      cell: (l) => (
        l.callbackTime
          ? (
            <span className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-[var(--text-secondary)]">
              <Clock className="h-3 w-3 shrink-0" />
              {new Date(l.callbackTime).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </span>
          )
          : <span className="text-xs text-slate-300 dark:text-[var(--text-muted)]">—</span>
      ),
    },
    {
      key: 'campaign',
      header: 'Campaign',
      cell: (l) => {
        const task = latestCampaignTaskForLead(l.id, dialerTasks);
        if (!task?.name) {
          return <span className="text-xs text-slate-300 dark:text-[var(--text-muted)]">—</span>;
        }
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/voice-simulator/outbound?campaign=${encodeURIComponent(task.id)}`);
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline cursor-pointer"
            title="Open campaign in Voice Simulator"
          >
            <Megaphone className="h-3 w-3 shrink-0" /> {task.name}
          </button>
        );
      },
    },
    {
      key: 'stage',
      header: 'Stage',
      cell: (l) => <Badge color={STAGE_COLOR[l.pipelineStage || 'contact']}>{stageLabel(stages, l.pipelineStage)}</Badge>,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      cell: (l) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => advance(l, 'Qualified', 'opportunity')}
            disabled={advancingId === l.id}
            className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 hover:text-amber-700 disabled:opacity-50 px-2 py-1 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-500/10 cursor-pointer"
            title={`Advance to ${stageLabel(stages, 'opportunity')}`}
          >
            <ArrowRightCircle className="h-3.5 w-3.5" /> {stageLabel(stages, 'opportunity')}
          </button>
          <button
            onClick={() => advance(l, 'Converted', 'client')}
            disabled={advancingId === l.id}
            className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 disabled:opacity-50 px-2 py-1 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-500/10 cursor-pointer"
            title={`Mark as ${stageLabel(stages, 'client')}`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> {stageLabel(stages, 'client')}
          </button>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="Leads"
      subtitle={`Contacts currently in the ${stageLabel(stages, 'lead')} stage — advance one to ${stageLabel(stages, 'opportunity')} or ${stageLabel(stages, 'client')} as it moves forward.`}
      layout="fill"
    >
      <div className="flex-1 flex flex-col overflow-hidden px-8 pb-8 pt-6 gap-6">
        <Widget showHeader={false} padding="md">
          <FilterBar
            search={{ value: searchTerm, onChange: setSearchTerm, placeholder: 'Search lead, phone, or email…' }}
            selects={[
              {
                key: 'campaign',
                label: 'Campaign',
                value: campaignFilter,
                onChange: setCampaignFilter,
                options: [{ label: 'All campaigns', value: 'All' }, ...campaignOptions.map((t) => ({ label: t.name, value: t.id }))],
              },
              {
                key: 'source',
                label: 'Source',
                value: sourceFilter,
                onChange: setSourceFilter,
                options: [{ label: 'All sources', value: 'All' }, ...uniqueSources.map((src) => ({ label: src, value: src }))],
              },
              {
                key: 'status',
                label: 'Status',
                value: statusFilter,
                onChange: setStatusFilter,
                options: [{ label: 'All statuses', value: 'All' }, ...statusOptions.map((status) => ({ label: status, value: status }))],
              },
            ]}
            onClear={clearFilters}
            hasActiveFilters={hasActiveFilters}
            resultCount={{ filtered: filteredLeads.length, total: activeLeads.length, label: 'leads' }}
            actions={
              <button
                onClick={() => setExportOpen(true)}
                disabled={filteredLeads.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5" /> Export CSV
              </button>
            }
          />
        </Widget>
        <Widget className="flex-1" showHeader title="Leads" icon={UserPlus} accent="#2563eb" padding="none">
          {activeLeads.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              heading="No active leads right now"
              message="Contacts show up here once a call to them is actually answered and engaged with — track new prospects from Contact Directory first."
            />
          ) : filteredLeads.length === 0 ? (
            <EmptyState icon={UserPlus} heading="No leads match your search" />
          ) : (
            <DataTable bare resizable paginated columns={columns} rows={filteredLeads} rowKey={(l) => l.id} onRowClick={setSelectedLead} />
          )}
        </Widget>
      </div>

      <ContactDetailsSlideOver
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        stages={stages}
        callId={selectedLead ? latestCallIdForLead(selectedLead.id, dialerTasks) : null}
        actions={selectedLead && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => advance(selectedLead, 'Qualified', 'opportunity')}
              disabled={advancingId === selectedLead.id}
              className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 hover:text-amber-700 disabled:opacity-50 px-3 py-2 rounded-xl border border-amber-200 hover:bg-amber-50 cursor-pointer"
            >
              <ArrowRightCircle className="h-4 w-4" /> Advance to {stageLabel(stages, 'opportunity')}
            </button>
            <button
              onClick={() => advance(selectedLead, 'Converted', 'client')}
              disabled={advancingId === selectedLead.id}
              className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 disabled:opacity-50 px-3 py-2 rounded-xl border border-emerald-200 hover:bg-emerald-50 cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4" /> Mark as {stageLabel(stages, 'client')}
            </button>
          </div>
        )}
      />

      <ExportCsvModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        filename="leads"
        rows={filteredLeads}
        fields={csvFields}
      />
    </PageShell>
  );
}
