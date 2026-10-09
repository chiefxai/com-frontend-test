import React, { useState, useEffect } from 'react';
import {
  Settings,
  Phone,
  Users,
  CreditCard,
  Key,
  Trash2,
  ArrowLeft,
  CheckCircle,
  FileText,
  Clock,
  UserPlus,
  DollarSign,
  Briefcase,
  Loader2,
  Flag,
  Hash,
  ScrollText,
  Plus,
  X,
} from 'lucide-react';
import { apiFetch, getApiBase } from '../lib/api';
import { useAuthorization } from '../lib/authorization';
import { useRefresh } from '../lib/RefreshContext';
import { VirtualNumber, TeamMember, OrganizationSettings, UserRole } from '../types';
import { COST_PER_MINUTE_INR_FALLBACK, formatInr } from '../lib/pricing';
import { FEATURE_REGISTRY } from '../features/feature-flags/registry';
import FlagGroupPicker from './ui/FlagGroupPicker';
import IconButton from './ui/IconButton';
import PageShell from './ui/PageShell';
import BreadcrumbTitle from './ui/BreadcrumbTitle';
import Widget from './ui/Widget';
import Modal from './ui/Modal';
import SlideOver from './ui/SlideOver';
import DataTable, { Column } from './ui/DataTable';
import FilterBar from './ui/FilterBar';
import KpiCard from './ui/KpiCard';
import WorkspaceManagement from './WorkspaceManagement';
import WorkspaceSharing from './WorkspaceSharing';
import OrganizationTopUp, { type BillingPanel } from './billing/OrganizationTopUp';

interface SettingsViewProps {
  virtualNumbers: VirtualNumber[];
  setVirtualNumbers: React.Dispatch<React.SetStateAction<VirtualNumber[]>>;
  teamMembers: TeamMember[];
  setTeamMembers: React.Dispatch<React.SetStateAction<TeamMember[]>>;
  orgSettings: OrganizationSettings;
  setOrgSettings: React.Dispatch<React.SetStateAction<OrganizationSettings>>;
  costPerMinuteInr?: number;
  phoneCostPerMinute?: number;
  // Platform-set (super admin "Cost" page) AI-token cost and call-provider
  // rate for this org's current billing period. aiTokenCost is the SUM of
  // what was actually charged per session, locked in at finalize time —
  // a later rate change never retroactively re-prices it. aiTokenCurrentRate
  // is today's configured rate, shown separately for reference. Null when
  // not yet priced.
  aiTokenCost?: { baseCost: number; taxAmount: number; totalCost: number; pricedSessionCount: number; sessionCount: number } | null;
  aiTokenCurrentRate?: { key: string; label: string; ratePer1kTokens: number; tokenUnit: number; taxPercent: number } | null;
  aiTokenUsage?: { totalTokens: number; totalInputTokens: number; totalOutputTokens: number; callCount: number } | null;
  callProviderRate?: { key: string; label: string; rateUnit: 'minute' | 'hour'; rateAmount: number; taxPercent: number } | null;
  // False when this org connected its own Vobiz account (Settings >
  // Numbers) — phoneCharges is then only an estimate for reference,
  // never something owed to the platform. Defaults true (billable).
  phoneChargesBillable?: boolean;
  // Recharge-based wallet balance. This is shown only when the organization
  // is configured for recharge_based billing.
  activeSubTab?: 'numbers' | 'team' | 'workspaces' | 'billing' | 'api';
  setActiveSubTab?: (sub: string) => void;
  currentUserEmail?: string;
  multipleWorkspacesEnabled?: boolean;
  workspaceSharingEnabled?: boolean;
  onWorkspaceCreated?: () => Promise<void>;
}

interface AuditEntry {
  id: string;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface WorkspaceMemberAssignment {
  memberId: string;
  name: string | null;
  email: string | null;
  organizationRole: string;
  memberStatus: string;
  workspaceRole: string | null;
  assignmentStatus: string | null;
  roleSource: string | null;
}

/** Format billing-period call duration without showing misleading decimal hours. */
function formatCallTime(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return '—';
  const seconds = Math.max(0, Math.round(minutes * 60));
  if (seconds < 60) return `${seconds}s`;
  const hours = Math.floor(seconds / 3600);
  const restMinutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${restMinutes}m` : `${Math.round(seconds / 60)}m`;
}

function ProviderBadge({ provider }: { provider: string }) {
  const p = (provider || '').toLowerCase();
  if (p === 'vobiz.ai' || p === 'vobiz') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
        <span className="h-3 w-3 rounded bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-black text-[8px] shrink-0">V</span>
        Vobiz.ai
      </span>
    );
  }
  return <span className="text-xs font-mono text-slate-500">{provider}</span>;
}

export default function SettingsView({
  virtualNumbers,
  setVirtualNumbers,
  teamMembers,
  setTeamMembers,
  orgSettings,
  setOrgSettings,
  costPerMinuteInr = COST_PER_MINUTE_INR_FALLBACK,
  phoneCostPerMinute = 8,
  aiTokenCost = null,
  aiTokenCurrentRate = null,
  aiTokenUsage = null,
  callProviderRate = null,
  phoneChargesBillable = true,
  activeSubTab: activeSubTabProp,
  setActiveSubTab: setActiveSubTabProp,
  currentUserEmail,
  multipleWorkspacesEnabled = false,
  workspaceSharingEnabled = false,
  onWorkspaceCreated = async () => {},
}: SettingsViewProps) {
  const { can } = useAuthorization();
  const canReadOrganization = can('organization.read');
  const canReadOrgMembers = can('organization.members.read');
  const canManageOrgMembers = can('organization.members.manage');
  const canManageWorkspaceMembers = can('workspace.members.manage');
  // Use prop-controlled sub-tab when provided (driven by sidebar), fall back to internal state.
  const [_internalSubTab, _setInternalSubTab] = useState<'numbers' | 'team' | 'workspaces' | 'billing' | 'api'>('numbers');
  const subTab = (activeSubTabProp as 'numbers' | 'team' | 'workspaces' | 'billing' | 'api') || _internalSubTab;
  const [billingPanel, setBillingPanel] = useState<BillingPanel>('dashboard');
  const [workspacePanel, setWorkspacePanel] = useState<'overview' | 'numbers' | 'sharing'>('overview');
  const [selectedWorkspaceDetails, setSelectedWorkspaceDetails] = useState<{ id: string; name: string; status: string; industry?: string; branchName?: string | null } | null>(null);
  const [selectedNumberDetails, setSelectedNumberDetails] = useState<VirtualNumber | null>(null);
  const [workspaceDetailsTab, setWorkspaceDetailsTab] = useState<'overview' | 'members' | 'numbers'>('overview');
  const [detailHistory, setDetailHistory] = useState<Array<{
    workspace: typeof selectedWorkspaceDetails;
    number: VirtualNumber | null;
    member: TeamMember | null;
  }>>([]);

  // Workspace feature grants are read-only here: they are combined with
  // each staff member's organization grants and workspace-specific role.
  const [workspaceFeatureRows, setWorkspaceFeatureRows] = useState<{id:string;name:string;configured:boolean;enabledFeatures:string[]}[]>([]);
  const [workspaceFeatureAllowed, setWorkspaceFeatureAllowed] = useState<string[]>([]);
  const [workspaceFeatureLoading, setWorkspaceFeatureLoading] = useState(false);
  const [workspaceFeatureError, setWorkspaceFeatureError] = useState('');
  const loadWorkspaceFeatures = React.useCallback(async () => {
    setWorkspaceFeatureLoading(true);
    try {
      const response = await apiFetch('/api/settings/organization/workspace-features');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load workspace features.');
      setWorkspaceFeatureRows(Array.isArray(data.workspaces) ? data.workspaces : []);
      setWorkspaceFeatureAllowed(Array.isArray(data.availableFeatures) ? data.availableFeatures : []);
      setWorkspaceFeatureError('');
    } catch (error) {
      setWorkspaceFeatureRows([]);
      setWorkspaceFeatureAllowed([]);
      setWorkspaceFeatureError(error instanceof Error ? error.message : 'Could not load workspace features.');
    } finally {
      setWorkspaceFeatureLoading(false);
    }
  }, []);
  React.useEffect(() => {
    if (!['team','numbers','workspaces'].includes(subTab) || !canReadOrgMembers || !canReadOrganization) return;
    void loadWorkspaceFeatures();
  }, [subTab, canReadOrgMembers, canReadOrganization, loadWorkspaceFeatures]);

  const [organizationNumbers, setOrganizationNumbers] = useState<VirtualNumber[] | null>(null);
  const [organizationNumbersError, setOrganizationNumbersError] = useState('');
  const loadOrganizationNumbers = React.useCallback(async () => {
    const response = await apiFetch('/api/settings/organization/numbers');
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to load numbers across the organization.');
    setOrganizationNumbers(Array.isArray(data.rows) ? data.rows : []);
    if (Array.isArray(data.workspaces)) setOrgWorkspaces(data.workspaces);
    setOrganizationNumbersError('');
  }, []);
  const visibleNumbers = organizationNumbers || virtualNumbers;
  const [numberSearch, setNumberSearch] = useState('');
  const [numberProvider, setNumberProvider] = useState('');
  const [numberStatus, setNumberStatus] = useState('');
  const [numberWorkspace, setNumberWorkspace] = useState('');
  const numberWorkspaceId = (number: VirtualNumber) => {
    const record = number as VirtualNumber & { workspaceId?: string | null; workspace_id?: string | null };
    return record.workspaceId || record.workspace_id || '';
  };
  const filteredNumbers = visibleNumbers.filter(number =>
    (!numberSearch || `${number.number} ${number.friendlyName || ''}`.toLowerCase().includes(numberSearch.toLowerCase().trim())) &&
    (!numberProvider || number.provider === numberProvider) &&
    (!numberStatus || number.status === numberStatus) &&
    (!numberWorkspace || (numberWorkspace === '__unknown__' ? !numberWorkspaceId(number) : numberWorkspaceId(number) === numberWorkspace)));
  const exportFilteredNumbers = () => {
    const csvField = (value: unknown) => {
      const content = String(value ?? '').replace(/^[\s]*[=+\-@]/, match => "'" + match);
      return `"${content.replace(/"/g, '""')}"`;
    };
    const rows = [['Number','Label','Provider','Status','Workspace','Incoming Calls','Outgoing Calls'],
      ...filteredNumbers.map(number => [
        number.number, number.friendlyName, number.provider, number.status,
        orgWorkspaces.find(workspace => workspace.id === numberWorkspaceId(number))?.name || 'Unknown',
        number.incomingCallCount, number.outgoingCallCount,
      ])];
    const csv = '\uFEFF' + rows.map(row => row.map(csvField).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'virtual-numbers.csv';
    document.body.appendChild(link); link.click(); link.remove();
    URL.revokeObjectURL(url);
  };

  React.useEffect(() => {
    if (!['numbers', 'workspaces'].includes(subTab) || !canReadOrganization) return;
    void loadOrganizationNumbers().catch(error => { setOrganizationNumbers(null); setOrganizationNumbersError(error.message || 'Unable to load organization numbers.'); });
  }, [subTab, workspacePanel, canReadOrganization, loadOrganizationNumbers]);

  const setSubTab = (v: 'numbers' | 'team' | 'workspaces' | 'billing' | 'api') => {
    _setInternalSubTab(v);
    setActiveSubTabProp?.(v);
  };

  const [showProviderForm, setShowProviderForm] = useState(false);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const loadAuditLogs = () => {
    apiFetch('/api/audit-log')
      .then((r) => r.json())
      .then((list: AuditEntry[]) => setAuditLogs(Array.isArray(list) ? list : []))
      .catch(() => setAuditLogs([]));
  };
  useEffect(() => {
    if (subTab === 'api') loadAuditLogs();
  }, [subTab]);

  // These period totals come from the billing ledger, not from token
  // estimates or the most recent page of AI model sessions.
  const [workspaceBilling, setWorkspaceBilling] = useState<{ workspaceId: string; workspaceName: string; monthlyBudgetInr: number | null; periodSpendInr: number; aiMinutesUsed: number; aiSpendInr: number; phoneSpendInr: number; remainingBudgetInr: number | null; budgetPeriod: { label: string } } | null>(null);
  const [organizationPricing, setOrganizationPricing] = useState<{totalMonthlyInr:number;workspaceCount:number;additionalIndustries:number}|null>(null);
  const [billingCallCount, setBillingCallCount] = useState<number | null>(null);
  const [billingUsageLoading, setBillingUsageLoading] = useState(false);
  const [billingUsageError, setBillingUsageError] = useState('');
  const [workspaceBudgetDraft, setWorkspaceBudgetDraft] = useState('');
  const [savingWorkspaceBudget, setSavingWorkspaceBudget] = useState(false);
  const [workspaceBudgetError, setWorkspaceBudgetError] = useState('');
  const loadBillingUsage = async () => {
    setBillingUsageLoading(true);
    try {
      const response = await apiFetch('/api/billing/console');
      const billing = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(billing.error || 'Unable to load billing usage.');
      const usage = billing.workspaceBilling || null;
      setWorkspaceBilling(usage);
      setOrganizationPricing(billing.organizationPricing || null);
      const reportedCalls = billing.overview?.totalCalls;
      const providerRows = billing.phoneBilling?.providers;
      setBillingCallCount(typeof reportedCalls === 'number' && Number.isFinite(reportedCalls)
        ? reportedCalls
        : Array.isArray(providerRows)
          ? providerRows.reduce((count: number, row: { calls?: number }) => count + (Number(row.calls) || 0), 0)
          : null);
      setWorkspaceBudgetDraft(usage?.monthlyBudgetInr == null ? '' : String(usage.monthlyBudgetInr));
      setBillingUsageError('');
    } catch (error) {
      setWorkspaceBilling(null);
      setOrganizationPricing(null);
      setBillingCallCount(null);
      setBillingUsageError(error instanceof Error ? error.message : 'Unable to load billing usage.');
    } finally {
      setBillingUsageLoading(false);
    }
  };
  const saveWorkspaceBudget = async () => {
    setSavingWorkspaceBudget(true);
    setWorkspaceBudgetError('');
    try {
      const monthlyBudgetInr = workspaceBudgetDraft.trim() === '' ? null : Number(workspaceBudgetDraft);
      if (monthlyBudgetInr !== null && (!Number.isFinite(monthlyBudgetInr) || monthlyBudgetInr < 0)) {
        throw new Error('Enter a non-negative INR amount, or leave it blank to remove the cap.');
      }
      const response = await apiFetch('/api/billing/workspace-budget', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyBudgetInr }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not save the workspace budget.');
      void loadBillingUsage();
    } catch (error) {
      setWorkspaceBudgetError(error instanceof Error ? error.message : 'Could not save the workspace budget.');
    } finally { setSavingWorkspaceBudget(false); }
  };
  useEffect(() => {
    if (subTab === 'billing') void loadBillingUsage();
  }, [subTab]);


  // Per-org telephony credentials — lets this org use its own Vobiz
  // account for real outbound calls instead of the single shared account
  // configured in the server's .env. See services/channelsRoutes.js
  // (POST /api/channels/vobiz) and how server.js's /api/vobiz/call prefers
  // these when connected. Connecting an account and registering its number
  // as a dialable virtual line used to be two separate steps (connect
  // credentials, then "Provision Virtual Call-center Line" for the same
  // number) — combined into one action here since the common case is
  // exactly one number per account.
  const [connectProvider, setConnectProvider] = useState<'vobiz'>('vobiz');
  const [connectedChannels, setConnectedChannels] = useState<{ type: string; externalId: string; config: any }[]>([]);
  const loadChannels = () => {
    apiFetch('/api/channels').then((r) => r.json()).then((list) => setConnectedChannels(Array.isArray(list) ? list : [])).catch(() => {});
  };
  useEffect(() => {
    if (subTab === 'numbers' || subTab === 'workspaces') loadChannels();
  }, [subTab]);

  // Adds/updates the virtual-number entry for a just-connected number so it
  // shows up in the numbers list and the Voice Simulator's dial dropdown
  // without a separate "provision" step.
  const upsertVirtualNumber = (number: string, friendlyName: string, provider: 'Vobiz.ai') => {
    const existing = virtualNumbers.find((n) => n.number === number);
    if (existing) {
      setVirtualNumbers(virtualNumbers.map((n) => n.number === number ? { ...n, friendlyName, provider, status: 'Active' } : n));
    } else {
      setVirtualNumbers([...virtualNumbers, {
        // Was `VN-${400 + virtualNumbers.length + 1}` — collided across
        // orgs (the id column is a global PK, not per-org) and even within
        // one org whenever the local list was stale, causing the sync's
        // insert to fail with a duplicate-key error and silently revert
        // the number the user just added. Crypto-random suffix instead.
        id: `VN-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        number, provider, status: 'Active', friendlyName,
        routingUrl: getApiBase() ? `${getApiBase()}/api/vobiz/incoming` : '',
        incomingCallCount: 0, outgoingCallCount: 0
      }]);
    }
  };

  const [vobizAuthId, setVobizAuthId] = useState('');
  const [vobizToken, setVobizToken] = useState('');
  const [vobizPhone, setVobizPhone] = useState('');
  const [vobizLabel, setVobizLabel] = useState('');
  const [savingVobiz, setSavingVobiz] = useState(false);
  const handleConnectVobiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vobizPhone.trim()) return;
    if (vobizChannel) {
      upsertVirtualNumber(vobizPhone.trim(), vobizLabel.trim() || 'Vobiz.ai Line', 'Vobiz.ai');
      setVobizPhone(''); setVobizLabel('');
      return;
    }
    if (!vobizAuthId.trim() || !vobizToken.trim()) return;
    setSavingVobiz(true);
    try {
      const res = await apiFetch('/api/channels/vobiz', {
        method: 'POST',
        body: JSON.stringify({ authId: vobizAuthId.trim(), authToken: vobizToken.trim(), phoneNumber: vobizPhone.trim() })
      });
      if (res.ok) {
        upsertVirtualNumber(vobizPhone.trim(), vobizLabel.trim() || 'Vobiz.ai Line', 'Vobiz.ai');
        setVobizAuthId(''); setVobizToken(''); setVobizPhone(''); setVobizLabel('');
        loadChannels();
      } else {
        alert((await res.json()).error || 'Failed to connect Vobiz.ai account');
      }
    } catch {
      alert('Network error — check your connection.');
    } finally {
      setSavingVobiz(false);
    }
  };

  // Disconnects the org's own Vobiz account — separate from
  // deleting a virtual_numbers row (handleDeleteNumber above). Without
  // this, the actual credentials outbound calls fall back to
  // (channelsEngine.getChannel) stayed connected forever, so a "deleted"
  // number kept showing "Connected: <number>" on this card and kept being
  // used to place calls.
  const [disconnectingChannel, setDisconnectingChannel] = useState<string | null>(null);
  const handleDisconnectChannel = async (type: 'vobiz') => {
    setDisconnectingChannel(type);
    try {
      const res = await apiFetch(`/api/channels/${type}`, { method: 'DELETE' });
      if (res.ok) {
        setConnectedChannels(connectedChannels.filter((c) => c.type !== type));
      } else {
        alert((await res.json().catch(() => ({}))).error || `Failed to disconnect ${type}.`);
      }
    } finally {
      setDisconnectingChannel(null);
    }
  };

  const vobizChannel = connectedChannels.find((c) => c.type === 'vobiz');

  // Org-level allowed feature flags (set by super admin at org creation)
  const [orgAllowedFlags, setOrgAllowedFlags] = useState<string[]>([]);
  useEffect(() => {
    if (subTab !== 'team') return;
    apiFetch('/api/settings/workspace')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data?.featureFlags)) setOrgAllowedFlags(data.featureFlags); })
      .catch(() => {});
  }, [subTab]);

  // Team Member states
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<UserRole>('Loan Agent');
  const [newStaffFeatures, setNewStaffFeatures] = useState<string[]>([]);
  const [addingStaff, setAddingStaff] = useState(false);
  const [staffAddMsg, setStaffAddMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberAssignment[]>([]);
  const [workspaceMembersError, setWorkspaceMembersError] = useState('');
  const [orgWorkspaces, setOrgWorkspaces] = useState<{id:string;name:string;status:string}[]>([]);
  const [orgAssignments, setOrgAssignments] = useState<Record<string, WorkspaceMemberAssignment[]>>({});
  const [accessMember, setAccessMember] = useState<TeamMember | null>(null);
  const [staffWorkspaceFilter, setStaffWorkspaceFilter] = useState('');
  const [staffRoleFilter, setStaffRoleFilter] = useState('');
  const [staffStatusFilter, setStaffStatusFilter] = useState('');
  const [accessSaving, setAccessSaving] = useState('');
  const [orgAccessError, setOrgAccessError] = useState('');
  const loadOrganizationAccess = React.useCallback(async () => {
    const response = await apiFetch('/api/settings/organization/workspace-access');
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not load organization workspace access.');
    setOrgWorkspaces(Array.isArray(data.workspaces) ? data.workspaces : []);
    const grouped: Record<string, WorkspaceMemberAssignment[]> = {};
    for (const group of (Array.isArray(data.assignments) ? data.assignments : [])) {
      if (typeof group.workspaceId === 'string') grouped[group.workspaceId] = Array.isArray(group.members) ? group.members : [];
    }
    setOrgAssignments(grouped);
    setOrgAccessError('');
  }, []);
  React.useEffect(() => {
    if (!['team','numbers','workspaces'].includes(subTab) || !canReadOrgMembers) return;
    void loadOrganizationAccess().catch(error => setOrgAccessError(error.message || 'Unable to load workspace access.'));
  }, [subTab, canReadOrgMembers, loadOrganizationAccess]);
  const updateOrgAccess = async (memberId: string, workspaceId: string, role: string) => {
    setAccessSaving(workspaceId);
    setOrgAccessError('');
    try {
      const response = await apiFetch(`/api/settings/organization/workspace-access/${encodeURIComponent(workspaceId)}/${encodeURIComponent(memberId)}`, {
        method: role ? 'PUT' : 'DELETE',
        ...(role ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) } : {}),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not update workspace access.');
      await loadOrganizationAccess();
    } catch (error) {
      setOrgAccessError(error instanceof Error ? error.message : 'Could not update workspace access.');
    } finally { setAccessSaving(''); }
  };

  // One shared right-sidebar navigation flow. Switching related records replaces
  // the visible panel rather than opening a second drawer over the first.
  const navigateDetail = (target: {
    workspace?: typeof selectedWorkspaceDetails;
    number?: VirtualNumber | null;
    member?: TeamMember | null;
  }) => {
    if (selectedWorkspaceDetails || selectedNumberDetails || accessMember) {
      setDetailHistory(prev => [...prev, {
        workspace: selectedWorkspaceDetails, number: selectedNumberDetails, member: accessMember,
      }]);
    } else {
      setDetailHistory([]);
    }
    setSelectedWorkspaceDetails(target.workspace || null);
    setSelectedNumberDetails(target.number || null);
    setAccessMember(target.member || null);
    setWorkspaceDetailsTab('overview');
  };
  const openWorkspaceDetails = (workspace: NonNullable<typeof selectedWorkspaceDetails>) => {
    navigateDetail({ workspace });
    if (canReadOrgMembers) void loadOrganizationAccess().catch(error => setOrgAccessError(error.message || 'Could not load workspace membership.'));
  };
  const openNumberDetails = (number: VirtualNumber) => {
    navigateDetail({ number });
    if (canReadOrgMembers) void loadOrganizationAccess().catch(error => setOrgAccessError(error.message || 'Could not load workspace membership.'));
  };
  const openMemberDetails = (member: TeamMember) => {
    navigateDetail({ member });
    if (canReadOrganization && canReadOrgMembers) void loadWorkspaceFeatures();
  };
  const closeDetails = () => {
    setSelectedWorkspaceDetails(null);
    setSelectedNumberDetails(null);
    setAccessMember(null);
    setDetailHistory([]);
  };
  const backDetails = () => {
    const previous = detailHistory[detailHistory.length - 1];
    if (!previous) return;
    setDetailHistory(history => history.slice(0, -1));
    setSelectedWorkspaceDetails(previous.workspace);
    setSelectedNumberDetails(previous.number);
    setAccessMember(previous.member);
    setWorkspaceDetailsTab('overview');
  };
  const assignedWorkspaces = (memberId: string) => orgWorkspaces.filter(workspace =>
    orgAssignments[workspace.id]?.some(assignment => assignment.memberId === memberId && assignment.assignmentStatus === 'Active'));

  const [savingWorkspaceMember, setSavingWorkspaceMember] = useState<string | null>(null);
  const [showOwnerTransfer, setShowOwnerTransfer] = useState(false);
  const [ownerTransferTarget, setOwnerTransferTarget] = useState('');
  const [ownerTransferError, setOwnerTransferError] = useState('');
  const [transferringOwner, setTransferringOwner] = useState(false);
  const currentOwnerMember = teamMembers.find(member => member.role === 'Owner'
    && currentUserEmail && member.email.toLowerCase() === currentUserEmail.toLowerCase());

  const loadWorkspaceMembers = React.useCallback(async () => {
    const response = await apiFetch('/api/settings/workspace/members');
    const data = await response.json().catch(() => []);
    if (!response.ok) throw new Error(data.error || 'Could not load workspace role assignments');
    setWorkspaceMembers(Array.isArray(data) ? data : []);
    setWorkspaceMembersError('');
  }, []);

  useEffect(() => {
    if (subTab !== 'team' || !canManageWorkspaceMembers) return;
    loadWorkspaceMembers().catch(error => setWorkspaceMembersError(error.message || 'Could not load workspace role assignments'));
  }, [subTab, canManageWorkspaceMembers, loadWorkspaceMembers]);

  const updateWorkspaceMemberRole = async (member: WorkspaceMemberAssignment, role: string) => {
    setSavingWorkspaceMember(member.memberId);
    setWorkspaceMembersError('');
    try {
      const response = role
        ? await apiFetch(`/api/settings/workspace/members/${encodeURIComponent(member.memberId)}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }),
          })
        : await apiFetch(`/api/settings/workspace/members/${encodeURIComponent(member.memberId)}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not update workspace role');
      setWorkspaceMembers(current => current.map(row => row.memberId === member.memberId
        ? { ...row, workspaceRole: role || row.workspaceRole, assignmentStatus: role ? 'Active' : 'Inactive', roleSource: role ? 'manual' : row.roleSource }
        : row));
    } catch (error: any) {
      setWorkspaceMembersError(error.message || 'Could not update workspace role');
    } finally {
      setSavingWorkspaceMember(null);
    }
  };

  const transferOrganizationOwner = async () => {
    if (!ownerTransferTarget) return;
    const target = teamMembers.find(member => member.id === ownerTransferTarget);
    if (!target || target.status !== 'Active') return;
    if (!window.confirm(`Transfer organization ownership to ${target.name || target.email}? Your Owner role will become Organization Admin.`)) return;
    setTransferringOwner(true);
    setOwnerTransferError('');
    try {
      const response = await apiFetch('/api/settings/team/owner-transfer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: target.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Ownership transfer failed');
      setTeamMembers(current => current.map(member => member.id === data.from.id
        ? { ...member, role: 'Organization Admin' as UserRole }
        : member.id === data.to.id ? { ...member, role: 'Owner' as UserRole } : member));
      setShowOwnerTransfer(false);
      setOwnerTransferTarget('');
    } catch (error: any) {
      setOwnerTransferError(error.message || 'Ownership transfer failed');
    } finally {
      setTransferringOwner(false);
    }
  };

  // Feature flag editing for existing team members
  const [editFlagsFor, setEditFlagsFor] = useState<string | null>(null); // member id
  const [editFlagsValue, setEditFlagsValue] = useState<string[]>([]);
  const [savingFlags, setSavingFlags] = useState(false);

  const openFlagEditor = (member: TeamMember) => {
    setEditFlagsFor(member.id);
    setEditFlagsValue(member.featureFlags || []);
  };

  const handleSaveFlags = async (memberId: string) => {
    setSavingFlags(true);
    try {
      const res = await apiFetch(`/api/settings/team/${memberId}/flags`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureFlags: editFlagsValue }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error || 'Failed to update feature flags');
        return;
      }
      const updated = await res.json();
      setTeamMembers(prev => prev.map(m => m.id === memberId ? { ...m, featureFlags: updated.featureFlags || editFlagsValue } : m));
      setEditFlagsFor(null);
    } catch {
      alert('Could not reach the server');
    } finally {
      setSavingFlags(false);
    }
  };

  // Delete virtual line — calls the dedicated DELETE route directly instead
  // of relying on the whole-array /api/settings/numbers/sync effect, since
  // deleting the LAST remaining number sends an empty array that's
  // indistinguishable from a sync bug and gets silently ignored by
  // db.replaceAll's own guard against accidental data wipes.
  const handleDeleteNumber = async (numId: string) => {
    const previous = virtualNumbers;
    setVirtualNumbers(virtualNumbers.filter((n) => n.id !== numId));
    try {
      const res = await apiFetch(`/api/settings/numbers/${encodeURIComponent(numId)}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error || 'Failed to delete number.');
        setVirtualNumbers(previous);
      }
    } catch (err) {
      alert('Failed to delete number — check your connection and try again.');
      setVirtualNumbers(previous);
    }
  };

  // Add Staff Member
  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName || !newStaffEmail) return;
    setAddingStaff(true);
    setStaffAddMsg(null);
    try {
      const res = await apiFetch('/api/settings/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newStaffName,
          email: newStaffEmail,
          phone: newStaffPhone || undefined,
          role: newStaffRole,
          featureFlags: newStaffFeatures,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStaffAddMsg({ type: 'error', text: data.error || 'Failed to add member' });
        return;
      }
      setTeamMembers((prev) => [...prev, data]);
      if (canManageWorkspaceMembers) await loadWorkspaceMembers().catch(() => {});
      setNewStaffName('');
      setNewStaffEmail('');
      setNewStaffPhone('');
      setNewStaffFeatures([]);
      setStaffAddMsg({
        type: 'success',
        text: data.credsSent
          ? `${newStaffName} added — credentials sent to ${newStaffEmail}`
          : `${newStaffName} added successfully`,
      });
    } catch {
      setStaffAddMsg({ type: 'error', text: 'Could not reach the server' });
    } finally {
      setAddingStaff(false);
    }
  };

  const toggleFeature = (key: string) =>
    setNewStaffFeatures((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );

  // Remove staff member permanently
  const handleRemoveStaff = async (staffId: string, name: string, memberEmail: string, memberRole: string) => {
    const isSelf = currentUserEmail && memberEmail.toLowerCase() === currentUserEmail.toLowerCase();
    if (isSelf && memberRole === 'Organization Admin') {
      alert(
        `You cannot remove yourself as Org Admin.\n\nTo leave: first reassign the "Organization Admin" role to another team member, then ask them to remove your account.`
      );
      return;
    }
    if (!window.confirm(`Remove ${name} from the team? This cannot be undone.`)) return;
    setTeamMembers((prev) => prev.filter((m) => m.id !== staffId));
    apiFetch(`/api/settings/team/${staffId}`, { method: 'DELETE' })
      .catch((err) => console.error('Failed to remove staff member:', err));
  };

  // Deactivate Staff member — optimistic local update + immediate PATCH to backend
  const handleToggleStaffStatus = (staffId: string) => {
    const updated = teamMembers.map((m) => {
      if (m.id === staffId) {
        return {
          ...m,
          status: m.status === 'Active' ? ('Inactive' as const) : ('Active' as const)
        };
      }
      return m;
    });
    setTeamMembers(updated);
    const member = updated.find(m => m.id === staffId);
    if (member) {
      apiFetch(`/api/settings/team/${staffId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: member.status }),
      }).catch(err => console.error('Failed to update staff status:', err));
    }
  };

  const globalRefresh = useRefresh();
  const handlePageRefresh = () => {
    if (subTab === 'billing') void loadBillingUsage();
    if (subTab === 'numbers' || subTab === 'workspaces') loadChannels();
    else if (subTab === 'api') loadAuditLogs();
    globalRefresh?.();
  };

  return (
    <PageShell
      title={
        subTab === 'billing' || subTab === 'numbers' || subTab === 'workspaces'
          ? <span className="flex min-w-0 items-center gap-2">
              <span className="text-[10px] font-medium text-[var(--text-muted)]">Administration</span>
              <span className="text-[var(--border)]">/</span>
              {subTab === 'billing'
                ? billingPanel === 'dashboard'
                  ? <span className="truncate text-sm font-semibold">Billing & Usage</span>
                  : <>
                      <button type="button" onClick={() => setBillingPanel('dashboard')} className="text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]">Billing & Usage</button>
                      <span className="text-[var(--border)]">/</span>
                      <span className="truncate text-sm font-semibold">{billingPanel === 'plan' ? 'Subscription' : billingPanel === 'usage' ? 'Usage' : billingPanel === 'payments' ? 'Payments' : billingPanel === 'topup' ? 'Add Credits' : 'Credits'}</span>
                    </>
                : workspacePanel === 'overview'
                  ? <span className="truncate text-sm font-semibold">Workspaces & Numbers</span>
                  : <>
                      <button type="button" onClick={() => setWorkspacePanel('overview')} className="text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]">Workspaces & Numbers</button>
                      <span className="text-[var(--border)]">/</span>
                      <span className="truncate text-sm font-semibold">{workspacePanel === 'numbers' ? 'Virtual Numbers' : 'Sharing'}</span>
                    </>}
            </span>
          : <BreadcrumbTitle group="Administration" page={subTab === 'team' ? 'Staff & Teams' : 'API Keys'} />
      }
      titleSuffix={subTab === 'billing' && billingPanel !== 'dashboard'
        ? <IconButton icon={ArrowLeft} variant="secondary" label="Back to Billing & Usage" onClick={() => setBillingPanel('dashboard')} />
        : (subTab === 'numbers' || subTab === 'workspaces') && workspacePanel !== 'overview'
          ? <IconButton icon={ArrowLeft} variant="secondary" label="Back to Workspaces & Numbers" onClick={() => setWorkspacePanel('overview')} />
          : undefined}
      subtitle={subTab === 'billing' || subTab === 'numbers' || subTab === 'workspaces' ? undefined : subTab === 'team' ? 'Manage staff and access.' : undefined}
      onRefresh={handlePageRefresh}
    >
      <div className="col-span-12 grid grid-cols-12 content-start gap-4 md:gap-5 xl:gap-6">

          {/* Compact workspace landing page with focused number and sharing views. */}
          {(subTab === 'numbers' || subTab === 'workspaces') && (
            <div className="col-span-12 grid grid-cols-12 content-start gap-4 md:gap-5 xl:gap-6">
              <Widget showHeader={false} padding="sm">
                <div role="tablist" aria-label="Workspace management views" className="flex flex-wrap gap-2">
                  {([
                    { key: 'overview', label: 'Workspaces' },
                    { key: 'numbers', label: 'Phone Numbers' },
                    { key: 'sharing', label: 'Sharing' },
                  ] as const).map(item =>
                    <button key={item.key} type="button" role="tab"
                      aria-selected={workspacePanel === item.key} onClick={() => setWorkspacePanel(item.key)}
                      className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${workspacePanel === item.key
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                      {item.label}
                    </button>)}
                </div>
              </Widget>
              {workspacePanel === 'overview' && <>
                <WorkspaceManagement enabled={multipleWorkspacesEnabled} onWorkspaceCreated={async () => { await onWorkspaceCreated(); await loadOrganizationAccess(); await loadOrganizationNumbers(); }}
                  memberCounts={Object.fromEntries(orgWorkspaces.map(row => [row.id, canReadOrgMembers && !orgAccessError && orgAssignments[row.id] ? orgAssignments[row.id].filter(member => member.assignmentStatus === 'Active' && member.memberStatus.toLowerCase() === 'active').length : undefined]).filter(([, count]) => count !== undefined))}
                  numberCounts={Object.fromEntries(visibleNumbers.filter(number => numberWorkspaceId(number)).reduce((counts, number) => {
                    const key = numberWorkspaceId(number);
                    counts.set(key, (counts.get(key) || 0) + 1);
                    return counts;
                  }, new Map<string, number>()))}
                  numberCountsAvailable={organizationNumbers !== null}
                  onSelectWorkspace={workspace => { openWorkspaceDetails(workspace); }} />

              </>}
              {workspacePanel === 'sharing' && <WorkspaceSharing enabled={workspaceSharingEnabled} />}
              {workspacePanel === 'numbers' && <>
              {organizationNumbersError && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{organizationNumbersError} Only numbers in the currently selected workspace are shown.</p>}
              <Widget showHeader={false} padding="none">
                <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-surface)] p-4">
                  <FilterBar
                    search={{ value: numberSearch, onChange: setNumberSearch, placeholder: 'Number or label' }}
                    selects={[
                      { key: 'Workspace', label: 'Workspace', value: numberWorkspace, onChange: setNumberWorkspace, options: [{ label: 'All workspaces', value: '' }, ...orgWorkspaces.map(workspace => ({ label: workspace.name, value: workspace.id })), { label: 'Unknown association', value: '__unknown__' }] },
                      { key: 'Provider', label: 'Provider', value: numberProvider, onChange: setNumberProvider, options: [{ label: 'All providers', value: '' }, ...Array.from(new Set(visibleNumbers.map(number => number.provider))).map(provider => ({ label: provider, value: provider }))] },
                      { key: 'Status', label: 'Status', value: numberStatus, onChange: setNumberStatus, options: [{ label: 'All statuses', value: '' }, { label: 'Active', value: 'Active' }, { label: 'Inactive', value: 'Inactive' }] },
                    ]}
                    hasActiveFilters={Boolean(numberSearch.trim() || numberWorkspace || numberProvider || numberStatus)}
                    onClear={() => { setNumberSearch(''); setNumberWorkspace(''); setNumberProvider(''); setNumberStatus(''); }}
                    resultCount={{ filtered: filteredNumbers.length, total: visibleNumbers.length, label: 'numbers' }}
                    actions={<>
                      <button type="button" onClick={exportFilteredNumbers} disabled={!filteredNumbers.length}
                        className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50">
                        Export CSV ({filteredNumbers.length})
                      </button>
                      <IconButton icon={Plus} label="Add Provider" onClick={() => setShowProviderForm(true)} />
                    </>}
                  />
                </div>
                {visibleNumbers.some(number => !numberWorkspaceId(number)) &&
                  <p className="px-4 py-2 text-xs text-[var(--text-muted)]">Workspace associations are shown only when provided by the number record; otherwise they appear as Unknown.</p>}
                {visibleNumbers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="h-12 w-12 rounded-[14px] bg-indigo-50 flex items-center justify-center mb-3">
                      <Phone className="h-5 w-5 text-indigo-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-600">No virtual numbers yet</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs">Click "Add Provider" to connect your Vobiz.ai account and provision your first virtual line.</p>
                  </div>
                ) : (() => {
                  const columns: Column<VirtualNumber>[] = [
                    {
                      key: 'number',
                      header: 'Telephone Number',
                      cell: (num) => (
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center shrink-0">
                            <Phone className="h-3.5 w-3.5 text-indigo-400" />
                          </div>
                          <div>
                            <button type="button" className="text-left font-semibold text-[var(--accent)] hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                              onClick={() => { openNumberDetails(num); }}
                              aria-label={`View workspace details for number ${num.number}`}>{num.number}</button>
                            {num.friendlyName && <p className="text-xs text-slate-400 dark:text-[var(--text-muted)] mt-0.5">{num.friendlyName}</p>}
                          </div>
                        </div>
                      ),
                    },
                    { key: 'workspace', header: 'Workspace', cell: (num) => {
                      const id = numberWorkspaceId(num);
                      const workspace = orgWorkspaces.find(row => row.id === id);
                      return workspace ? <button type="button" className="text-xs text-[var(--accent)] hover:underline"
                        onClick={() => openWorkspaceDetails(workspace)}>{workspace.name}</button>
                        : <span className="text-xs text-[var(--text-muted)]">Unknown</span>;
                    } },
                    { key: 'provider', header: 'Gateway Provider', cell: (num) => <ProviderBadge provider={num.provider} /> },
                    { key: 'load', header: 'Dial Load (In / Out)', cell: (num) => <span className="text-xs text-slate-500 dark:text-[var(--text-secondary)]">{num.incomingCallCount} in / {num.outgoingCallCount} out</span> },
                    {
                      key: 'status',
                      header: 'Status',
                      align: 'right',
                      cell: (num) => (
                        <div className="flex items-center justify-end gap-3">
                          {num.status === 'Active' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[var(--bg-subtle)] dark:bg-[var(--bg-subtle)] text-slate-500 dark:text-[var(--text-muted)] border border-[var(--border)] dark:border-[var(--border)]">
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Inactive
                            </span>
                          )}
                          <IconButton icon={Trash2} variant="secondary" label="Delete number in current workspace" onClick={() => handleDeleteNumber(num.id)} disabled={Boolean(organizationNumbers && !virtualNumbers.some(row => row.id === num.id))} className="text-rose-500 hover:text-rose-600" />
                        </div>
                      ),
                    },
                  ];
                  return (
                    <DataTable
                      bare
                      resizable
                      paginated
                      columns={columns}
                      rows={filteredNumbers}
                      rowKey={(num) => num.id}
                    />
                  );
                })()}
              </Widget>

              {/* Add Provider overlay modal */}
              {showProviderForm && (
                <Modal
                  open
                  onClose={() => setShowProviderForm(false)}
                  title="Add Virtual Number"
                  subtitle="Choose your telephony provider and enter your credentials to register a virtual number."
                  maxWidth="max-w-lg"
                >
                  <div className="space-y-5">
                    {/* Provider selector */}
                    <div>
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Select Provider</p>
                      <div className="grid grid-cols-1 gap-3">
                        {([
                          {
                            id: 'vobiz',
                            label: 'Vobiz.ai',
                            connected: !!vobizChannel,
                            selectedBg: 'bg-purple-50 border-purple-400',
                            logo: (
                              <div className="h-8 w-8 rounded-[9px] bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-black text-base shadow-sm">V</div>
                            ),
                          },
                        ] as const).map(({ id, label, connected, selectedBg, logo }) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setConnectProvider(id)}
                            className={`relative flex flex-col items-center gap-2 py-4 px-3 rounded-[14px] border-2 transition-all cursor-pointer ${
                              connectProvider === id
                                ? selectedBg
                                : 'border-[var(--border)] bg-[var(--bg-surface)] hover:border-slate-300 hover:bg-[var(--bg-base)]'
                            }`}
                          >
                            {logo}
                            <span className="text-xs font-semibold text-slate-700">{label}</span>
                            {connected && (
                              <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" title="Connected" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-[var(--border)]" />

                    {/* Per-provider form */}

                    {connectProvider === 'vobiz' && (
                      <form onSubmit={(e) => { handleConnectVobiz(e); setShowProviderForm(false); }} className="space-y-4">
                        {vobizChannel && (
                          <div className="flex items-center justify-between text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-[9px] px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              <span>Active: <span className="font-semibold">{vobizChannel.externalId}</span></span>
                            </div>
                            <button type="button" onClick={() => handleDisconnectChannel('vobiz')} disabled={disconnectingChannel === 'vobiz'} className="text-rose-500 hover:text-rose-600 font-semibold text-xs disabled:opacity-50 cursor-pointer">
                              {disconnectingChannel === 'vobiz' ? 'Disconnecting…' : 'Disconnect'}
                            </button>
                          </div>
                        )}
                        <div className="space-y-3">
                          {!vobizChannel && (
                            <>
                              <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Auth ID</label>
                                <input type="text" value={vobizAuthId} onChange={(e) => setVobizAuthId(e.target.value)} placeholder="Your Vobiz.ai Auth ID" className="w-full bg-[var(--bg-base)] border border-[var(--border)] rounded-[9px] px-4 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all" />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Auth Token</label>
                                <input type="password" value={vobizToken} onChange={(e) => setVobizToken(e.target.value)} placeholder="••••••••••••••••••••••••••••••••" className="w-full bg-[var(--bg-base)] border border-[var(--border)] rounded-[9px] px-4 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all" />
                              </div>
                            </>
                          )}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Phone Number</label>
                              <input type="text" value={vobizPhone} onChange={(e) => setVobizPhone(e.target.value)} placeholder="+91XXXXXXXXXX" className="w-full bg-[var(--bg-base)] border border-[var(--border)] rounded-[9px] px-4 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all" />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Label <span className="text-slate-400 font-normal">(optional)</span></label>
                              <input type="text" value={vobizLabel} onChange={(e) => setVobizLabel(e.target.value)} placeholder="e.g. Support Line" className="w-full bg-[var(--bg-base)] border border-[var(--border)] rounded-[9px] px-4 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all" />
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <p className="text-[11px] text-slate-400">{vobizChannel ? 'Open "Add Provider" again any time to add more Vobiz.ai numbers.' : 'You can add more numbers for this account later.'}</p>
                          <button type="submit" disabled={savingVobiz} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold rounded-[9px] px-6 py-2.5 transition-all cursor-pointer shadow-sm">
                            {savingVobiz ? 'Connecting…' : vobizChannel ? 'Add Number' : 'Connect Vobiz.ai'}
                          </button>
                        </div>
                      </form>
                    )}

                    {!connectProvider && (
                      <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400">
                        <Phone className="h-8 w-8 mb-2 opacity-30" />
                        <p className="text-sm">Select a provider above to continue</p>
                      </div>
                    )}
                  </div>
                </Modal>
              )}
              </>}
            </div>
          )}

              {/* Workspace and number details use the existing shared modal as a right-hand panel. */}
              {(selectedWorkspaceDetails || selectedNumberDetails) && (() => {
                const selectedId = selectedWorkspaceDetails?.id || (selectedNumberDetails ? numberWorkspaceId(selectedNumberDetails) : '');
                const workspace = selectedWorkspaceDetails || orgWorkspaces.find(row => row.id === selectedId) || null;
                const assignments = selectedId ? (orgAssignments[selectedId] || []).filter(row => row.assignmentStatus === 'Active' && row.memberStatus.toLowerCase() === 'active') : [];
                const features = workspaceFeatureRows.find(row => row.id === selectedId);
                const entitled = new Set(workspaceFeatureAllowed);
                const permittedByWorkspace = features?.enabledFeatures || [];
                return <SlideOver open onClose={closeDetails}
                  title={<span className="flex items-center gap-2">{detailHistory.length > 0 && <IconButton icon={ArrowLeft} label="Back to previous details" variant="secondary" onClick={backDetails} />}
                    {selectedNumberDetails ? `Virtual Number · ${selectedNumberDetails.number}` : `Workspace · ${workspace?.name || 'Details'}`}</span>}
                  subtitle="Workspace membership and access details"
                  maxWidth="max-w-2xl">
                  <div className="space-y-4">
                    {selectedWorkspaceDetails && <div role="tablist" aria-label="Workspace details" className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-3">
                      {(['overview','members','numbers'] as const).map(tab =>
                        <button key={tab} type="button" role="tab" aria-selected={workspaceDetailsTab === tab} onClick={() => setWorkspaceDetailsTab(tab)}
                          className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize transition-colors ${workspaceDetailsTab === tab ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>{tab === 'numbers' ? 'Phone Numbers' : tab}</button>)}
                    </div>}
                    {selectedWorkspaceDetails && workspaceDetailsTab === 'overview' && <Widget title="Workspace Overview" icon={Briefcase} padding="md">
                      <dl className="grid grid-cols-2 gap-4 text-xs">
                        <div><dt className="text-[var(--text-muted)]">Status</dt><dd className="mt-1 font-semibold text-[var(--text-primary)]">{workspace?.status || 'Unknown'}</dd></div>
                        <div><dt className="text-[var(--text-muted)]">Branch</dt><dd className="mt-1 font-semibold text-[var(--text-primary)]">{selectedWorkspaceDetails.branchName || '—'}</dd></div>
                        <div><dt className="text-[var(--text-muted)]">Active members</dt><dd className="mt-1 font-semibold text-[var(--text-primary)]">{canReadOrgMembers ? assignments.length : 'Restricted'}</dd></div>
                        <div><dt className="text-[var(--text-muted)]">Phone numbers</dt><dd className="mt-1 font-semibold text-[var(--text-primary)]">{organizationNumbers ? visibleNumbers.filter(num => numberWorkspaceId(num) === selectedId).length : 'Unavailable'}</dd></div>
                        <div><dt className="text-[var(--text-muted)]">Enabled features</dt><dd className="mt-1 font-semibold text-[var(--text-primary)]">{features ? features.enabledFeatures.length : 'Unavailable'}</dd></div>
                      </dl>
                    </Widget>}
                    {selectedNumberDetails && <Widget title="Number Details" padding="md">
                      <dl className="grid grid-cols-2 gap-3 text-xs">
                        <div><dt className="text-[var(--text-muted)]">Number</dt><dd className="mt-1 font-semibold text-[var(--text-primary)]">{selectedNumberDetails.number}</dd></div>
                        <div><dt className="text-[var(--text-muted)]">Provider</dt><dd className="mt-1 font-semibold text-[var(--text-primary)]">{selectedNumberDetails.provider}</dd></div>
                        <div><dt className="text-[var(--text-muted)]">Status</dt><dd className="mt-1 font-semibold text-[var(--text-primary)]">{selectedNumberDetails.status}</dd></div>
                        <div><dt className="text-[var(--text-muted)]">Label</dt><dd className="mt-1 font-semibold text-[var(--text-primary)]">{selectedNumberDetails.friendlyName || '—'}</dd></div>
                        <div><dt className="text-[var(--text-muted)]">Incoming calls</dt><dd className="mt-1 font-semibold text-[var(--text-primary)]">{selectedNumberDetails.incomingCallCount}</dd></div>
                        <div><dt className="text-[var(--text-muted)]">Outgoing calls</dt><dd className="mt-1 font-semibold text-[var(--text-primary)]">{selectedNumberDetails.outgoingCallCount}</dd></div>
                      </dl>
                    </Widget>}
                    {selectedNumberDetails && <Widget title={workspace ? workspace.name : 'Workspace association'} padding="md" icon={Briefcase}>
                      {workspace
                        ? <p className="text-xs text-[var(--text-secondary)]">{workspace.status} workspace · {assignments.length} active member(s)</p>
                        : <p className="text-xs text-[var(--text-muted)]">No known workspace association. Membership cannot be inferred from this number.</p>}
                      {workspace && <button type="button" onClick={() => openWorkspaceDetails(workspace)}
                        className="mt-3 text-xs font-semibold text-[var(--accent)] hover:underline">View workspace →</button>}
                    </Widget>}
                    {workspace && (selectedNumberDetails || workspaceDetailsTab === 'members') && <Widget title="Workspace Members" subtitle={selectedNumberDetails ? 'Users with workspace access, not necessarily assigned directly to this number.' : 'Users with active workspace access.'} icon={Users} padding="md">
                      {!canReadOrgMembers
                        ? <p className="text-xs text-[var(--text-muted)]">Organization member-read permission is required to view this list.</p>
                        : orgAccessError
                          ? <p role="alert" className="text-xs text-rose-600">{orgAccessError}</p>
                          : assignments.length === 0
                            ? <p className="text-xs text-[var(--text-muted)]">No active members returned for this workspace.</p>
                            : <div className="divide-y divide-[var(--border)]">{assignments.map(member => {
                                const memberRecord = teamMembers.find(row => row.id === member.memberId);
                                const memberGrants = memberRecord?.featureFlags;
                                const isAdmin = member.workspaceRole === 'Workspace Admin';
                                const effective = features && (isAdmin || Array.isArray(memberGrants))
                                  ? permittedByWorkspace.filter(key => entitled.has(key) && (isAdmin || memberGrants?.includes(key)))
                                  : null;
                                return <div key={member.memberId} className="space-y-2 py-3">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">{memberRecord
                                      ? <button type="button" className="truncate text-left text-xs font-semibold text-[var(--accent)] hover:underline"
                                          onClick={() => openMemberDetails(memberRecord)}>{member.name || member.email || member.memberId}</button>
                                      : <p className="truncate text-xs font-semibold text-[var(--text-primary)]">{member.name || member.email || member.memberId}</p>}<p className="truncate text-[11px] text-[var(--text-muted)]">{member.email}</p></div>
                                    <span className="shrink-0 rounded-md bg-[var(--bg-subtle)] px-2 py-1 text-[10px] font-medium text-[var(--text-secondary)]">{member.workspaceRole || 'Member'}</span>
                                  </div>
                                  {workspaceFeatureLoading
                                    ? <p className="text-[11px] text-[var(--text-muted)]">Loading feature grants…</p>
                                    : effective === null
                                      ? <p className="text-[11px] text-[var(--text-muted)]">Individual feature grants unavailable.</p>
                                      : <div className="flex flex-wrap gap-1">{effective.length
                                        ? effective.map(key => <span key={key} className="rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">{FEATURE_REGISTRY.find(flag => flag.key === key)?.label || key}</span>)
                                        : <span className="text-[11px] text-[var(--text-muted)]">No enabled product features</span>}</div>}
                                </div>;
                              })}</div>}
                    </Widget>}
                    {selectedWorkspaceDetails && workspaceDetailsTab === 'numbers' && <Widget title="Workspace Phone Numbers" subtitle="Numbers with a verified workspace association." icon={Phone} padding="none">
                      {!organizationNumbers ? <p className="p-4 text-xs text-[var(--text-muted)]">Organization phone-number data unavailable.</p>
                        : <DataTable bare paginated rows={visibleNumbers.filter(number => numberWorkspaceId(number) === selectedId)}
                            rowKey={number => number.id}
                            emptyMessage="No phone numbers associated with this workspace."
                            columns={[
                              { key: 'number', header: 'Phone number', cell: (number: VirtualNumber) =>
                                <button type="button" className="text-xs font-semibold text-[var(--accent)] hover:underline" onClick={() => openNumberDetails(number)}>{number.number}</button> },
                              { key: 'provider', header: 'Provider', cell: (number: VirtualNumber) => <span className="text-xs">{number.provider}</span> },
                              { key: 'status', header: 'Status', cell: (number: VirtualNumber) => <span className="text-xs">{number.status}</span> },
                            ] as Column<VirtualNumber>[]} />}
                    </Widget>}
                  </div>
                </SlideOver>;
              })()}


          {/* Staff and team membership only. */}
          {subTab === 'team' && (
            <div className="col-span-12 grid grid-cols-12 content-start gap-4 md:gap-5 xl:gap-6">
              {staffAddMsg && (
                <div className={`px-4 py-2.5 rounded-lg text-xs font-medium ${staffAddMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                  {staffAddMsg.text}
                </div>
              )}

              {/* Organization membership and current-workspace access in one matrix. */}
              {(canReadOrgMembers || canManageWorkspaceMembers) && (
              <Widget showHeader={false} padding="none">
                {workspaceMembersError && canManageWorkspaceMembers && <div role="alert" className="mx-4 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{workspaceMembersError}</div>}
                {orgAccessError && <div role="alert" className="mx-4 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{orgAccessError}</div>}
                <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-surface)] p-4">
                  <FilterBar
                    selects={canReadOrgMembers ? [
                      { key: 'Workspace', label: 'Workspace', value: staffWorkspaceFilter, onChange: setStaffWorkspaceFilter, options: [{ label: 'All workspaces', value: '' }, ...orgWorkspaces.map(workspace => ({ label: workspace.name, value: workspace.id }))] },
                      { key: 'Role', label: 'Role', value: staffRoleFilter, onChange: setStaffRoleFilter, options: [{ label: 'All roles', value: '' }, ...Array.from(new Set(teamMembers.map(member => member.role))).map(role => ({ label: role, value: role }))] },
                      { key: 'Status', label: 'Status', value: staffStatusFilter, onChange: setStaffStatusFilter, options: [{ label: 'All statuses', value: '' }, { label: 'Active', value: 'Active' }, { label: 'Inactive', value: 'Inactive' }] },
                    ] : []}
                    onClear={() => { setStaffWorkspaceFilter(''); setStaffRoleFilter(''); setStaffStatusFilter(''); }}
                    hasActiveFilters={Boolean(staffWorkspaceFilter || staffRoleFilter || staffStatusFilter)}
                    resultCount={canReadOrgMembers
                      ? {
                          filtered: teamMembers.filter(member =>
                            (!staffWorkspaceFilter || assignedWorkspaces(member.id).some(workspace => workspace.id === staffWorkspaceFilter)) &&
                            (!staffRoleFilter || member.role === staffRoleFilter) &&
                            (!staffStatusFilter || member.status === staffStatusFilter)).length,
                          total: teamMembers.length,
                          label: 'members',
                        }
                      : { filtered: workspaceMembers.length, total: workspaceMembers.length, label: 'members' }}
                    actions={<>
                      {currentOwnerMember && <button type="button" onClick={() => { setOwnerTransferError(''); setShowOwnerTransfer(true); }}
                        className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-100">Transfer Owner</button>}
                      {canManageOrgMembers && <IconButton icon={Plus} label="Add Member" onClick={() => setShowAddStaff(true)} />}
                    </>}
                  />
                </div>

                {(() => {
                  const matrixMembers: TeamMember[] = canReadOrgMembers ? teamMembers : workspaceMembers.map(member => ({
                    id: member.memberId,
                    name: member.name || '',
                    email: member.email || '',
                    role: member.organizationRole as UserRole,
                    status: member.memberStatus.toLowerCase() === 'inactive' ? 'Inactive' : 'Active',
                    performanceScore: 0,
                    assignedLeadsCount: 0,
                  }));
                  const filteredStaff = matrixMembers.filter(member =>
                    (!staffWorkspaceFilter || assignedWorkspaces(member.id).some(workspace => workspace.id === staffWorkspaceFilter)) &&
                    (!staffRoleFilter || member.role === staffRoleFilter) &&
                    (!staffStatusFilter || member.status === staffStatusFilter));
                  const columns: Column<TeamMember>[] = [
                    {
                      key: 'member',
                      header: 'Enlisted Representative',
                      cell: (member) => (
                        <div>
                          <button type="button" onClick={() => { setOrgAccessError(''); openMemberDetails(member); }}
                            className="text-left font-semibold text-[var(--accent)] hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                            aria-label={`View workspace and feature access for ${member.name || member.email}`}>{member.name || member.email}</button>
                          <p className="text-[10px] text-slate-400 dark:text-[var(--text-muted)] mt-0.5">{member.email}</p>
                          {member.phone && (
                            <p className="text-[10px] text-slate-400 dark:text-[var(--text-muted)] mt-0.5">{member.phone}</p>
                          )}
                        </div>
                      ),
                    },
                    {
                      key: 'role',
                      header: 'Administrative Role',
                      cell: (member) => (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400">
                          {member.role}
                        </span>
                      ),
                    },
                    {
                      key: 'access',
                      header: 'Feature Access',
                      cell: (member) => member.role === 'Organization Admin' || member.role === 'Super Admin' ? (
                        <button type="button" onClick={() => openMemberDetails(member)}
                          className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--accent)] hover:underline">
                          <Flag className="h-3 w-3" /> View workspace features
                        </button>
                      ) : (
                        <button
                          onClick={() => editFlagsFor === member.id ? setEditFlagsFor(null) : openFlagEditor(member)}
                          className="flex items-center gap-1.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
                        >
                          <Flag className="h-3 w-3" />
                          {(member.featureFlags || []).length} granted
                        </button>
                      ),
                    },
                    {
                      key: 'status',
                      header: 'CRM Status',
                      align: 'right',
                      cell: (member) => (
                        <button
                          onClick={() => handleToggleStaffStatus(member.id)}
                          className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${
                            member.status === 'Active'
                              ? 'bg-emerald-50 dark:bg-emerald-500/10 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-emerald-700 dark:text-emerald-400 hover:text-rose-700 dark:hover:text-rose-400 border border-emerald-200 dark:border-emerald-500/30 hover:border-rose-200 dark:hover:border-rose-500/30'
                              : 'bg-[var(--bg-subtle)] dark:bg-[var(--bg-subtle)] hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-slate-600 dark:text-[var(--text-secondary)] hover:text-emerald-700 dark:hover:text-emerald-400 border border-[var(--border)] dark:border-[var(--border)]'
                          }`}
                        >
                          {member.status === 'Active' ? 'Deactivate' : 'Reactivate'}
                        </button>
                      ),
                    },
                    {
                      key: 'actions',
                      header: 'Actions',
                      align: 'right',
                      cell: (member) => {
                        const isSelf = currentUserEmail && member.email.toLowerCase() === currentUserEmail.toLowerCase();
                        const isSelfAdmin = isSelf && member.role === 'Organization Admin';
                        return (
                          <button
                            onClick={() => handleRemoveStaff(member.id, member.name, member.email, member.role)}
                            title={isSelfAdmin ? 'Hand over Org Admin role first, then ask the new admin to remove your account' : undefined}
                            className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all border ${
                              isSelfAdmin
                                ? 'bg-[var(--bg-base)] dark:bg-[var(--bg-subtle)] text-slate-300 dark:text-[var(--text-muted)] border-[var(--border)] dark:border-[var(--border)] cursor-not-allowed'
                                : 'bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 border-rose-200 dark:border-rose-500/30'
                            }`}
                          >
                            {isSelfAdmin ? 'Cannot Remove' : 'Remove'}
                          </button>
                        );
                      },
                    },
                  ];
                  if (canReadOrgMembers) columns.splice(2, 0, {
                    key: 'workspaceAccess',
                    header: 'Workspace Access',
                    cell: member => <div className="flex min-w-40 items-center gap-2">
                      <span className="text-xs text-[var(--text-secondary)]">{assignedWorkspaces(member.id).length} workspace(s)</span>
                      {canManageOrgMembers && <button type="button" onClick={() => { setOrgAccessError(''); openMemberDetails(member); }} className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]">Manage Access</button>}
                    </div>,
                  });
                  if (!canReadOrgMembers) columns.splice(2);
                  if (canManageWorkspaceMembers) columns.splice(canReadOrgMembers ? 2 : columns.length, 0, {
                    key: 'workspaceRole',
                    header: 'Workspace Role',
                    cell: member => {
                      const assignment = workspaceMembers.find(row => row.memberId === member.id);
                      if (!assignment) return <span className="text-xs text-slate-400">No workspace access</span>;
                      const assigned = assignment.assignmentStatus === 'Active';
                      return (
                        <div className="flex min-w-48 items-center gap-2">
                          <select
                            aria-label={`Workspace role for ${member.name || member.email || member.id}`}
                            value={assigned ? assignment.workspaceRole || '' : ''}
                            disabled={assignment.memberStatus.toLowerCase() !== 'active' || savingWorkspaceMember === member.id}
                            onChange={event => updateWorkspaceMemberRole(assignment, event.target.value)}
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-2 py-1.5 text-xs text-[var(--text-primary)] disabled:opacity-50"
                          >
                            <option value="">No workspace access</option>
                            <option value="Workspace Admin">Workspace Admin</option>
                            <option value="Manager">Manager</option>
                            <option value="Member">Member</option>
                            <option value="Viewer">Viewer</option>
                          </select>
                          {savingWorkspaceMember === member.id && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-sky-600" />}
                        </div>
                      );
                    },
                  });
                  return (
                    <DataTable
                      bare
                      resizable
                      paginated
                      columns={columns}
                      rows={filteredStaff}
                      rowKey={(member) => member.id}
                      isRowExpanded={(member) => editFlagsFor === member.id}
                      renderExpandedRow={(member) => (
                        <div className="px-6 pb-4 pt-0 bg-indigo-50/40 dark:bg-indigo-500/5">
                          <div className="border border-indigo-100 dark:border-indigo-500/20 rounded-[9px] p-4 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] space-y-3">
                            <p className="text-[10px] font-bold text-slate-400 dark:text-[var(--text-muted)] uppercase tracking-wider">
                              Feature Access — {member.name}
                            </p>
                            <FlagGroupPicker
                              availableKeys={orgAllowedFlags}
                              onApply={(keys) => setEditFlagsValue(keys)}
                            />
                            <div className="flex flex-wrap gap-2">
                              {FEATURE_REGISTRY.filter(f => orgAllowedFlags.includes(f.key)).map((flag) => {
                                const active = editFlagsValue.includes(flag.key);
                                return (
                                  <button
                                    key={flag.key}
                                    type="button"
                                    onClick={() =>
                                      setEditFlagsValue(prev =>
                                        prev.includes(flag.key)
                                          ? prev.filter(k => k !== flag.key)
                                          : [...prev, flag.key]
                                      )
                                    }
                                    className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                                      active
                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                        : 'bg-[var(--bg-surface)] dark:bg-[var(--bg-subtle)] text-slate-500 dark:text-[var(--text-secondary)] border-[var(--border)] dark:border-[var(--border)] hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400'
                                    }`}
                                  >
                                    {flag.label}
                                  </button>
                                );
                              })}
                            </div>
                            <div className="flex items-center gap-2 justify-end pt-1">
                              <button
                                type="button"
                                onClick={() => setEditFlagsFor(null)}
                                className="text-xs text-slate-400 dark:text-[var(--text-muted)] hover:text-slate-600 dark:hover:text-[var(--text-primary)] font-medium px-3 py-1.5 cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveFlags(member.id)}
                                disabled={savingFlags}
                                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-semibold rounded-lg px-4 py-1.5 transition-all cursor-pointer flex items-center gap-1.5"
                              >
                                {savingFlags ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                Save Access
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    />
                  );
                })()}
              </Widget>
              )}



              {/* Add Member overlay modal */}
              {accessMember && <SlideOver open onClose={closeDetails}
                title={<span className="flex items-center gap-2">{detailHistory.length > 0 && <IconButton icon={ArrowLeft} variant="secondary" label="Back to previous details" onClick={backDetails} />}
                  {accessMember.name || accessMember.email}</span>}
                subtitle="Workspace memberships, roles, and effective feature grants." maxWidth="max-w-2xl">
                <div className="space-y-3">
                  {orgAccessError && <p role="alert" className="text-xs text-rose-700">{orgAccessError}</p>}
                  {workspaceFeatureError && <p role="alert" className="text-xs text-rose-700">Feature access unavailable: {workspaceFeatureError}</p>}
                  {!orgWorkspaces.length && <p className="text-xs text-[var(--text-muted)]">No organization workspaces available.</p>}
                  {orgWorkspaces.map(workspace => {
                    const assignment = orgAssignments[workspace.id]?.find(row => row.memberId === accessMember.id);
                    const active = assignment?.assignmentStatus === 'Active' && accessMember.status === 'Active';
                    const role = active ? assignment?.workspaceRole || '' : '';
                    const policy = workspaceFeatureRows.find(row => row.id === workspace.id);
                    const orgKeys = new Set(workspaceFeatureAllowed);
                    const workspaceKeys = new Set(policy?.enabledFeatures || []);
                    const eligible = policy
                      ? workspaceFeatureAllowed.filter(key => workspaceKeys.has(key))
                      : [];
                    const workspaceAdmin = role === 'Workspace Admin';
                    const individualKeys = new Set(accessMember.featureFlags || []);
                    const features = active && policy
                      ? eligible.filter(key => orgKeys.has(key) && (workspaceAdmin || individualKeys.has(key)))
                      : [];
                    return <div key={workspace.id} className="space-y-3 rounded-xl border border-[var(--border)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <button type="button" onClick={() => openWorkspaceDetails(workspace)}
                            className="text-left text-xs font-semibold text-[var(--accent)] hover:underline">{workspace.name}</button>
                          <p className="mt-1 text-[11px] text-[var(--text-muted)]">{active ? `Active access · ${role}` : 'No active access'}</p>
                        </div>
                        <select aria-label={`Workspace role in ${workspace.name}`} value={active ? role : ''}
                          disabled={!canManageOrgMembers || accessSaving === workspace.id || accessMember.status !== 'Active'}
                          onChange={event => void updateOrgAccess(accessMember.id, workspace.id, event.target.value)}
                          className="rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-2.5 py-2 text-xs text-[var(--text-primary)] disabled:opacity-50">
                          <option value="">No access</option><option value="Workspace Admin">Workspace Admin</option><option value="Manager">Manager</option><option value="Member">Member</option><option value="Viewer">Viewer</option>
                        </select>
                      </div>
                      {active && <div className="border-t border-[var(--border)] pt-3">
                        <p className="mb-2 text-[11px] font-semibold text-[var(--text-secondary)]">Available features ({features.length})</p>
                        {workspaceFeatureLoading
                          ? <p className="text-xs text-[var(--text-muted)]">Loading feature grants…</p>
                          : !policy
                            ? <p className="text-xs text-[var(--text-muted)]">Feature grants unavailable. No permissions are assumed.</p>
                            : features.length
                              ? <div className="flex flex-wrap gap-1.5">{features.map(key => {
                                  const feature = FEATURE_REGISTRY.find(item => item.key === key);
                                  return <span key={key} className="rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-1 text-[11px] text-[var(--text-primary)]">{feature?.label || key}</span>;
                                })}</div>
                              : <p className="text-xs text-[var(--text-muted)]">No product features granted in this workspace.</p>}
                        {policy && !policy.configured && <p className="mt-2 text-[11px] text-[var(--text-muted)]">Legacy workspace: no explicit workspace feature restrictions are configured. Role and individual permissions still apply.</p>}
                        {role === 'Viewer' && <p className="mt-2 text-[11px] text-[var(--text-muted)]">Viewer access is read-only.</p>}
                      </div>}
                    </div>;
                  })}
                  <p className="text-[11px] text-[var(--text-muted)]">Feature access reflects organization grants, workspace feature policies, and staff grants. Changes to workspace roles save immediately; the backend protects the last workspace administrator.</p>
                </div>
              </SlideOver>}
              {showOwnerTransfer && (
                <Modal open onClose={() => { if (!transferringOwner) setShowOwnerTransfer(false); }} title="Transfer Organization Ownership" subtitle="The selected active member becomes Owner. You retain Organization Admin access.">
                  <div className="space-y-4 p-4">
                    {ownerTransferError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{ownerTransferError}</div>}
                    <label className="block space-y-1">
                      <span className="text-[10px] font-bold uppercase text-slate-500">New Owner</span>
                      <select value={ownerTransferTarget} onChange={event => setOwnerTransferTarget(event.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-primary)]">
                        <option value="">Select an active team member</option>
                        {teamMembers.filter(member => member.status === 'Active' && member.id !== currentOwnerMember?.id).map(member => <option key={member.id} value={member.id}>{member.name || member.email} · {member.email}</option>)}
                      </select>
                    </label>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setShowOwnerTransfer(false)} disabled={transferringOwner} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-secondary)]">Cancel</button>
                      <button type="button" onClick={transferOrganizationOwner} disabled={!ownerTransferTarget || transferringOwner} className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{transferringOwner && <Loader2 className="h-3 w-3 animate-spin" />}{transferringOwner ? 'Transferring…' : 'Transfer Ownership'}</button>
                    </div>
                  </div>
                </Modal>
              )}

              {showAddStaff && canManageOrgMembers && (
                <Modal
                  open
                  onClose={() => setShowAddStaff(false)}
                  title="Add Team Member"
                  subtitle="An account is provisioned through the environment authentication provider. In production, users authenticate through Google Identity Platform."
                  maxWidth="max-w-lg"
                >
                    <form onSubmit={(e) => { handleAddStaff(e); if (!staffAddMsg || staffAddMsg.type === 'success') setShowAddStaff(false); }} className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Full Name</label>
                            <input type="text" required value={newStaffName} onChange={(e) => setNewStaffName(e.target.value)} placeholder="Jane Smith" className="w-full bg-[var(--bg-base)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Email</label>
                            <input type="email" required value={newStaffEmail} onChange={(e) => setNewStaffEmail(e.target.value)} placeholder="jane@company.com" className="w-full bg-[var(--bg-base)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Phone</label>
                            <input type="tel" value={newStaffPhone} onChange={(e) => setNewStaffPhone(e.target.value)} placeholder="+91 98765 43210" className="w-full bg-[var(--bg-base)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Job title</label>
                            <select value={newStaffRole} onChange={(e: any) => setNewStaffRole(e.target.value)} className="w-full bg-[var(--bg-base)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500">
                              <option value="Sales Manager">Sales Manager</option>
                              <option value="Member">Member</option>
                              <option value="Manager">Manager</option>
                              <option value="Viewer">Viewer (read-only)</option>
                              <option value="Workspace Admin">Workspace Admin</option>
                              <option value="Billing Admin">Billing Admin (organization billing)</option>
                              <option value="Loan Agent">Loan Agent</option>
                              <option value="Collection Agent">Collection Agent</option>
                              <option value="AI Agent Manager">AI Agent Manager</option>
                            </select>
                          </div>
                        </div>

                        <div className="rounded-[9px]">
                          <FlagGroupPicker
                            availableKeys={orgAllowedFlags}
                            value={newStaffFeatures}
                            onApply={setNewStaffFeatures}
                            compact
                          />
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-1">
                          <button type="button" onClick={() => setShowAddStaff(false)} className="text-xs text-slate-400 hover:text-slate-600 font-medium px-3 py-2 cursor-pointer">Cancel</button>
                          <button type="submit" disabled={addingStaff} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-semibold rounded-lg px-5 py-2 transition-all cursor-pointer flex items-center gap-2">
                            {addingStaff ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                            {addingStaff ? 'Adding…' : 'Add Member'}
                          </button>
                        </div>
                      </form>
                </Modal>
              )}
            </div>
          )}

          {/* Organization-level billing and credit ledger, followed by workspace usage. */}
          {subTab === 'billing' && (
            <div className="col-span-12 grid grid-cols-12 content-start gap-4 md:gap-5 xl:gap-6">
              {billingUsageError && <div role="alert" className="col-span-12 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                Billing usage could not be loaded: {billingUsageError}
                <button type="button" onClick={() => void loadBillingUsage()} className="ml-2 font-semibold underline">Retry</button>
              </div>}
              {billingPanel === 'dashboard' && <Widget title="Billing summary" icon={CreditCard} accent="#0891b2" padding="md"
                action={<div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setBillingPanel('usage')} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)]">Call usage</button>
                  <button type="button" onClick={() => setBillingPanel('plan')} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)]">Subscription</button>
                </div>}>
                <div className="grid grid-cols-12 gap-4 pt-2">
                  <KpiCard colSpan={4} span={{ xs: 12, sm: 6, lg: 4 }} label="Monthly subscription"
                    value={organizationPricing ? formatInr(organizationPricing.totalMonthlyInr) : '—'}
                    sub={organizationPricing ? `${organizationPricing.workspaceCount} workspaces` : 'Fixed plan price'} />
                  <KpiCard colSpan={4} span={{ xs: 12, sm: 6, lg: 4 }} label="Usage this period"
                    value={workspaceBilling ? formatInr(workspaceBilling.periodSpendInr) : '—'}
                    sub="Recorded organization call costs" />
                  <KpiCard colSpan={4} span={{ xs: 12, sm: 6, lg: 4 }} label="Call time"
                    value={formatCallTime(workspaceBilling?.aiMinutesUsed)}
                    sub={workspaceBilling?.budgetPeriod?.label || 'Current billing period'} />
                </div>
                {billingUsageLoading && <p role="status" className="mt-3 text-xs text-[var(--text-muted)]">Updating billing totals…</p>}
              </Widget>}
              <OrganizationTopUp canSubmit={can('billing.payment.submit')} view={billingPanel} onNavigate={setBillingPanel} />
              {billingPanel === 'plan' && organizationPricing && (
                <Widget title="Organization subscription" icon={CreditCard} accent="#0891b2" padding="md">
                  <p className="text-lg font-semibold text-[var(--text-primary)]">{formatInr(organizationPricing.totalMonthlyInr)} / month</p>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    {organizationPricing.workspaceCount} workspace(s) · {organizationPricing.additionalIndustries} additional industry pack(s).
                    Usage charges and applicable taxes are additional.
                  </p>
                </Widget>
              )}
              {billingPanel === 'usage' && <>
                <Widget title="Call & Post-call Usage" subtitle={`${workspaceBilling?.budgetPeriod?.label || 'Current billing period'} · Organization-wide recorded usage`}
                  icon={Phone} accent="#0891b2" padding="md">
                  <div className="grid grid-cols-12 gap-4 pt-2">
                    <KpiCard colSpan={3} span={{ xs: 12, sm: 6, lg: 3 }} label="Calls"
                      value={billingCallCount ?? '—'} sub="Recorded calls in period" />
                    <KpiCard colSpan={3} span={{ xs: 12, sm: 6, lg: 3 }} label="Call time"
                      value={formatCallTime(workspaceBilling?.aiMinutesUsed)} sub="Total conversation duration" />
                    <KpiCard colSpan={3} span={{ xs: 12, sm: 6, lg: 3 }} label="AI call + post-call"
                      value={workspaceBilling ? formatInr(workspaceBilling.aiSpendInr) : '—'}
                      sub="Combined voice and post-call processing" />
                    <KpiCard colSpan={3} span={{ xs: 12, sm: 6, lg: 3 }} label={phoneChargesBillable ? 'Phone charges' : 'Phone cost (estimate)'}
                      value={workspaceBilling ? formatInr(workspaceBilling.phoneSpendInr) : '—'}
                      sub={phoneChargesBillable ? 'Recorded provider charges' : 'Own provider account; not billed by platform'} />
                  </div>
                  <p className="mt-3 text-[11px] text-[var(--text-muted)]">
                    AI call and post-call costs are combined into one figure. Provider costs are separate and are already included in total recorded usage spend.
                  </p>
                  {billingUsageLoading && <p role="status" className="mt-2 text-xs text-[var(--text-muted)]">Updating usage…</p>}
                </Widget>
                <Widget title="Spending & Limits" subtitle="Organization billing totals and selected workspace limit" icon={CreditCard} accent="#f59e0b" padding="md">
                  <div className="grid grid-cols-12 gap-4 pt-2">
                    <KpiCard colSpan={4} span={{ xs: 12, sm: 6, lg: 4 }} label="Total recorded spend"
                      value={workspaceBilling ? formatInr(workspaceBilling.periodSpendInr) : '—'} sub="Calls, post-call AI and phone costs" />
                    <KpiCard colSpan={4} span={{ xs: 12, sm: 6, lg: 4 }} label="Workspace monthly cap"
                      value={!workspaceBilling ? '—' : workspaceBilling.monthlyBudgetInr == null ? 'No cap' : formatInr(workspaceBilling.monthlyBudgetInr)}
                      sub={workspaceBilling?.workspaceName || 'Selected workspace'} />
                    <KpiCard colSpan={4} span={{ xs: 12, sm: 6, lg: 4 }} label="Cap remaining (reported)"
                      value={workspaceBilling?.remainingBudgetInr == null ? '—' : formatInr(workspaceBilling.remainingBudgetInr)}
                      sub="Based on the billing console" />
                    {orgSettings.billingMethod === 'recharge_based' && <KpiCard colSpan={4} span={{ xs: 12, sm: 6, lg: 4 }}
                      label="Available call balance"
                      value={formatInr(Math.max(0, Number(orgSettings.rechargeBalanceInr ?? 0) - Number(orgSettings.rechargeReservedInr ?? 0)))}
                      sub="Less reservations for active calls" />}
                  </div>
                  {can('workspace.settings.manage') && workspaceBilling && <div className="mt-4 flex flex-col items-stretch gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-end">
                    <label className="flex-1 text-xs text-[var(--text-secondary)]">
                      Monthly workspace cap (INR)
                      <input type="number" min="0" step="0.01" value={workspaceBudgetDraft}
                        onChange={event => setWorkspaceBudgetDraft(event.target.value)}
                        placeholder="Leave blank for no cap"
                        className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 font-mono text-sm text-[var(--text-primary)]" />
                    </label>
                    <button type="button" onClick={() => void saveWorkspaceBudget()} disabled={savingWorkspaceBudget}
                      className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                      {savingWorkspaceBudget ? 'Saving…' : 'Save cap'}
                    </button>
                  </div>}
                  {workspaceBudgetError && <p role="alert" className="mt-2 text-xs text-rose-600">{workspaceBudgetError}</p>}
                  <p className="mt-3 text-[11px] text-[var(--text-muted)]">
                    Spend totals from the current billing API cover the organization; the cap belongs to the selected workspace.
                    Outbound calls stop when the workspace cap is reached, but active calls may finish slightly over the cap.
                    The organization wallet remains shared.
                  </p>
                </Widget>
              </>}
            </div>
          )}

          {/* Subtab: API details & Audit Logs */}
          {subTab === 'api' && (
            <div className="col-span-12 grid grid-cols-12 content-start gap-4 md:gap-5 xl:gap-6">
              <Widget title="Third-Party Gateway API Credentials" subtitle="Configure active server tokens utilized by automated calling triggers and OCR engines." icon={Key} accent="#6366f1" padding="md">
                <div className="space-y-3.5">
                  {orgSettings.apiKeys.map((k, idx) => (
                    <div key={idx} className="p-4 bg-[var(--bg-base)] rounded-[9px] border border-[var(--border)] flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-slate-700">{k.service}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5 font-mono">Last accessed {new Date(k.lastUsed).toLocaleString()}</p>
                      </div>
                      <strong className="font-mono text-slate-600">{k.key}</strong>
                    </div>
                  ))}
                </div>
              </Widget>

              {/* Security audit logs */}
              <Widget
                title="Administrative Audit Trail"
                icon={ScrollText}
                accent="#6366f1"
                padding="none"
                action={
                  <span className="text-[10px] font-mono text-slate-400 dark:text-[var(--text-muted)]">Total events: {auditLogs.length}</span>
                }
              >
                {auditLogs.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 dark:text-[var(--text-muted)] text-xs">No admin actions recorded yet.</div>
                ) : (
                  <DataTable
                    bare
                    resizable
                    paginated
                    columns={[
                      { key: 'action', header: 'Action', cell: (log: AuditEntry) => <span className="font-medium text-slate-700 dark:text-[var(--text-primary)] font-mono text-xs">{log.action}</span> },
                      { key: 'actor', header: 'Actor', cell: (log: AuditEntry) => <span className="text-slate-400 dark:text-[var(--text-muted)] font-mono text-xs">{log.actorEmail || '—'}</span> },
                      { key: 'time', header: 'Time', align: 'right', cell: (log: AuditEntry) => <span className="text-[9px] text-slate-400 dark:text-[var(--text-muted)] font-mono">{new Date(log.createdAt).toLocaleTimeString()}</span> },
                    ]}
                    rows={auditLogs}
                    rowKey={(log) => log.id}
                  />
                )}
              </Widget>
            </div>
          )}

      </div>
    </PageShell>
  );
}
