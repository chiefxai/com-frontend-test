import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Filter,
  FolderPlus,
  Gauge,
  Layers3,
  MoreHorizontal,
  Pause,
  PhoneCall,
  Play,
  Search,
  Target,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import PageShell from './ui/PageShell';
import Widget from './ui/Widget';
import Modal from './ui/Modal';
import IconButton from './ui/IconButton';
import { Campaign, CampaignRetryConfig, CampaignStatus, Workflow } from '../types';

interface CampaignViewProps {
  campaigns: Campaign[];
  setCampaigns: React.Dispatch<React.SetStateAction<Campaign[]>>;
  workflows: Workflow[];
  totalLeadsCount: number;
}

type CampaignFilter = 'All' | CampaignStatus;

const statusStyles: Record<CampaignStatus, string> = {
  Running:
    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20',
  Paused:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20',
  Completed:
    'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20',
  Draft:
    'bg-[var(--bg-subtle)] text-slate-600 border-[var(--border)] dark:bg-[var(--bg-base)]0/10 dark:text-slate-300 dark:border-slate-500/20',
};

const statusDotStyles: Record<CampaignStatus, string> = {
  Running: 'bg-emerald-500',
  Paused: 'bg-amber-500',
  Completed: 'bg-blue-500',
  Draft: 'bg-slate-400',
};

export default function CampaignView({
  campaigns,
  setCampaigns,
  workflows,
  totalLeadsCount,
}: CampaignViewProps) {
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(
    campaigns[0] || null,
  );
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [campaignFilter, setCampaignFilter] = useState<CampaignFilter>('All');
  const navigate = useNavigate();

  const [campaignName, setCampaignName] = useState('');
  const [selectedWorkflow, setSelectedWorkflow] = useState(workflows[0]?.id || '');
  const [targetLeadsCount, setTargetLeadsCount] = useState('25');
  const [retryConfig, setRetryConfig] = useState<CampaignRetryConfig>({
    enabled: true,
    strategy: 'exponential',
    intervalMinutes: 120,
    maxRetries: 3,
    quietHoursStart: '21:00',
    quietHoursEnd: '08:00',
  });

  const filteredCampaigns = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return campaigns.filter((campaign) => {
      const matchesStatus =
        campaignFilter === 'All' || campaign.status === campaignFilter;
      const matchesSearch =
        !query ||
        campaign.name.toLowerCase().includes(query) ||
        campaign.id.toLowerCase().includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [campaigns, campaignFilter, searchQuery]);

  const metrics = useMemo(() => {
    const totalLeads = campaigns.reduce((sum, campaign) => sum + campaign.totalLeads, 0);
    const calledLeads = campaigns.reduce((sum, campaign) => sum + campaign.calledLeads, 0);
    const successfulCalls = campaigns.reduce(
      (sum, campaign) => sum + campaign.successfulCalls,
      0,
    );
    const running = campaigns.filter((campaign) => campaign.status === 'Running').length;
    const connectRate = calledLeads > 0 ? Math.round((successfulCalls / calledLeads) * 100) : 0;

    return { totalLeads, calledLeads, successfulCalls, running, connectRate };
  }, [campaigns]);

  const getWorkflowName = (workflowId: string) =>
    workflows.find((workflow) => workflow.id === workflowId)?.name || 'Unassigned workflow';

  const handleSelectCampaign = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    const progressPercent =
      campaign.totalLeads > 0
        ? Math.round((campaign.calledLeads / campaign.totalLeads) * 100)
        : 0;

    setLogs([
      `Viewing campaign details: "${campaign.name}".`,
      `Workflow Ruleset: ${getWorkflowName(campaign.workflowId)}.`,
      `Currently mapped progress: ${progressPercent}% complete.`,
    ]);
  };

  const handleLaunchCampaign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignName.trim()) return;

    const launched: Campaign = {
      id: `C-00${campaigns.length + 1}`,
      name: campaignName.trim(),
      status: 'Running',
      workflowId: selectedWorkflow,
      totalLeads: Math.max(0, parseInt(targetLeadsCount, 10) || 0),
      calledLeads: 0,
      successfulCalls: 0,
      createdAt: new Date().toISOString(),
      retryConfig: { ...retryConfig },
    };

    setCampaigns([...campaigns, launched]);
    setSelectedCampaign(launched);
    setIsLaunchModalOpen(false);
    setCampaignName('');
    setTargetLeadsCount('25');
    setRetryConfig({ enabled: true, strategy: 'exponential', intervalMinutes: 120, maxRetries: 3, quietHoursStart: '21:00', quietHoursEnd: '08:00' });

    setLogs([
      `Dialer initiated for Campaign: "${launched.name}".`,
      'Loading rules from visual workflow...',
      `Dialing pool containing ${launched.totalLeads} active CRM leads.`,
      'Active voice channel status: POOL RUNNING.',
    ]);
  };

  const handleToggleStatus = (campId: string, currentStatus: CampaignStatus) => {
    const nextStatus: CampaignStatus =
      currentStatus === 'Running'
        ? 'Paused'
        : currentStatus === 'Paused'
          ? 'Running'
          : currentStatus;

    if (nextStatus === currentStatus) return;

    const updated = campaigns.map((campaign) =>
      campaign.id === campId ? { ...campaign, status: nextStatus } : campaign,
    );

    setCampaigns(updated);

    const updatedCampaign = updated.find((campaign) => campaign.id === campId);
    if (updatedCampaign) {
      setSelectedCampaign(updatedCampaign);
      setLogs((previous) => [
        `Campaign status updated manually to [${nextStatus}].`,
        ...previous,
      ]);
    }
  };

  const handleSimulateDialAction = () => {
    if (!selectedCampaign || selectedCampaign.status !== 'Running') {
      alert('Campaign is not in RUNNING status.');
      return;
    }

    const updated = campaigns.map((campaign) => {
      if (campaign.id !== selectedCampaign.id) return campaign;

      const nextCalled = Math.min(campaign.totalLeads, campaign.calledLeads + 1);
      const nextSuccess =
        nextCalled > campaign.calledLeads && Math.random() > 0.4
          ? campaign.successfulCalls + 1
          : campaign.successfulCalls;

      return {
        ...campaign,
        calledLeads: nextCalled,
        successfulCalls: nextSuccess,
      };
    });

    setCampaigns(updated);

    const updatedCampaign = updated.find((campaign) => campaign.id === selectedCampaign.id);
    if (updatedCampaign) {
      setSelectedCampaign(updatedCampaign);
      const isSuccess =
        updatedCampaign.successfulCalls > selectedCampaign.successfulCalls;

      setLogs((previous) => [
        `[${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}] ${isSuccess
          ? 'Customer connected — AI routed an interested lead.'
          : 'Dial unanswered — customer busy/voicemail. Re-queued.'}`,
        ...previous,
      ]);
    }
  };

  const overallProgress =
    metrics.totalLeads > 0
      ? Math.round((metrics.calledLeads / metrics.totalLeads) * 100)
      : 0;

  return (
    <PageShell
      title={
        isLaunchModalOpen ? (
          <span className="flex min-w-0 items-center gap-2">
            <button type="button" onClick={() => navigate('/campaign')} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer">Campaign</button>
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            <span className="truncate text-[var(--text-primary)]">New outbound campaign</span>
          </span>
        ) : 'Outbound campaigns'
      }
      subtitle="Launch, monitor, and optimize AI-powered outbound campaigns."
      layout="fill"
      action={
        <IconButton
          icon={FolderPlus}
          label="Launch AI Campaign"
          onClick={() => setIsLaunchModalOpen(true)}
        />
      }
    >
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-6">
          {/* Main workspace */}
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
            <Widget
              title="Campaign portfolio"
              subtitle="Select a campaign to inspect live performance and controls."
              icon={BarChart3}
              accent="#2563eb"
              padding="none"
              action={
                <div className="flex items-center gap-2 overflow-x-auto">
                  <div className="hidden xl:flex items-center gap-1.5 shrink-0">
                    <span className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-[10px]">
                      <span className="font-semibold text-[var(--text-primary)]">{metrics.running}</span>
                      <span className="ml-1 text-[var(--text-muted)]">active</span>
                    </span>
                    <span className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-[10px]">
                      <span className="font-semibold text-[var(--text-primary)]">{metrics.totalLeads.toLocaleString()}</span>
                      <span className="ml-1 text-[var(--text-muted)]">leads</span>
                    </span>
                    <span className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-[10px]">
                      <span className="font-semibold text-[var(--text-primary)]">{metrics.calledLeads.toLocaleString()}</span>
                      <span className="ml-1 text-[var(--text-muted)]">completed</span>
                    </span>
                    <span className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-[10px]">
                      <span className="font-semibold text-[var(--text-primary)]">{metrics.connectRate}%</span>
                      <span className="ml-1 text-[var(--text-muted)]">connect</span>
                    </span>
                  </div>
                  <span className="hidden sm:inline text-[11px] text-[var(--text-muted)] shrink-0">
                    {filteredCampaigns.length} of {campaigns.length}
                  </span>
                  <div className="h-8 px-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] flex items-center gap-1.5 shrink-0">
                    <Filter className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    <select
                      value={campaignFilter}
                      onChange={(event) =>
                        setCampaignFilter(event.target.value as CampaignFilter)
                      }
                      className="bg-transparent text-[11px] font-medium text-[var(--text-primary)] outline-none cursor-pointer"
                    >
                      <option value="All">All status</option>
                      <option value="Running">Running</option>
                      <option value="Paused">Paused</option>
                      <option value="Completed">Completed</option>
                      <option value="Draft">Draft</option>
                    </select>
                  </div>
                </div>
              }
            >
              <div className="border-b border-[var(--border)] p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search campaigns by name or ID..."
                    className="w-full h-10 rounded-[9px] border border-[var(--border)] bg-[var(--bg-subtle)] pl-9 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15"
                  />
                </div>
              </div>

              {filteredCampaigns.length > 0 ? (
                <div className="divide-y divide-[var(--border)]">
                  {filteredCampaigns.map((campaign) => {
                    const isActive = selectedCampaign?.id === campaign.id;
                    const progress =
                      campaign.totalLeads > 0
                        ? Math.round((campaign.calledLeads / campaign.totalLeads) * 100)
                        : 0;
                    return (
                      <button
                        key={campaign.id}
                        type="button"
                        onClick={() => handleSelectCampaign(campaign)}
                        className={`w-full text-left px-3 py-2 transition-colors group ${
                          isActive
                            ? 'bg-blue-50 border-l-2 border-blue-500 shadow-[inset_0_0_0_1px_rgba(37,99,235,0.10)] dark:bg-blue-500/[0.08] dark:border-blue-400'
                            : 'hover:bg-[var(--bg-subtle)]/60'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-xs font-semibold text-[var(--text-primary)] truncate">
                                {campaign.name}
                              </h3>
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-semibold ${statusStyles[campaign.status]}`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${statusDotStyles[campaign.status]}`} />
                                {campaign.status}
                              </span>
                            </div>

                            <div className="mt-0.5 flex items-center justify-between gap-2 text-[9px] text-[var(--text-muted)]">
                              <span>
                                {campaign.calledLeads.toLocaleString()} dialed · {Math.max(0, campaign.totalLeads - campaign.calledLeads).toLocaleString()} pending
                              </span>
                              <span className="font-semibold tabular-nums">{progress}%</span>
                            </div>

                            <div className="mt-1 flex items-center gap-2">
                              <div className="h-0.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                                <div
                                  className="h-full rounded-full bg-[image:var(--brand-gradient)] transition-all"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          <ChevronRight
                            className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                              isActive
                                ? 'text-blue-500 translate-x-0.5'
                                : 'text-[var(--text-muted)] group-hover:translate-x-0.5'
                            }`}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="py-16 px-6 text-center">
                  <div className="mx-auto h-12 w-12 rounded-[14px] bg-[var(--bg-subtle)] flex items-center justify-center">
                    <Search className="h-5 w-5 text-[var(--text-muted)]" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-[var(--text-primary)]">
                    No campaigns found
                  </h3>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Try another search or status filter.
                  </p>
                </div>
              )}
            </Widget>

            {/* Campaign inspector */}
            <div className="xl:sticky xl:top-4">
              <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] shadow-sm overflow-hidden">
                {selectedCampaign ? (
                  <>
                    <div className="p-5 border-b border-[var(--border)]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                              Campaign inspector
                            </span>
                          </div>
                          <h2 className="mt-2 text-base font-semibold text-[var(--text-primary)] truncate">
                            {selectedCampaign.name}
                          </h2>
                          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                            {selectedCampaign.id} · {getWorkflowName(selectedCampaign.workflowId)}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="h-8 w-8 rounded-lg border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mt-5 flex items-center justify-between">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-semibold ${statusStyles[selectedCampaign.status]}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${statusDotStyles[selectedCampaign.status]}`}
                          />
                          {selectedCampaign.status}
                        </span>

                        {selectedCampaign.status === 'Running' && (
                          <button
                            type="button"
                            onClick={handleSimulateDialAction}
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[image:var(--brand-gradient)] hover:brightness-[1.03] text-white text-[11px] font-semibold shadow-sm transition-colors"
                          >
                            <Zap className="h-3.5 w-3.5" />
                            Simulate dial
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="p-5 space-y-5">
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: 'Dials', value: selectedCampaign.calledLeads, icon: PhoneCall },
                          {
                            label: 'Connected',
                            value: selectedCampaign.successfulCalls,
                            icon: CheckCircle2,
                          },
                          { label: 'Pool', value: selectedCampaign.totalLeads, icon: Users },
                        ].map((stat) => {
                          const StatIcon = stat.icon;
                          return (
                            <div
                              key={stat.label}
                              className="rounded-[9px] border border-[var(--border)] bg-[var(--bg-subtle)]/60 p-3"
                            >
                              <StatIcon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                              <p className="mt-2 text-lg font-semibold text-[var(--text-primary)] tabular-nums">
                                {stat.value.toLocaleString()}
                              </p>
                              <p className="text-[10px] text-[var(--text-muted)]">{stat.label}</p>
                            </div>
                          );
                        })}
                      </div>

                      <div className="rounded-[9px] border border-[var(--border)] p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Gauge className="h-4 w-4 text-blue-500" />
                            <span className="text-xs font-semibold text-[var(--text-primary)]">
                              Campaign progress
                            </span>
                          </div>
                          <span className="text-xs font-semibold text-[var(--text-secondary)]">
                            {selectedCampaign.totalLeads > 0
                              ? Math.round(
                                  (selectedCampaign.calledLeads /
                                    selectedCampaign.totalLeads) *
                                    100,
                                )
                              : 0}
                            %
                          </span>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[image:var(--brand-gradient)]"
                            style={{
                              width: `${
                                selectedCampaign.totalLeads > 0
                                  ? Math.round(
                                      (selectedCampaign.calledLeads /
                                        selectedCampaign.totalLeads) *
                                        100,
                                    )
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                        <div className="mt-3 flex justify-between text-[10px] text-[var(--text-muted)]">
                          <span>
                            {selectedCampaign.calledLeads.toLocaleString()} called
                          </span>
                          <span>
                            {Math.max(
                              0,
                              selectedCampaign.totalLeads - selectedCampaign.calledLeads,
                            ).toLocaleString()}{' '}
                            remaining
                          </span>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="text-xs font-semibold text-[var(--text-primary)]">
                              Live activity
                            </p>
                            <p className="text-[10px] text-[var(--text-muted)]">
                              Latest dialer events
                            </p>
                          </div>
                          <Activity className="h-4 w-4 text-emerald-500" />
                        </div>

                        <div className="max-h-52 overflow-y-auto rounded-[9px] border border-[var(--border)] bg-[var(--bg-base)] p-3 space-y-2">
                          {logs.length > 0 ? (
                            logs.map((log, index) => (
                              <div
                                key={`${log}-${index}`}
                                className="flex items-start gap-2 text-[10px] leading-relaxed text-[var(--text-secondary)]"
                              >
                                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                                <span>{log}</span>
                              </div>
                            ))
                          ) : (
                            <div className="py-6 text-center text-[10px] text-[var(--text-muted)]">
                              No activity recorded yet.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="px-5 py-3.5 border-t border-[var(--border)] flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        Created {new Date(selectedCampaign.createdAt).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        View details <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="py-20 px-6 text-center">
                    <div className="mx-auto h-12 w-12 rounded-[14px] bg-[var(--bg-subtle)] flex items-center justify-center">
                      <Target className="h-5 w-5 text-[var(--text-muted)]" />
                    </div>
                    <p className="mt-4 text-sm font-semibold text-[var(--text-primary)]">
                      Select a campaign
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Choose a campaign from the portfolio to inspect it.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* New outbound campaign */}
        {isLaunchModalOpen && (
          <Modal
            open
            onClose={() => setIsLaunchModalOpen(false)}
            title="New outbound campaign"
            maxWidth="max-w-3xl"
          >
            <form onSubmit={handleLaunchCampaign} className="flex max-h-[80vh] flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="overflow-hidden rounded-2xl border border-cyan-200/70 bg-gradient-to-br from-cyan-50 via-blue-50/70 to-violet-50/70 p-5 shadow-sm dark:border-cyan-400/20 dark:from-cyan-500/[0.08] dark:via-blue-500/[0.06] dark:to-violet-500/[0.08]">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/80 text-blue-600 shadow-sm ring-1 ring-white/70 dark:bg-white/10 dark:text-cyan-300 dark:ring-white/10">
                      <Zap className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Set up your outbound campaign</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                        Give the campaign a clear name, choose the workflow that should handle calls, and define the initial lead pool.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-5">
                  <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 shadow-sm transition-shadow hover:shadow-md">
                    <div className="mb-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">1. Campaign details</p>
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">Use a name your team can recognize later.</p>
                    </div>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-[var(--text-primary)]">
                        Campaign name <span className="text-rose-500">*</span>
                      </span>
                      <input
                        type="text"
                        required
                        autoFocus
                        value={campaignName}
                        onChange={(event) => setCampaignName(event.target.value)}
                        className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                        placeholder="e.g. Q3 Commercial Real-Estate Callbacks"
                      />
                      <span className="mt-1.5 block text-[10px] text-[var(--text-muted)]">Keep it specific enough to identify the audience or purpose.</span>
                    </label>
                  </section>

                  <section className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] p-4 sm:p-5">
                    <div className="mb-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">2. Calling setup</p>
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">Choose the workflow and how many leads should be included.</p>
                    </div>
                    <div className="space-y-4">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-[var(--text-primary)]">Workflow</span>
                        <select
                          value={selectedWorkflow}
                          onChange={(event) => setSelectedWorkflow(event.target.value)}
                          className="h-11 w-full rounded-[9px] border border-[var(--border)] bg-[var(--bg-subtle)] px-3.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                        >
                          {workflows.length === 0 && <option value="">No workflows available</option>}
                          {workflows.map((workflow) => (
                            <option key={workflow.id} value={workflow.id}>{workflow.name}</option>
                          ))}
                        </select>
                        <span className="mt-1.5 block text-[10px] text-[var(--text-muted)]">This determines the rules and conversation flow used by the AI.</span>
                      </label>

                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-[var(--text-primary)]">Target leads</span>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max={totalLeadsCount || undefined}
                            value={targetLeadsCount}
                            onChange={(event) => setTargetLeadsCount(event.target.value)}
                            className="h-11 w-full rounded-[9px] border border-[var(--border)] bg-[var(--bg-subtle)] px-3.5 pr-24 text-sm text-[var(--text-primary)] outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-[var(--text-muted)]">
                            / {totalLeadsCount.toLocaleString()} available
                          </span>
                        </div>
                        <span className="mt-1.5 block text-[10px] text-[var(--text-muted)]">Set the initial number of CRM leads for this campaign.</span>
                      </label>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">3. Retry mechanism</p>
                        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                          Controls automatic retries for No Answer / Answering Machine outcomes. Caller-requested callbacks remain separate.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={retryConfig.enabled}
                        onClick={() => setRetryConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
                        className={`relative h-6 w-11 rounded-full transition-colors ${retryConfig.enabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                      >
                        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${retryConfig.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>

                    {retryConfig.enabled && (
                      <div className="mt-4 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <label className="block">
                            <span className="block text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">Retry pattern</span>
                            <select
                              value={retryConfig.strategy}
                              onChange={(e) => setRetryConfig((prev) => ({ ...prev, strategy: e.target.value as CampaignRetryConfig['strategy'] }))}
                              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)]"
                            >
                              <option value="exponential">Gradual — 2h, 4h, 8h…</option>
                              <option value="fixed">Same interval each time</option>
                            </select>
                          </label>
                          <label className="block">
                            <span className="block text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">First retry after</span>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={0.25}
                                max={24}
                                step={0.25}
                                value={retryConfig.intervalMinutes / 60}
                                onChange={(e) => setRetryConfig((prev) => ({ ...prev, intervalMinutes: Math.max(15, Number(e.target.value || 2) * 60) }))}
                                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)]"
                              />
                              <span className="text-xs text-[var(--text-muted)] shrink-0">hours</span>
                            </div>
                          </label>
                          <label className="block">
                            <span className="block text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">Maximum retries</span>
                            <input
                              type="number"
                              min={0}
                              max={10}
                              step={1}
                              value={retryConfig.maxRetries}
                              onChange={(e) => setRetryConfig((prev) => ({ ...prev, maxRetries: Math.max(0, Math.min(10, Number(e.target.value || 0))) }))}
                              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)]"
                            />
                          </label>
                        </div>

                        <div className="flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-3 py-2.5">
                          <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                          <div className="text-[11px] text-amber-800 dark:text-amber-200">
                            <span className="font-semibold">Quiet hours: 9:00 PM–8:00 AM.</span> Retries are delayed until 8:00 AM in the contact's local timezone.
                          </div>
                        </div>

                        <p className="text-[11px] text-[var(--text-muted)]">
                          {retryConfig.strategy === 'exponential'
                            ? `Retries will run at ${retryConfig.intervalMinutes / 60}h → ${retryConfig.intervalMinutes / 30}h → ${retryConfig.intervalMinutes / 15}h…`
                            : `Each retry waits ${retryConfig.intervalMinutes / 60}h.`}
                          {' '}The initial call is not counted as a retry.
                        </p>
                      </div>
                    )}
                  </section>

                  <section className="rounded-2xl border border-emerald-200/60 bg-emerald-50/40 p-5 shadow-sm dark:border-emerald-500/15 dark:bg-emerald-500/[0.05]">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      <div>
                        <p className="text-xs font-semibold text-[var(--text-primary)]">Ready to launch</p>
                        <p className="mt-1 text-[11px] leading-5 text-[var(--text-muted)]">
                          The campaign will be created with the selected workflow and lead pool. Review your details before launching.
                        </p>
                      </div>
                    </div>
                  </section>
                </div>
              </div>

              <div className="mt-4 flex shrink-0 flex-col-reverse gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[10px] leading-4 text-[var(--text-muted)]">
                  Available CRM leads: {totalLeadsCount.toLocaleString()}
                </p>
                <div className="flex w-full gap-2 sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setIsLaunchModalOpen(false)}
                    className="h-10 flex-1 rounded-[9px] border border-[var(--border)] bg-[var(--bg-surface)] px-4 text-xs font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--bg-subtle)] sm:flex-none"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="h-10 flex-1 rounded-[9px] bg-[image:var(--brand-gradient)] px-5 text-xs font-semibold text-white shadow-md transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                    disabled={!campaignName.trim()}
                  >
                    <span className="inline-flex items-center justify-center gap-1.5">
                      <Play className="h-3.5 w-3.5" />
                      Launch campaign
                    </span>
                  </button>
                </div>
              </div>
            </form>
          </Modal>
        )}
      </div>
    </PageShell>
  );
}
