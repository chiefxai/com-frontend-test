import React from 'react';
import { Target, Phone, CheckCircle2, Trophy, Download } from 'lucide-react';
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

// Pipeline = the last two stages of the universal contact -> campaign ->
// lead -> opportunity -> client progression (see src/lib/pipelineStages.ts),
// managed together on one page: contacts currently being actively pursued
// ("opportunity") and contacts already won ("client"). A filtered VIEW
// over the same `leads` (Contacts) data App.tsx already manages, exactly
// like LeadsView.tsx — advancing here just edits `status` the same way a
// Contact Directory edit would, which the backend independently maps to
// the matching pipeline stage.
type SubTab = 'ongoing' | 'clients';

// Minimal shape of a dialer task ("campaign") needed here — matches
// LeadsView.tsx's identical CampaignTask.
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

interface PipelineViewProps {
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  dialerTasks?: CampaignTask[];
}

// The most recent call (by owning task's createdAt) that has a callId for
// this lead, across every campaign it's ever been part of — same data
// DialerSimulator's Workflow View reads from, just not scoped to one
// selected task here since Pipeline has no single "selected campaign".
function latestCallIdForLead(leadId: string, dialerTasks: CampaignTask[]): string | null {
  const withCallId = [...dialerTasks]
    .filter((t) => t.callResults?.[leadId]?.callId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return withCallId[0]?.callResults?.[leadId]?.callId ?? null;
}

export default function PipelineView({ leads, setLeads, dialerTasks = [] }: PipelineViewProps) {
  const { stages } = usePipelineStages();
  const [subTab, setSubTab] = React.useState<SubTab>('ongoing');
  const [advancingId, setAdvancingId] = React.useState<string | null>(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [sourceFilter, setSourceFilter] = React.useState('All');
  const [campaignFilter, setCampaignFilter] = React.useState('All');
  const [selectedLead, setSelectedLead] = React.useState<Lead | null>(null);
  const [exportOpen, setExportOpen] = React.useState(false);
  const hasActiveFilters = Boolean(searchTerm.trim()) || sourceFilter !== 'All' || campaignFilter !== 'All';
  const clearFilters = () => { setSearchTerm(''); setSourceFilter('All'); setCampaignFilter('All'); };

  const ongoing = leads.filter((l) => l.pipelineStage === 'opportunity');
  const clients = leads.filter((l) => l.pipelineStage === 'client');
  const activeSet = subTab === 'ongoing' ? ongoing : clients;

  const uniqueSources = [...new Set(activeSet.map((l) => l.source).filter(Boolean))].sort();
  const campaignOptions = [...dialerTasks].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const selectedCampaign = campaignOptions.find((t) => t.id === campaignFilter) || null;
  const filtered = activeSet.filter((l) => {
    const matchesSearch = !searchTerm ||
      l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.phone.includes(searchTerm) ||
      (l.email || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSource = sourceFilter === 'All' || l.source === sourceFilter;
    const matchesCampaign = !selectedCampaign || selectedCampaign.leadIds.includes(l.id);
    return matchesSearch && matchesSource && matchesCampaign;
  });

  // Reset the source/campaign filters (options differ between the two
  // sub-tabs) and clear the search when switching, so stale filter state
  // from "Ongoing" doesn't silently hide everything the moment someone
  // switches to "Clients".
  const switchTab = (t: SubTab) => { setSubTab(t); setSourceFilter('All'); setCampaignFilter('All'); setSearchTerm(''); };

  // Wins the deal — the only forward action from here, since "client" is
  // the terminal stage of the pipeline. Same pattern as LeadsView.tsx's
  // advance(): edits `status` like any other Contact edit (App.tsx's
  // existing sync persists it), and sets pipelineStage locally too so the
  // row moves to the Clients tab immediately instead of waiting on a resync.
  const markAsClient = (lead: Lead) => {
    setAdvancingId(lead.id);
    setLeads(leads.map((l) => (l.id === lead.id ? { ...l, status: 'Converted', pipelineStage: 'client' } : l)));
    setSelectedLead((cur) => (cur && cur.id === lead.id ? { ...cur, status: 'Converted', pipelineStage: 'client' } : cur));
    setTimeout(() => setAdvancingId(null), 400);
  };

  const csvFields: CsvField<Lead>[] = [
    { key: 'name', label: 'Name', getValue: (l) => l.name },
    { key: 'phone', label: 'Phone', getValue: (l) => formatPhone(l.phone) || l.phone },
    { key: 'email', label: 'Email', getValue: (l) => l.email },
    { key: 'source', label: 'Source', getValue: (l) => l.source },
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

  const baseColumns: Column<Lead>[] = [
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
      key: 'stage',
      header: 'Stage',
      cell: (l) => <Badge color={l.pipelineStage === 'client' ? 'green' : 'amber'}>{stageLabel(stages, l.pipelineStage)}</Badge>,
    },
  ];

  const columns: Column<Lead>[] = subTab === 'ongoing'
    ? [
        ...baseColumns,
        {
          key: 'actions',
          header: 'Actions',
          align: 'right',
          cell: (l) => (
            <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => markAsClient(l)}
                disabled={advancingId === l.id}
                className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 disabled:opacity-50 px-2 py-1 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-500/10 cursor-pointer"
                title={`Mark as ${stageLabel(stages, 'client')}`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> {stageLabel(stages, 'client')}
              </button>
            </div>
          ),
        },
      ]
    : [
        ...baseColumns,
        {
          key: 'won',
          header: 'Status',
          align: 'right',
          cell: () => (
            <span className="flex items-center justify-end gap-1 text-[11px] font-semibold text-emerald-600">
              <Trophy className="h-3.5 w-3.5" /> Won
            </span>
          ),
        },
      ];

  const subTabToggle = (
    <div className="flex items-center gap-1.5 shrink-0 bg-slate-100 dark:bg-[var(--bg-subtle)] rounded-xl p-1">
      <button
        onClick={() => switchTab('ongoing')}
        className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
          subTab === 'ongoing' ? 'bg-white dark:bg-[var(--bg-surface)] text-blue-600 shadow-sm' : 'text-slate-500 dark:text-[var(--text-muted)] hover:text-slate-700'
        }`}
      >
        <Target className="h-3.5 w-3.5" /> {stageLabel(stages, 'opportunity')} ({ongoing.length})
      </button>
      <button
        onClick={() => switchTab('clients')}
        className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
          subTab === 'clients' ? 'bg-white dark:bg-[var(--bg-surface)] text-emerald-600 shadow-sm' : 'text-slate-500 dark:text-[var(--text-muted)] hover:text-slate-700'
        }`}
      >
        <Trophy className="h-3.5 w-3.5" /> {stageLabel(stages, 'client')}s ({clients.length})
      </button>
    </div>
  );

  return (
    <PageShell
      title="Pipeline"
      subtitle={`Manage ${stageLabel(stages, 'opportunity')} and ${stageLabel(stages, 'client')} contacts in one place.`}
      layout="fill"
      action={subTabToggle}
    >
      <div className="flex-1 flex flex-col overflow-hidden px-8 pb-8 pt-6">
        <Widget className="flex-1" showHeader={false} padding="none">
          <div className="border-b border-[var(--border)] bg-[var(--bg-surface)] p-4">
            <FilterBar
              search={{ value: searchTerm, onChange: setSearchTerm, placeholder: 'Search by name, phone, or email…' }}
              selects={[
                { key: 'campaign', label: 'Campaign', value: campaignFilter, onChange: setCampaignFilter, options: [{ label: 'All campaigns', value: 'All' }, ...campaignOptions.map((t) => ({ label: t.name, value: t.id }))] },
                { key: 'source', label: 'Source', value: sourceFilter, onChange: setSourceFilter, options: [{ label: 'All sources', value: 'All' }, ...uniqueSources.map((src) => ({ label: src, value: src }))] },
              ]}
              onClear={clearFilters}
              hasActiveFilters={hasActiveFilters}
              resultCount={{ filtered: filtered.length, total: activeSet.length, label: subTab === 'ongoing' ? stageLabel(stages, 'opportunity') : stageLabel(stages, 'client') }}
              actions={
                <button onClick={() => setExportOpen(true)} disabled={filtered.length === 0} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap">
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </button>
              }
            />
          </div>

          {activeSet.length === 0 ? (
            <EmptyState icon={subTab === 'ongoing' ? Target : Trophy} heading={subTab === 'ongoing' ? `No ${stageLabel(stages, 'opportunity').toLowerCase()} contacts yet` : `No ${stageLabel(stages, 'client').toLowerCase()}s yet`} message={subTab === 'ongoing' ? `Advance a lead to ${stageLabel(stages, 'opportunity')} from the Leads page once it's worth pursuing.` : `Contacts show up here once they're marked ${stageLabel(stages, 'client')}.`} />
          ) : filtered.length === 0 ? (
            <EmptyState heading="No contacts match your search" />
          ) : (
            <DataTable bare resizable paginated columns={columns} rows={filtered} rowKey={(l) => l.id} onRowClick={setSelectedLead} />
          )}
        </Widget>
      </div>
      <ContactDetailsSlideOver
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        stages={stages}
        callId={selectedLead ? latestCallIdForLead(selectedLead.id, dialerTasks) : null}
        actions={selectedLead && selectedLead.pipelineStage !== 'client' && (
          <button
            onClick={() => markAsClient(selectedLead)}
            disabled={advancingId === selectedLead.id}
            className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 disabled:opacity-50 px-3 py-2 rounded-xl border border-emerald-200 hover:bg-emerald-50 cursor-pointer"
          >
            <CheckCircle2 className="h-4 w-4" /> Mark as {stageLabel(stages, 'client')}
          </button>
        )}
      />

      <ExportCsvModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        filename={subTab === 'ongoing' ? 'opportunities' : 'clients'}
        rows={filtered}
        fields={csvFields}
      />
    </PageShell>
  );
}
