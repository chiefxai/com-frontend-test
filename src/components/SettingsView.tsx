import React, { useState, useEffect } from 'react';
import {
  Settings,
  Phone,
  Users,
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
import { deleteStaffMember, updateStaffMemberStatus } from '../lib/staffMemberMutations';
import { useAuthorization } from '../lib/authorization';
import { useRefresh } from '../lib/RefreshContext';
import { VirtualNumber, TeamMember, OrganizationSettings, UserRole } from '../types';
import { COST_PER_MINUTE_INR_FALLBACK } from '../lib/pricing';
import { FEATURE_REGISTRY } from '../features/feature-flags/registry';
import FeatureAccessSelector from './ui/FeatureAccessSelector';
import WorkspaceFeaturePolicyEditor from './ui/WorkspaceFeaturePolicyEditor';
import { visibleWorkspaceFeatureKeys, effectiveWorkspaceMemberKeys } from '../lib/workspaceMemberFeatures';
import { getStaffWorkspaceRole, organizationScopedRole, workspaceRoleOptions, canAssignWorkspaceRole } from '../lib/staffWorkspaceRoles';
import { createWorkspaceFeatureDraft, setWorkspaceFeatureDraftKeys, shouldSaveWorkspaceFeatureDraft, type WorkspaceFeatureDraft } from '../lib/workspaceFeatureDraft';
import Button from './ui/Button';
import { useToast } from './ui/Toast';
import IconButton from './ui/IconButton';
import PageShell from './ui/PageShell';
import BreadcrumbTitle from './ui/BreadcrumbTitle';
import Widget from './ui/Widget';
import Modal from './ui/Modal';
import SlideOver from './ui/SlideOver';
import DataTable, { Column } from './ui/DataTable';
import FilterBar from './ui/FilterBar';
import BillingWorkspace from './billing/BillingWorkspace';
import OrganizationTelephonyConnectors from './settings/OrganizationTelephonyConnectors';
import WorkspaceManagement from './WorkspaceManagement';
import WorkspaceSharing from './WorkspaceSharing';
import type { BillingPanel } from './billing/OrganizationTopUp';

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
  activeWorkspaceId?: string;
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
  /** Null inherits member grants; an array overrides features in this workspace only. */
  featureFlags?: string[] | null;
  canDelete?: boolean;
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
  activeWorkspaceId,
  multipleWorkspacesEnabled = false,
  workspaceSharingEnabled = false,
  onWorkspaceCreated = async () => {},
}: SettingsViewProps) {
  const { can, authorization } = useAuthorization();
  const { showToast } = useToast();
  const [staffMutationId, setStaffMutationId] = useState<string | null>(null);
  const canReadOrganization = can('organization.read');
  const canReadOrgMembers = can('organization.members.read');
  const canManageOrgMembers = can('organization.members.manage');
  const canManageOrganization = can('organization.manage');
  const canManageWorkspaceMembers = can('workspace.members.manage');
  const canCreateTeamMembers = canManageOrgMembers || canManageWorkspaceMembers;
  const managerInWorkspace = authorization?.workspaceRole === 'Manager' && !canManageOrgMembers;
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

  // Workspace-level allowed features are a ceiling for member grants.
  // Empty policies stay deny-all until an organization administrator updates them.
  const [workspaceFeatureRows, setWorkspaceFeatureRows] = useState<{id:string;name:string;configured:boolean;enabledFeatures:string[]}[]>([]);
  const [workspaceFeatureAllowed, setWorkspaceFeatureAllowed] = useState<string[]>([]);
  const [workspaceFeatureLoading, setWorkspaceFeatureLoading] = useState(false);
  const [workspaceFeatureError, setWorkspaceFeatureError] = useState('');
  const [workspacePolicySaving, setWorkspacePolicySaving] = useState<string | null>(null);
  const [workspacePolicySaveError, setWorkspacePolicySaveError] = useState('');
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
    if (!can('workspace.read')) {
      setConnectedChannels([]);
      return;
    }
    apiFetch('/api/channels').then((r) => r.ok ? r.json() : null).then((list) => {
      if (Array.isArray(list)) setConnectedChannels(list);
    }).catch(() => {});
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

  // Organization entitlements and workspace-assignable grants are different
  // scopes. Ignore stale workspace fetches when switching contexts.
  const currentWorkspaceId = activeWorkspaceId || orgSettings.id;
  const [workspaceAssignableFlags, setWorkspaceAssignableFlags] = useState<string[]>([]);
  const [workspaceAssignableError, setWorkspaceAssignableError] = useState('');
  const [workspaceAssignableLoading, setWorkspaceAssignableLoading] = useState(false);
  const [workspaceAssignableRefresh, setWorkspaceAssignableRefresh] = useState(0);
  useEffect(() => {
    if (subTab !== 'team' || !canManageWorkspaceMembers || canManageOrgMembers) return;
    let cancelled = false;
    setWorkspaceAssignableFlags([]);
    setWorkspaceAssignableError('');
    setWorkspaceAssignableLoading(true);
    apiFetch('/api/settings/workspace/assignable-features')
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(body.featureFlags)) {
          throw new Error(body.error || 'Unable to load assignable features.');
        }
        if (!cancelled) setWorkspaceAssignableFlags(body.featureFlags);
      })
      .catch(error => {
        if (!cancelled) setWorkspaceAssignableError(error instanceof Error ? error.message : 'Unable to load assignable features.');
      })
      .finally(() => { if (!cancelled) setWorkspaceAssignableLoading(false); });
    return () => { cancelled = true; };
  }, [subTab, canManageWorkspaceMembers, canManageOrgMembers, currentWorkspaceId, workspaceAssignableRefresh]);
  const orgAllowedFlags = canManageOrgMembers ? workspaceFeatureAllowed : workspaceAssignableFlags;
  const featureChoicesLoading = canManageOrgMembers ? workspaceFeatureLoading : workspaceAssignableLoading;
  const featureChoicesError = canManageOrgMembers ? workspaceFeatureError : workspaceAssignableError;
  const retryFeatureChoices = () => {
    if (canManageOrgMembers) void loadWorkspaceFeatures();
    else setWorkspaceAssignableRefresh(value => value + 1);
  };

  // Team Member states
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<UserRole>('Member');
  const [newStaffFeatures, setNewStaffFeatures] = useState<string[]>([]);
  const [addingStaff, setAddingStaff] = useState(false);
  const [staffAddMsg, setStaffAddMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberAssignment[]>([]);
  const [workspaceMembersError, setWorkspaceMembersError] = useState('');
  const [orgWorkspaces, setOrgWorkspaces] = useState<{id:string;name:string;status:string}[]>([]);
  const [orgAssignments, setOrgAssignments] = useState<Record<string, WorkspaceMemberAssignment[]>>({});
  const [accessMember, setAccessMember] = useState<TeamMember | null>(null);
  const [staffWorkspaceFilter, setStaffWorkspaceFilter] = useState('');
  // Without an explicit table filter, show the workspace switcher's roles,
  // not organization-wide roles.
  const roleWorkspaceId = staffWorkspaceFilter || currentWorkspaceId;
  const [staffRoleFilter, setStaffRoleFilter] = useState('');
  const [staffStatusFilter, setStaffStatusFilter] = useState('');
  useEffect(() => {
    // Avoid applying a previous workspace's role filter after switching.
    setStaffWorkspaceFilter('');
    setStaffRoleFilter('');
  }, [currentWorkspaceId]);
  const [accessSaving, setAccessSaving] = useState('');
  const [workspaceFeatureEditor, setWorkspaceFeatureEditor] = useState<{
    workspaceId: string; memberId: string; value: string[];
  } | null>(null);
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
  }, [subTab, canReadOrgMembers, loadOrganizationAccess, currentWorkspaceId]);
  const updateOrgAccess = async (memberId: string, workspaceId: string, role: string) => {
    setAccessSaving(workspaceId);
    setOrgAccessError('');
    setWorkspaceFeatureEditor(null);
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

  const saveWorkspacePolicy = async (workspaceId: string, keys: string[]) => {
    if (!canManageOrganization || workspacePolicySaving) return false;
    setWorkspacePolicySaving(workspaceId);
    setWorkspacePolicySaveError('');
    try {
      const response = await apiFetch(
        `/api/settings/organization/workspace-features/${encodeURIComponent(workspaceId)}`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabledFeatures: keys }) },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Could not update workspace features.');
      await loadWorkspaceFeatures();
      // An in-progress member edit must not contain options that are now disallowed.
      setWorkspaceFeatureEditor(null);
      showToast('Workspace feature policy saved.', 'success');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update workspace features.';
      setWorkspacePolicySaveError(message);
      showToast(message, 'error');
      return false;
    } finally {
      setWorkspacePolicySaving(null);
    }
  };

  const saveWorkspaceFeatureAccess = async (memberId: string, workspaceId: string, keys: string[] | null) => {
    setAccessSaving(workspaceId);
    setOrgAccessError('');
    try {
      const response = await apiFetch(
        `/api/settings/organization/workspace-access/${encodeURIComponent(workspaceId)}/${encodeURIComponent(memberId)}/features`,
        keys === null ? { method: 'DELETE' } : {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ featureFlags: keys }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Could not update workspace features.');
      await loadOrganizationAccess();
      setWorkspaceFeatureEditor(null);
    } catch (error) {
      setOrgAccessError(error instanceof Error ? error.message : 'Could not update workspace features.');
    } finally {
      setAccessSaving('');
    }
  };

  const memberWorkspaceFeatures = (member: TeamMember, workspaceId: string) => {
    if (workspaceFeatureLoading || workspaceFeatureError || orgAccessError) return null;
    if (!Object.prototype.hasOwnProperty.call(orgAssignments, workspaceId)) return null;
    const policy = workspaceFeatureRows.find(row => row.id === workspaceId);
    const assignment = orgAssignments[workspaceId]?.find(row => row.memberId === member.id);
    return effectiveWorkspaceMemberKeys(workspaceFeatureAllowed, policy, assignment, member.featureFlags);
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
    setWorkspaceFeatureEditor(null);
    setWorkspacePolicySaveError('');
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

  const staffMemberRole = (member: TeamMember) => getStaffWorkspaceRole(
    member.id, roleWorkspaceId, orgAssignments, currentWorkspaceId,
    workspaceMembers, !canReadOrgMembers, member.role,
  );
  const visibleInWorkspace = (member: TeamMember, workspaceId: string) =>
    Boolean(organizationScopedRole(member.role))
    || assignedWorkspaces(member.id).some(workspace => workspace.id === workspaceId);

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
  }, [subTab, canManageWorkspaceMembers, loadWorkspaceMembers, currentWorkspaceId]);

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

  // Inline editing always targets the current workspace. Organization admins
  // manage per-workspace grants through the scoped member details drawer.
  const [editFlagsFor, setEditFlagsFor] = useState<string | null>(null);
  const [editFlagsDraft, setEditFlagsDraft] = useState<WorkspaceFeatureDraft | null>(null);
  const [editFlagsError, setEditFlagsError] = useState('');
  const [savingFlags, setSavingFlags] = useState(false);

  const openFlagEditor = (member: TeamMember) => {
    const assignment = workspaceMembers.find(row => row.memberId === member.id);
    if (!assignment || assignment.assignmentStatus !== 'Active') return;
    setEditFlagsFor(member.id);
    setEditFlagsDraft(createWorkspaceFeatureDraft(assignment.featureFlags));
    setEditFlagsError('');
  };

  const handleSaveFlags = async (memberId: string) => {
    if (savingFlags || !canManageWorkspaceMembers || canManageOrgMembers) return;
    // An untouched inherited grant must not be converted into an empty override.
    if (!shouldSaveWorkspaceFeatureDraft(editFlagsDraft)) {
      setEditFlagsFor(null);
      return;
    }
    setSavingFlags(true);
    setEditFlagsError('');
    try {
      const response = await apiFetch(`/api/settings/workspace/members/${encodeURIComponent(memberId)}/features`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureFlags: editFlagsDraft!.selectedKeys }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to update workspace feature access.');
      const saved = Array.isArray(data.featureFlags) ? data.featureFlags : editFlagsDraft!.selectedKeys;
      setWorkspaceMembers(previous => previous.map(row =>
        row.memberId === memberId ? { ...row, featureFlags: saved } : row));
      setEditFlagsFor(null);
      setEditFlagsDraft(null);
      showToast('Workspace feature access saved.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update feature access.';
      setEditFlagsError(message);
      showToast(message, 'error');
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
          role: canManageOrgMembers ? newStaffRole : 'Member',
          workspaceRole: canManageOrgMembers
            ? (['Workspace Admin','Manager','Member','Viewer'].includes(newStaffRole) ? newStaffRole : undefined)
            : newStaffRole,
          featureFlags: newStaffFeatures,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const message = data.error || 'Failed to add member';
        setStaffAddMsg({ type: 'error', text: message });
        showToast(message, 'error');
        return;
      }
      setTeamMembers((prev) => [...prev, { ...data, role: canManageOrgMembers ? data.role : newStaffRole }]);
      if (canManageWorkspaceMembers) await loadWorkspaceMembers().catch(() => {});
      setNewStaffName('');
      setNewStaffEmail('');
      setNewStaffPhone('');
      setNewStaffFeatures([]);
      setNewStaffRole('Member');
      showToast(
        data.credsSent
          ? `${newStaffName} added — credentials sent to ${newStaffEmail}`
          : `${newStaffName} added successfully`,
        'success',
      );
      setShowAddStaff(false);
    } catch {
      setStaffAddMsg({ type: 'error', text: 'Could not reach the server' });
      showToast('Could not reach the server.', 'error');
    } finally {
      setAddingStaff(false);
    }
  };


  // Do not change the local member list until the API confirms success.
  const handleRemoveStaff = async (staffId: string, name: string, memberEmail: string, memberRole: string) => {
    if (staffMutationId) return;
    const isSelf = currentUserEmail && memberEmail.toLowerCase() === currentUserEmail.toLowerCase();
    if (isSelf && memberRole === 'Organization Admin') {
      alert('Transfer your Organization Admin role before removing your own account.');
      return;
    }
    if (!window.confirm(`Remove ${name} from the team? This cannot be undone.`)) return;
    setStaffMutationId(staffId);
    try {
      await deleteStaffMember(staffId);
      setTeamMembers(previous => previous.filter(member => member.id !== staffId));
      setWorkspaceMembers(previous => previous.filter(member => member.memberId !== staffId));
      showToast('Member removed.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to remove team member.', 'error');
    } finally {
      setStaffMutationId(null);
    }
  };

  const handleToggleStaffStatus = async (staffId: string) => {
    if (staffMutationId) return;
    const member = teamMembers.find(row => row.id === staffId);
    if (!member) return;
    const nextStatus = member.status === 'Active' ? 'Inactive' : 'Active';
    setStaffMutationId(staffId);
    try {
      await updateStaffMemberStatus(staffId, nextStatus);
      setTeamMembers(previous => previous.map(row =>
        row.id === staffId ? { ...row, status: nextStatus } : row));
      showToast(nextStatus === 'Active' ? 'Member reactivated.' : 'Member deactivated.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to update member status.', 'error');
    } finally {
      setStaffMutationId(null);
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
              <OrganizationTelephonyConnectors />
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
                                const override = member.featureFlags ?? null;
                                const memberGrants = override ?? memberRecord?.featureFlags;
                                const isAdmin = member.workspaceRole === 'Workspace Admin' && override === null;
                                const effective = features && (isAdmin || Array.isArray(memberGrants))
                                  ? visibleWorkspaceFeatureKeys([...entitled],permittedByWorkspace,memberRecord?.featureFlags,override,isAdmin)
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
              {/* Organization membership and current-workspace access in one matrix. */}
              {(canReadOrgMembers || canManageWorkspaceMembers) && (
              <Widget showHeader={false} padding="none">
                {workspaceMembersError && canManageWorkspaceMembers && <div role="alert" className="mx-4 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{workspaceMembersError}</div>}
                {orgAccessError && <div role="alert" className="mx-4 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{orgAccessError}</div>}
                <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-surface)] p-4">
                  <FilterBar
                    selects={canReadOrgMembers ? [
                      { key: 'Workspace', label: 'Workspace', value: staffWorkspaceFilter, onChange: value => { setStaffWorkspaceFilter(value); setStaffRoleFilter(''); }, options: [{ label: 'All staff · current workspace roles', value: '' }, ...orgWorkspaces.map(workspace => ({ label: workspace.name, value: workspace.id }))] },
                      { key: 'Role', label: 'Role', value: staffRoleFilter, onChange: setStaffRoleFilter, options: [{ label: 'All roles', value: '' }, ...Array.from(new Set(teamMembers
                        .filter(member => !staffWorkspaceFilter || visibleInWorkspace(member, staffWorkspaceFilter))
                        .map(member => staffMemberRole(member)))).map(role => ({ label: role, value: role }))] },
                      { key: 'Status', label: 'Status', value: staffStatusFilter, onChange: setStaffStatusFilter, options: [{ label: 'All statuses', value: '' }, { label: 'Active', value: 'Active' }, { label: 'Inactive', value: 'Inactive' }] },
                    ] : []}
                    onClear={() => { setStaffWorkspaceFilter(''); setStaffRoleFilter(''); setStaffStatusFilter(''); }}
                    hasActiveFilters={Boolean(staffWorkspaceFilter || staffRoleFilter || staffStatusFilter)}
                    resultCount={canReadOrgMembers
                      ? {
                          filtered: teamMembers.filter(member =>
                            (!staffWorkspaceFilter || visibleInWorkspace(member, staffWorkspaceFilter)) &&
                            (!staffRoleFilter || staffMemberRole(member) === staffRoleFilter) &&
                            (!staffStatusFilter || member.status === staffStatusFilter)).length,
                          total: teamMembers.length,
                          label: 'members',
                        }
                      : { filtered: workspaceMembers.length, total: workspaceMembers.length, label: 'members' }}
                    actions={<>
                      {currentOwnerMember && <button type="button" onClick={() => { setOwnerTransferError(''); setShowOwnerTransfer(true); }}
                        className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-100">Transfer Owner</button>}
                      {canCreateTeamMembers && <IconButton icon={Plus} label="Add Member" onClick={() => { setStaffAddMsg(null); setShowAddStaff(true); }} />}
                    </>}
                  />
                </div>

                {(() => {
                  const scopedWorkspaceMembers = managerInWorkspace
                    ? workspaceMembers.filter(member => member.assignmentStatus === 'Active')
                    : workspaceMembers;
                  const matrixMembers: TeamMember[] = canReadOrgMembers ? teamMembers : scopedWorkspaceMembers.map(member => ({
                    id: member.memberId,
                    name: member.name || '',
                    email: member.email || '',
                    role: (organizationScopedRole(member.organizationRole) || member.workspaceRole || member.organizationRole) as UserRole,
                    status: member.memberStatus.toLowerCase() === 'inactive' ? 'Inactive' : 'Active',
                    performanceScore: 0,
                    assignedLeadsCount: 0,
                    featureFlags: member.featureFlags || [],
                    canDelete: member.canDelete,
                  }));
                  const filteredStaff = matrixMembers.filter(member =>
                    (!staffWorkspaceFilter || visibleInWorkspace(member, staffWorkspaceFilter)) &&
                    (!staffRoleFilter || staffMemberRole(member) === staffRoleFilter) &&
                    (!staffStatusFilter || member.status === staffStatusFilter));
                  const columns: Column<TeamMember>[] = [
                    {
                      key: 'member',
                      header: 'Enlisted Representative',
                      cell: (member) => (
                        <div>
                          {canReadOrgMembers ? <button type="button" onClick={() => { setOrgAccessError(''); openMemberDetails(member); }}
                            className="text-left font-semibold text-[var(--accent)] hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                            aria-label={`View workspace and feature access for ${member.name || member.email}`}>{member.name || member.email}</button>
                            : <span className="font-semibold text-[var(--text-primary)]">{member.name || member.email}</span>}
                          <p className="text-[10px] text-slate-400 dark:text-[var(--text-muted)] mt-0.5">{member.email}</p>
                          {member.phone && (
                            <p className="text-[10px] text-slate-400 dark:text-[var(--text-muted)] mt-0.5">{member.phone}</p>
                          )}
                        </div>
                      ),
                    },
                    {
                      key: 'role',
                      header: 'Role',
                      cell: member => {
                        // The selected workspace determines the role (including
                        // when the table's workspace filter has not been set).
                        const scoped = canReadOrgMembers
                          ? orgAssignments[roleWorkspaceId]?.find(row => row.memberId === member.id)
                          : workspaceMembers.find(row => row.memberId === member.id);
                        if (!organizationScopedRole(member.role) && !organizationScopedRole(scoped?.organizationRole)
                          && !canReadOrgMembers && canManageWorkspaceMembers && scoped) {
                          const assigned = scoped.assignmentStatus === 'Active';
                          const canEditRole = canAssignWorkspaceRole(managerInWorkspace, scoped.workspaceRole);
                          return <select aria-label={`Role for ${member.name || member.email}`}
                            value={assigned ? scoped.workspaceRole || '' : ''}
                            disabled={scoped.memberStatus.toLowerCase() !== 'active' || savingWorkspaceMember === member.id || !canEditRole}
                            onChange={event => void updateWorkspaceMemberRole(scoped, event.target.value)}
                            className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]">
                            <option value="">No workspace access</option>
                            {!canEditRole && scoped.workspaceRole && <option value={scoped.workspaceRole}>{scoped.workspaceRole}</option>}
                            {workspaceRoleOptions(managerInWorkspace).map(choice => <option key={choice} value={choice}>{choice}</option>)}
                          </select>;
                        }
                        const role = staffMemberRole(member);
                        return <span className="inline-flex items-center rounded-lg bg-[var(--accent-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--accent)]">
                          {role || 'No access'}
                        </span>;
                      },
                    },
                    {
                      key: 'access',
                      header: 'Feature Access',
                      cell: member => {
                        const assignment = workspaceMembers.find(row => row.memberId === member.id);
                        const orgRole = organizationScopedRole(member.role) || organizationScopedRole(assignment?.organizationRole);
                        const effective = canReadOrgMembers && !orgRole ? memberWorkspaceFeatures(member, roleWorkspaceId) : null;
                        const count = assignment?.featureFlags == null ? null
                          : assignment.featureFlags.filter(key => orgAllowedFlags.includes(key)).length;
                        const label = canReadOrgMembers
                          ? orgRole ? 'View workspace features'
                            : effective === null ? 'Unavailable' : `${effective.length} granted`
                          : assignment?.assignmentStatus !== 'Active' ? 'No access'
                            : count === null ? 'Inherited grants' : `${count} granted`;
                        if (canReadOrgMembers) {
                          return <button type="button" onClick={() => openMemberDetails(member)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--bg-subtle)]">
                            <Flag aria-hidden="true" className="h-3 w-3" /> {label}
                          </button>;
                        }
                        const editable = canManageWorkspaceMembers && !orgRole && assignment?.assignmentStatus === 'Active'
                          && canAssignWorkspaceRole(managerInWorkspace, assignment.workspaceRole);
                        return editable ? <button type="button" onClick={() => openFlagEditor(member)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--bg-subtle)]">
                          <Flag aria-hidden="true" className="h-3 w-3" /> {label}
                        </button> : <span className="text-[11px] text-[var(--text-muted)]">{label}</span>;
                      },
                    },
                    ...(canReadOrgMembers ? [{
                      key: 'status',
                      header: 'CRM Status',
                      align: 'right',
                      cell: (member) => (
                        <button
                          onClick={() => void handleToggleStaffStatus(member.id)}
                          disabled={staffMutationId !== null}
                          className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${
                            member.status === 'Active'
                              ? 'bg-emerald-50 dark:bg-emerald-500/10 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-emerald-700 dark:text-emerald-400 hover:text-rose-700 dark:hover:text-rose-400 border border-emerald-200 dark:border-emerald-500/30 hover:border-rose-200 dark:hover:border-rose-500/30'
                              : 'bg-[var(--bg-subtle)] dark:bg-[var(--bg-subtle)] hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-slate-600 dark:text-[var(--text-secondary)] hover:text-emerald-700 dark:hover:text-emerald-400 border border-[var(--border)] dark:border-[var(--border)]'
                          }`}
                        >
                          {staffMutationId === member.id ? 'Saving…' : member.status === 'Active' ? 'Deactivate' : 'Reactivate'}
                        </button>
                      ),
                    } as Column<TeamMember>] : []),
                    ...(canReadOrgMembers || managerInWorkspace ? [{
                      key: 'actions',
                      header: 'Actions',
                      align: 'right',
                      cell: (member) => {
                        const isSelf = currentUserEmail && member.email.toLowerCase() === currentUserEmail.toLowerCase();
                        const isSelfAdmin = isSelf && member.role === 'Organization Admin';
                        if (!canManageOrgMembers && !member.canDelete) return <span className="text-xs text-[var(--text-muted)]">—</span>;
                        return (
                          <button
                            onClick={() => void handleRemoveStaff(member.id, member.name, member.email, member.role)}
                            disabled={Boolean(isSelfAdmin) || staffMutationId !== null}
                            title={isSelfAdmin ? 'Hand over Org Admin role first, then ask the new admin to remove your account' : undefined}
                            className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all border ${
                              isSelfAdmin
                                ? 'bg-[var(--bg-base)] dark:bg-[var(--bg-subtle)] text-slate-300 dark:text-[var(--text-muted)] border-[var(--border)] dark:border-[var(--border)] cursor-not-allowed'
                                : 'bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 border-rose-200 dark:border-rose-500/30'
                            }`}
                          >
                            {staffMutationId === member.id ? 'Removing…' : isSelfAdmin ? 'Cannot Remove' : 'Remove'}
                          </button>
                        );
                      },
                    } as Column<TeamMember>] : []),
                  ];
                  if (canReadOrgMembers) columns.splice(2, 0, {
                    key: 'workspaceAccess',
                    header: 'Workspace Access',
                    cell: member => <div className="flex min-w-40 items-center gap-2">
                      <span className="text-xs text-[var(--text-secondary)]">{assignedWorkspaces(member.id).length} workspace(s)</span>
                      {canManageOrgMembers && <button type="button" onClick={() => { setOrgAccessError(''); openMemberDetails(member); }} className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]">Manage Access</button>}
                    </div>,
                  });
                  return (
                    <DataTable
                      bare
                      resizable
                      paginated
                      columns={columns}
                      rows={filteredStaff}
                      rowKey={(member) => member.id}
                    />
                  );
                })()}
              </Widget>
              )}



              {editFlagsFor && canManageWorkspaceMembers && !canManageOrgMembers && (
                <Modal
                  open
                  maxWidth="max-w-3xl"
                  onClose={() => { if (!savingFlags) setEditFlagsFor(null); }}
                  title={`Feature Access — ${workspaceMembers.find(member => member.memberId === editFlagsFor)?.name || 'Team member'}`}
                  subtitle="Changes apply only to the currently selected workspace."
                  footer={<>
                    <Button type="button" variant="secondary" disabled={savingFlags}
                      onClick={() => setEditFlagsFor(null)}>Cancel</Button>
                    <Button type="button" variant="primary" loading={savingFlags}
                      disabled={!shouldSaveWorkspaceFeatureDraft(editFlagsDraft) || featureChoicesLoading || Boolean(featureChoicesError)}
                      onClick={() => void handleSaveFlags(editFlagsFor)}>Save access</Button>
                  </>}
                >
                  <div className="space-y-3">
                    {editFlagsError && <p role="alert" className="text-xs text-rose-700">{editFlagsError}</p>}
                    {featureChoicesLoading && <p role="status" className="text-xs text-[var(--text-muted)]">Loading available features…</p>}
                    {featureChoicesError && <div role="alert" className="flex items-center gap-3 text-xs text-rose-700">
                      <span>{featureChoicesError}</span>
                      <Button type="button" size="sm" variant="secondary" onClick={retryFeatureChoices}>Retry</Button>
                    </div>}
                    {editFlagsDraft?.inherited && !editFlagsDraft.changed ? (
                      <div className="space-y-2 rounded-xl border border-[var(--border)] p-3">
                        <p className="text-xs text-[var(--text-secondary)]">This member inherits their default grants. No workspace override will be saved unless you customize it.</p>
                        <Button type="button" size="sm" variant="secondary"
                          disabled={featureChoicesLoading || Boolean(featureChoicesError) || orgAllowedFlags.length === 0}
                          onClick={() => setEditFlagsDraft(current => current ? setWorkspaceFeatureDraftKeys(current, current.selectedKeys) : null)}>
                          Customize for this workspace
                        </Button>
                      </div>
                    ) : (
                      <FeatureAccessSelector
                        label="Workspace feature access"
                        description="Select the permissions to override in this workspace only."
                        availableKeys={orgAllowedFlags}
                        value={editFlagsDraft?.selectedKeys || []}
                        onChange={keys => setEditFlagsDraft(current => current ? setWorkspaceFeatureDraftKeys(current, keys) : null)}
                        disabled={savingFlags || featureChoicesLoading || Boolean(featureChoicesError)}
                      />
                    )}
                  </div>
                </Modal>
              )}

              {/* Add Member overlay modal */}
              {accessMember && <SlideOver open onClose={closeDetails}
                title={<span className="flex items-center gap-2">{detailHistory.length > 0 && <IconButton icon={ArrowLeft} variant="secondary" label="Back to previous details" onClick={backDetails} />}
                  {accessMember.name || accessMember.email}</span>}
                subtitle="Roles and feature grants are independent for each workspace." maxWidth="max-w-2xl">
                <div className="space-y-3">
                  {orgAccessError && <p role="alert" className="text-xs text-rose-700">{orgAccessError}</p>}
                  {workspaceFeatureError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-xs text-rose-700">
                    <span>Workspace feature policies unavailable: {workspaceFeatureError}</span>
                    <Button type="button" size="sm" variant="secondary"
                      disabled={workspaceFeatureLoading} onClick={() => void loadWorkspaceFeatures()}>
                      Retry loading features
                    </Button>
                  </div>}
                  {orgAccessError && <Button type="button" size="sm" variant="secondary"
                    onClick={() => void loadOrganizationAccess().catch(error =>
                      setOrgAccessError(error instanceof Error ? error.message : 'Could not load workspace access.'))}>
                    Retry workspace access
                  </Button>}
                  {!orgWorkspaces.length && <p className="text-xs text-[var(--text-muted)]">No organization workspaces available.</p>}
                  {orgWorkspaces.map(workspace => {
                    const assignment = orgAssignments[workspace.id]?.find(row => row.memberId === accessMember.id);
                    const organizationRoleLabel = organizationScopedRole(accessMember.role);
                    const active = assignment?.assignmentStatus === 'Active' && accessMember.status === 'Active';
                    const role = organizationRoleLabel || (active ? assignment?.workspaceRole || '' : '');
                    const policy = workspaceFeatureRows.find(row => row.id === workspace.id);
                    const workspaceKeys = new Set(policy?.enabledFeatures || []);
                    const eligible = policy
                      ? workspaceFeatureAllowed.filter(key => workspaceKeys.has(key))
                      : [];
                    const override = assignment?.featureFlags ?? null;
                    const features = effectiveWorkspaceMemberKeys(
                      workspaceFeatureAllowed, policy, assignment, accessMember.featureFlags,
                    ) ?? [];
                    const editingFeatures = workspaceFeatureEditor?.workspaceId === workspace.id
                      && workspaceFeatureEditor.memberId === accessMember.id;
                    const canEditFeatures = canManageOrgMembers && !['Owner','Organization Admin','Super Admin'].includes(accessMember.role)
                      && accessMember.status === 'Active' && workspace.status === 'Active'
                      && Boolean(policy) && !workspaceFeatureLoading && !workspaceFeatureError;
                    const canEditPolicy = canManageOrganization && workspace.status === 'Active'
                      && Boolean(policy) && !workspaceFeatureLoading && !workspaceFeatureError;
                    return <div key={workspace.id} className="space-y-3 rounded-xl border border-[var(--border)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <button type="button" onClick={() => openWorkspaceDetails(workspace)}
                            className="text-left text-xs font-semibold text-[var(--accent)] hover:underline">{workspace.name}</button>
                          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                            {organizationRoleLabel ? 'Organization-wide administrative role; workspace permissions are separate.'
                              : active ? `Active workspace assignment · ${role}` : 'No active workspace assignment'}
                          </p>
                        </div>
                        {organizationRoleLabel ? (
                          <span className="rounded-lg border border-[var(--border)] bg-[var(--accent-subtle)] px-3 py-2 text-xs font-semibold text-[var(--accent)]">
                            {organizationRoleLabel}
                          </span>
                        ) : (
                          <select aria-label={`Workspace role in ${workspace.name}`} value={active ? role : ''}
                          disabled={!canManageOrgMembers || accessSaving === workspace.id || accessMember.status !== 'Active'}
                          onChange={event => void updateOrgAccess(accessMember.id, workspace.id, event.target.value)}
                          className="rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-2.5 py-2 text-xs text-[var(--text-primary)] disabled:opacity-50">
                          <option value="">No access</option><option value="Workspace Admin">Workspace Admin</option><option value="Manager">Manager</option><option value="Member">Member</option><option value="Viewer">Viewer</option>
                          </select>
                        )}
                      </div>
                      {policy && !workspaceFeatureError && (
                        <WorkspaceFeaturePolicyEditor
                          key={workspace.id}
                          workspaceName={workspace.name}
                          availableKeys={workspaceFeatureAllowed}
                          enabledKeys={eligible}
                          canEdit={canEditPolicy}
                          loading={workspaceFeatureLoading}
                          saving={workspacePolicySaving === workspace.id}
                          error={workspacePolicySaveError}
                          onSave={keys => saveWorkspacePolicy(workspace.id, keys)}
                        />
                      )}
                      {active && <div className="border-t border-[var(--border)] pt-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] font-semibold text-[var(--text-secondary)]">
                            Feature access ({features.length}) · {override === null ? 'Inherited' : 'Custom for this workspace'}
                          </p>
                          {canEditFeatures && <div className="flex items-center gap-2">
                            {eligible.length > 0 && <Button type="button" size="sm" variant="secondary"
                              disabled={Boolean(accessSaving) || Boolean(workspacePolicySaving)}
                              onClick={() => {
                                setWorkspaceFeatureEditor(editingFeatures ? null : {
                                  workspaceId: workspace.id, memberId: accessMember.id, value: features,
                                });
                              }}>{editingFeatures ? 'Cancel editing' : 'Manage features'}</Button>}
                            {override !== null && <Button type="button" size="sm" variant="ghost"
                              disabled={Boolean(accessSaving) || Boolean(workspacePolicySaving)}
                              onClick={() => void saveWorkspaceFeatureAccess(accessMember.id, workspace.id, null)}>
                              Inherit grants
                            </Button>}
                          </div>}
                        </div>
                        {editingFeatures && <div className="mb-3 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]/40 p-3">
                          <FeatureAccessSelector
                            label={`Features in ${workspace.name}`}
                            description="Only this member's features in this workspace are changed. Other workspaces keep their own settings."
                            availableKeys={eligible}
                            value={workspaceFeatureEditor?.value || []}
                            onChange={value => setWorkspaceFeatureEditor(current => current ? { ...current, value } : null)}
                            disabled={Boolean(accessSaving)}
                          />
                          <div className="flex justify-end">
                            <Button type="button" variant="primary" size="sm" loading={accessSaving === workspace.id}
                              onClick={() => void saveWorkspaceFeatureAccess(accessMember.id, workspace.id, workspaceFeatureEditor?.value || [])}>
                              Save workspace features
                            </Button>
                          </div>
                        </div>}
                        {!canEditFeatures && canManageOrgMembers
                          && organizationRoleLabel && <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                            Organization administrator privileges are managed at the organization level;
                            individual workspace grants are separate and cannot change this role.
                          </p>}
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
                        {role === 'Viewer' && <p className="mt-2 text-[11px] text-[var(--text-secondary)]">Viewer access is read-only.</p>}
                      </div>}
                    </div>;
                  })}
                  <p className="text-[11px] text-[var(--text-muted)]">Each workspace can have different feature grants for the same person. Inherited grants keep existing behavior; customized grants override this member's feature access only in the selected workspace. Organization and workspace policies remain upper limits. Workspace roles save immediately and the backend protects the last Workspace Admin.</p>
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

              {showAddStaff && canCreateTeamMembers && (
                <Modal
                  open
                  onClose={() => { if (!addingStaff) setShowAddStaff(false); }}
                  title="Add Team Member"
                  subtitle={canManageOrgMembers
                    ? "An account is provisioned through the environment authentication provider. In production, users authenticate through Google Identity Platform."
                    : "The new account will be assigned to your current workspace with the selected workspace role."}
                  maxWidth="max-w-3xl"
                >
                    <form onSubmit={event => { void handleAddStaff(event); }} className="space-y-4">
                        {staffAddMsg?.type === 'error' && (
                          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{staffAddMsg.text}</p>
                        )}
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
                            <label htmlFor="new-staff-role" className="text-[11px] font-semibold text-[var(--text-secondary)]">{canManageOrgMembers ? 'Role' : 'Workspace Role'}</label>
                            <select id="new-staff-role" value={newStaffRole}
                              onChange={event => setNewStaffRole(event.target.value as UserRole)}
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]">
                              <option value="Member">Member</option>
                              {!managerInWorkspace && <option value="Manager">Manager</option>}
                              <option value="Viewer">Viewer (read-only)</option>
                              {!managerInWorkspace && canManageWorkspaceMembers && <option value="Workspace Admin">Workspace Admin</option>}
                              {!managerInWorkspace && canManageOrgMembers && <option value="Billing Admin">Billing Admin</option>}
                            </select>
                          </div>
                        </div>

                        {featureChoicesLoading && <p role="status" className="text-xs text-[var(--text-muted)]">Loading available features…</p>}
                        {featureChoicesError && <div role="alert" className="flex items-center gap-3 text-xs text-rose-700">
                          <span>{featureChoicesError}</span>
                          <Button type="button" size="sm" variant="secondary" onClick={retryFeatureChoices}>Retry</Button>
                        </div>}
                        <FeatureAccessSelector
                          label="Feature Access"
                          description="Choose CRM modules from the permitted feature catalog."
                          availableKeys={orgAllowedFlags}
                          value={newStaffFeatures}
                          onChange={setNewStaffFeatures}
                          disabled={addingStaff || featureChoicesLoading || Boolean(featureChoicesError)}
                        />

                        <div className="flex items-center justify-end gap-3 pt-1">
                          <Button type="button" variant="secondary" size="sm"
                            disabled={addingStaff} onClick={() => setShowAddStaff(false)}>Cancel</Button>
                          <Button type="submit" variant="primary" size="sm" icon={UserPlus}
                            loading={addingStaff} disabled={featureChoicesLoading || Boolean(featureChoicesError)}>Add member</Button>
                        </div>
                      </form>
                </Modal>
              )}
            </div>
          )}

          {/* Shared billing console: consistent information architecture across all billing views. */}
          {subTab === 'billing' && (
            <BillingWorkspace
              view={billingPanel}
              onNavigate={setBillingPanel}
              workspaceBilling={workspaceBilling}
              organizationPricing={organizationPricing}
              callCount={billingCallCount}
              loading={billingUsageLoading}
              error={billingUsageError}
              onRetry={() => void loadBillingUsage()}
              phoneChargesBillable={phoneChargesBillable}
              canSubmitPayment={can('billing.payment.submit')}
              canManageBudget={can('workspace.settings.manage')}
              rechargeBased={orgSettings.billingMethod === 'recharge_based'}
              rechargeBalanceInr={Number(orgSettings.rechargeBalanceInr ?? 0)}
              rechargeReservedInr={Number(orgSettings.rechargeReservedInr ?? 0)}
              budgetDraft={workspaceBudgetDraft}
              onBudgetDraftChange={setWorkspaceBudgetDraft}
              onSaveBudget={() => void saveWorkspaceBudget()}
              budgetSaving={savingWorkspaceBudget}
              budgetError={workspaceBudgetError}
            />
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
