import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
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
  RefreshCw,
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
import { Campaign, CampaignStatus, Workflow } from '../types';

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
    'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/20',
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

  const [campaignName, setCampaignName] = useState('');
  const [selectedWorkflow, setSelectedWorkflow] = useState(workflows[0]?.id || '');
  const [targetLeadsCount, setTargetLeadsCount] = useState('25');

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
    };

    setCampaigns([...campaigns, launched]);
    setSelectedCampaign(launched);
    setIsLaunchModalOpen(false);
    setCampaignName('');
    setTargetLeadsCount('25');

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
      title="Campaigns"
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
        <div className="px-6 lg:px-8 py-6 space-y-6">
          {/* Overview */}
          <section className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              {
                label: 'Active campaigns',
                value: metrics.running,
                helper: `${campaigns.length} total campaigns`,
                icon: Activity,
                iconClass: 'text-emerald-600 dark:text-emerald-300',
                iconBg: 'bg-emerald-50 dark:bg-emerald-500/10',
              },
              {
                label: 'Lead pool',
                value: metrics.totalLeads.toLocaleString(),
                helper: `${totalLeadsCount.toLocaleString()} CRM leads available`,
                icon: Users,
                iconClass: 'text-blue-600 dark:text-blue-300',
                iconBg: 'bg-blue-50 dark:bg-blue-500/10',
              },
              {
                label: 'Calls completed',
                value: metrics.calledLeads.toLocaleString(),
                helper: `${overallProgress}% of campaign pool`,
                icon: PhoneCall,
                iconClass: 'text-violet-600 dark:text-violet-300',
                iconBg: 'bg-violet-50 dark:bg-violet-500/10',
              },
              {
                label: 'Connect rate',
                value: `${metrics.connectRate}%`,
                helper: `${metrics.successfulCalls} connected calls`,
                icon: TrendingUp,
                iconClass: 'text-amber-600 dark:text-amber-300',
                iconBg: 'bg-amber-50 dark:bg-amber-500/10',
              },
            ].map((metric) => {
              const MetricIcon = metric.icon;
              return (
                <div
                  key={metric.label}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-[var(--text-secondary)]">
                        {metric.label}
                      </p>
                      <p className="mt-1.5 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
                        {metric.value}
                      </p>
                    </div>
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${metric.iconBg}`}>
                      <MetricIcon className={`h-4.5 w-4.5 ${metric.iconClass}`} />
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-[var(--text-muted)]">{metric.helper}</p>
                </div>
              );
            })}
          </section>

          {/* Main workspace */}
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
            <Widget
              title="Campaign portfolio"
              subtitle="Select a campaign to inspect live performance and controls."
              icon={BarChart3}
              accent="#2563eb"
              padding="none"
              action={
                <div className="flex items-center gap-2">
                  <span className="hidden sm:inline text-[11px] text-[var(--text-muted)]">
                    {filteredCampaigns.length} of {campaigns.length}
                  </span>
                  <div className="h-8 px-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] flex items-center gap-1.5">
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
                    className="w-full h-10 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] pl-9 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
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
                    const connectRate =
                      campaign.calledLeads > 0
                        ? Math.round(
                            (campaign.successfulCalls / campaign.calledLeads) * 100,
                          )
                        : 0;

                    return (
                      <button
                        key={campaign.id}
                        type="button"
                        onClick={() => handleSelectCampaign(campaign)}
                        className={`w-full text-left p-4 sm:p-5 transition-colors group ${
                          isActive
                            ? 'bg-blue-50/70 dark:bg-blue-500/[0.06]'
                            : 'hover:bg-[var(--bg-subtle)]/60'
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div
                            className={`mt-0.5 h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border ${
                              isActive
                                ? 'bg-blue-100 border-blue-200 text-blue-600 dark:bg-blue-500/15 dark:border-blue-500/20 dark:text-blue-300'
                                : 'bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-secondary)]'
                            }`}
                          >
                            <Target className="h-4.5 w-4.5" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                                {campaign.name}
                              </h3>
                              <span
                                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10px] font-semibold ${statusStyles[campaign.status]}`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${statusDotStyles[campaign.status]}`} />
                                {campaign.status}
                              </span>
                            </div>

                            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--text-muted)]">
                              <span className="flex items-center gap-1">
                                <CalendarDays className="h-3.5 w-3.5" />
                                {new Date(campaign.createdAt).toLocaleDateString()}
                              </span>
                              <span className="flex items-center gap-1">
                                <Layers3 className="h-3.5 w-3.5" />
                                {getWorkflowName(campaign.workflowId)}
                              </span>
                              <span className="flex items-center gap-1">
                                <Users className="h-3.5 w-3.5" />
                                {campaign.totalLeads.toLocaleString()} leads
                              </span>
                            </div>

                            <div className="mt-4 flex items-center gap-3">
                              <div className="h-1.5 flex-1 max-w-[280px] overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                                <div
                                  className="h-full rounded-full bg-blue-600 transition-all"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-semibold text-[var(--text-secondary)] tabular-nums">
                                {progress}%
                              </span>
                            </div>
                          </div>

                          <div className="hidden sm:flex items-center gap-5 shrink-0">
                            <div className="text-right">
                              <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                                Connect
                              </p>
                              <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                                {connectRate}%
                              </p>
                            </div>

                            <div
                              className="flex items-center gap-1"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {campaign.status === 'Running' || campaign.status === 'Paused' ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleToggleStatus(campaign.id, campaign.status)
                                  }
                                  aria-label={
                                    campaign.status === 'Running'
                                      ? 'Pause campaign'
                                      : 'Resume campaign'
                                  }
                                  className="h-8 w-8 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors"
                                >
                                  {campaign.status === 'Running' ? (
                                    <Pause className="h-3.5 w-3.5" />
                                  ) : (
                                    <Play className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              ) : null}
                              <span className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-muted)]">
                                <MoreHorizontal className="h-4 w-4" />
                              </span>
                              <ChevronRight
                                className={`h-4 w-4 transition-transform ${
                                  isActive
                                    ? 'text-blue-500 translate-x-0.5'
                                    : 'text-[var(--text-muted)] group-hover:translate-x-0.5'
                                }`}
                              />
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="py-16 px-6 text-center">
                  <div className="mx-auto h-12 w-12 rounded-2xl bg-[var(--bg-subtle)] flex items-center justify-center">
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
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-sm overflow-hidden">
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
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold shadow-sm transition-colors"
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
                              className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]/60 p-3"
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

                      <div className="rounded-xl border border-[var(--border)] p-4">
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
                            className="h-full rounded-full bg-blue-600"
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

                        <div className="max-h-52 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-base)] p-3 space-y-2">
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
                    <div className="mx-auto h-12 w-12 rounded-2xl bg-[var(--bg-subtle)] flex items-center justify-center">
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

        {/* Launch campaign modal */}
        {isLaunchModalOpen && (
          <Modal
            open
            onClose={() => setIsLaunchModalOpen(false)}
            title="Launch outbound campaign"
            maxWidth="max-w-lg"
          >
            <form onSubmit={handleLaunchCampaign} className="space-y-5">
              <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-500/20 dark:bg-blue-500/[0.06]">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-500/15 flex items-center justify-center shrink-0">
                    <Zap className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[var(--text-primary)]">
                      Configure the dialer
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                      Choose a workflow and target pool. The campaign will start in Running
                      status after creation.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1.5">
                  Campaign name
                </label>
                <input
                  type="text"
                  required
                  value={campaignName}
                  onChange={(event) => setCampaignName(event.target.value)}
                  className="w-full h-10 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                  placeholder="e.g. Q3 Commercial Real-Estate Callbacks"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1.5">
                    Workflow
                  </label>
                  <select
                    value={selectedWorkflow}
                    onChange={(event) => setSelectedWorkflow(event.target.value)}
                    className="w-full h-10 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 text-xs text-[var(--text-primary)] outline-none focus:border-blue-500"
                  >
                    {workflows.map((workflow) => (
                      <option key={workflow.id} value={workflow.id}>
                        {workflow.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1.5">
                    Target leads
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={targetLeadsCount}
                    onChange={(event) => setTargetLeadsCount(event.target.value)}
                    className="w-full h-10 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 text-xs text-[var(--text-primary)] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--border)]">
                <p className="text-[10px] text-[var(--text-muted)]">
                  Available CRM leads: {totalLeadsCount.toLocaleString()}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsLaunchModalOpen(false)}
                    className="h-9 px-3 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm inline-flex items-center gap-1.5"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Launch campaign
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
