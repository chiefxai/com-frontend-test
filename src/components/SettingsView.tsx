import React, { useState, useEffect } from 'react';
import {
  Settings,
  Phone,
  Users,
  CreditCard,
  Key,
  Trash2,
  CheckCircle,
  FileText,
  Clock,
  Activity,
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
import { COST_PER_MINUTE_INR_FALLBACK, formatInr, formatCurrency, currencySymbol, convertToDisplayCurrency } from '../lib/pricing';
import { FEATURE_REGISTRY } from '../features/feature-flags/registry';
import FlagGroupPicker from './ui/FlagGroupPicker';
import IconButton from './ui/IconButton';
import PageShell from './ui/PageShell';
import BreadcrumbTitle from './ui/BreadcrumbTitle';
import Widget from './ui/Widget';
import Modal from './ui/Modal';
import DataTable, { Column } from './ui/DataTable';
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

// One row per Gemini Live session — see crm-backend-demo's
// src/ai/geminiUsageTracker.js / GET /api/ai-usage. Cost figures are
// application-level ESTIMATES, not the Google Cloud invoice.
interface AiUsageSession {
  id: string;
  callId: string;
  sessionId: string | null;
  adminId: string | null;
  provider: string;
  model: string;
  status: 'in_progress' | 'completed' | 'failed';
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCost: number;
  currency: string;
  durationSeconds: number | null;
  sessionStartedAt: string;
  errorMessage: string | null;
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
  const canReadOrgMembers = can('organization.members.read');
  const canManageOrgMembers = can('organization.members.manage');
  const canManageWorkspaceMembers = can('workspace.members.manage');
  // Use prop-controlled sub-tab when provided (driven by sidebar), fall back to internal state.
  const [_internalSubTab, _setInternalSubTab] = useState<'numbers' | 'team' | 'workspaces' | 'billing' | 'api'>('numbers');
  const [billingPanel, setBillingPanel] = useState<BillingPanel>('dashboard');
  const [workspacePanel, setWorkspacePanel] = useState<'overview' | 'numbers' | 'sharing'>('overview');
  const subTab = (activeSubTabProp as 'numbers' | 'team' | 'workspaces' | 'billing' | 'api') || _internalSubTab;
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

  // Gemini Live usage/cost tracking (crm-backend-demo's
  // src/ai/geminiUsageTracker.js — see docs/ai-usage-tracking.md). Every
  // figure here is an application-level ESTIMATE computed from token
  // counts, never the authoritative Google Cloud invoice — labeled as
  // such wherever it's shown below.
  const [aiUsageSummary, setAiUsageSummary] = useState<{ sessionCount: number; callCount: number; totalInputTokens: number; totalOutputTokens: number; totalTokens: number; totalCost: number; failedCount: number; currency: string } | null>(null);
  const [aiUsageByAdmin, setAiUsageByAdmin] = useState<{ adminId: string; sessionCount: number; totalTokens: number; totalCost: number }[]>([]);
  const [aiUsageSessions, setAiUsageSessions] = useState<AiUsageSession[]>([]);
  const [loadingAiUsage, setLoadingAiUsage] = useState(false);
  const [workspaceBilling, setWorkspaceBilling] = useState<{ workspaceId: string; workspaceName: string; monthlyBudgetInr: number | null; periodSpendInr: number; aiMinutesUsed: number; aiSpendInr: number; phoneSpendInr: number; remainingBudgetInr: number | null; budgetPeriod: { label: string } } | null>(null);
  const [organizationPricing,setOrganizationPricing]=useState<{totalMonthlyInr:number;workspaceCount:number;additionalIndustries:number}|null>(null);
  const [workspaceBudgetDraft, setWorkspaceBudgetDraft] = useState('');
  const [savingWorkspaceBudget, setSavingWorkspaceBudget] = useState(false);
  const [workspaceBudgetError, setWorkspaceBudgetError] = useState('');
  const loadAiUsage = () => {
    setLoadingAiUsage(true);
    Promise.all([
      apiFetch('/api/ai-usage/summary').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      apiFetch('/api/ai-usage/by-admin').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      apiFetch('/api/ai-usage?page=1&limit=20').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      apiFetch('/api/billing/console').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([summary, byAdmin, sessions, billing]) => {
        setAiUsageSummary(summary);
        setAiUsageByAdmin(Array.isArray(byAdmin?.rows) ? byAdmin.rows : []);
        setAiUsageSessions(Array.isArray(sessions?.rows) ? sessions.rows : []);
        setWorkspaceBilling(billing?.workspaceBilling || null);
        setOrganizationPricing(billing?.organizationPricing || null);
        setWorkspaceBudgetDraft(billing?.workspaceBilling?.monthlyBudgetInr == null ? '' : String(billing.workspaceBilling.monthlyBudgetInr));
      })
      .finally(() => setLoadingAiUsage(false));
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
      loadAiUsage();
    } catch (error) {
      setWorkspaceBudgetError(error instanceof Error ? error.message : 'Could not save the workspace budget.');
    } finally { setSavingWorkspaceBudget(false); }
  };
  useEffect(() => {
    if (subTab === 'billing') loadAiUsage();
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
    if (subTab !== 'team' || !canReadOrgMembers) return;
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
      subtitle={subTab === 'billing' || subTab === 'numbers' || subTab === 'workspaces' ? undefined : subTab === 'team' ? 'Manage staff and access.' : undefined}
      action={subTab === 'billing' && billingPanel !== 'dashboard'
        ? <button type="button" onClick={() => setBillingPanel('dashboard')} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]">← Back to billing</button>
        : (subTab === 'numbers' || subTab === 'workspaces') && workspacePanel !== 'overview'
          ? <button type="button" onClick={() => setWorkspacePanel('overview')} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]">← Back to workspaces</button>
          : undefined}
      onRefresh={handlePageRefresh}
    >
      <div className="col-span-12 mx-auto w-full max-w-5xl space-y-5">

          {/* Compact workspace landing page with focused number and sharing views. */}
          {(subTab === 'numbers' || subTab === 'workspaces') && (
            <div className="space-y-5">
              {workspacePanel === 'overview' && <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button type="button" onClick={() => setWorkspacePanel('numbers')} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 text-left transition-colors hover:bg-[var(--bg-subtle)]">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">Virtual Numbers →</span>
                    <span className="mt-1 block text-xs text-[var(--text-muted)]">Connected numbers and calling providers</span>
                  </button>
                  <button type="button" onClick={() => setWorkspacePanel('sharing')} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 text-left transition-colors hover:bg-[var(--bg-subtle)]">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">Workspace Sharing →</span>
                    <span className="mt-1 block text-xs text-[var(--text-muted)]">Shared access and permissions</span>
                  </button>
                </div>
                <WorkspaceManagement enabled={multipleWorkspacesEnabled} onWorkspaceCreated={onWorkspaceCreated} />
              </>}
              {workspacePanel === 'sharing' && <WorkspaceSharing enabled={workspaceSharingEnabled} />}
              {workspacePanel === 'numbers' && <>
              <Widget
                title="Virtual Numbers"
                subtitle="Connected phone numbers and calling providers."
                icon={Hash}
                accent="#6366f1"
                padding="none"
                action={
                  <button
                    onClick={() => setShowProviderForm(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Provider
                  </button>
                }
              >
                {virtualNumbers.length === 0 ? (
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
                            <p className="font-semibold text-slate-800 dark:text-[var(--text-primary)]">{num.number}</p>
                            {num.friendlyName && <p className="text-xs text-slate-400 dark:text-[var(--text-muted)] mt-0.5">{num.friendlyName}</p>}
                          </div>
                        </div>
                      ),
                    },
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
                          <button onClick={() => handleDeleteNumber(num.id)} className="text-rose-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors" title="Delete number">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
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
                      rows={virtualNumbers}
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

          {/* Staff and team membership only. */}
          {subTab === 'team' && (
            <div className="space-y-6">
              {staffAddMsg && (
                <div className={`px-4 py-2.5 rounded-lg text-xs font-medium ${staffAddMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                  {staffAddMsg.text}
                </div>
              )}

              {/* Organization membership and current-workspace access in one matrix. */}
              {(canReadOrgMembers || canManageWorkspaceMembers) && (
              <Widget
                title="Team Matrix"
                subtitle="Organization membership and access to the selected workspace."
                icon={Users}
                accent="#6366f1"
                padding="none"
                action={<div className="flex items-center gap-2">
                  {currentOwnerMember && <button type="button" onClick={() => { setOwnerTransferError(''); setShowOwnerTransfer(true); }} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-100">Transfer Owner</button>}
                  {canManageOrgMembers && <IconButton icon={Plus} label="Add Member" onClick={() => setShowAddStaff(true)} />}
                </div>}
              >
                {workspaceMembersError && canManageWorkspaceMembers && <div role="alert" className="mx-4 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{workspaceMembersError}</div>}
                {orgAccessError && <div role="alert" className="mx-4 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{orgAccessError}</div>}
                {canReadOrgMembers && <div className="grid gap-3 border-b border-[var(--border)] p-4 sm:grid-cols-3">
                  <label className="text-xs text-[var(--text-muted)]">Workspace
                    <select aria-label="Filter staff by workspace" value={staffWorkspaceFilter} onChange={event => setStaffWorkspaceFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-primary)]">
                      <option value="">All workspaces</option>{orgWorkspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-[var(--text-muted)]">Role
                    <select aria-label="Filter staff by role" value={staffRoleFilter} onChange={event => setStaffRoleFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-primary)]">
                      <option value="">All roles</option>{Array.from(new Set(teamMembers.map(member => member.role))).map(role => <option key={role} value={role}>{role}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-[var(--text-muted)]">Status
                    <select aria-label="Filter staff by status" value={staffStatusFilter} onChange={event => setStaffStatusFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-primary)]">
                      <option value="">All statuses</option><option value="Active">Active</option><option value="Inactive">Inactive</option>
                    </select>
                  </label>
                </div>}

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
                          <p className="font-semibold text-slate-800 dark:text-[var(--text-primary)]">{member.name}</p>
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
                        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <Flag className="h-3 w-3" />
                          Full Access
                        </span>
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
                      {canManageOrgMembers && <button type="button" onClick={() => { setAccessMember(member); setOrgAccessError(''); }} className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]">Manage Access</button>}
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
              {accessMember && <Modal open onClose={() => setAccessMember(null)} title={`Workspace Access — ${accessMember.name || accessMember.email}`} subtitle="Grant a different role in each organization workspace." maxWidth="max-w-lg">
                <div className="space-y-3">
                  {orgAccessError && <p role="alert" className="text-xs text-rose-700">{orgAccessError}</p>}
                  {!orgWorkspaces.length && <p className="text-xs text-[var(--text-muted)]">No organization workspaces available.</p>}
                  {orgWorkspaces.map(workspace => {
                    const assignment = orgAssignments[workspace.id]?.find(row => row.memberId === accessMember.id);
                    const active = assignment?.assignmentStatus === 'Active';
                    return <div key={workspace.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] p-3">
                      <div><p className="text-xs font-semibold text-[var(--text-primary)]">{workspace.name}</p><p className="mt-1 text-[11px] text-[var(--text-muted)]">{active ? 'Access granted' : 'No access'}</p></div>
                      <select aria-label={`Workspace role in ${workspace.name}`} value={active ? assignment?.workspaceRole || '' : ''}
                        disabled={!canManageOrgMembers || accessSaving === workspace.id || accessMember.status !== 'Active'}
                        onChange={event => void updateOrgAccess(accessMember.id, workspace.id, event.target.value)}
                        className="rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-2.5 py-2 text-xs text-[var(--text-primary)] disabled:opacity-50">
                        <option value="">No access</option><option value="Workspace Admin">Workspace Admin</option><option value="Manager">Manager</option><option value="Member">Member</option><option value="Viewer">Viewer</option>
                      </select>
                    </div>;
                  })}
                  <p className="text-[11px] text-[var(--text-muted)]">Changes are saved immediately. The backend prevents removal of a workspace's last administrator.</p>
                </div>
              </Modal>}
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
            <div className="mx-auto w-full max-w-5xl space-y-5">
              {billingPanel === 'dashboard' && <div className="space-y-4">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Billing overview</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <section className="flex flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
                    <div><p className="text-xs font-medium text-[var(--text-muted)]">Monthly subscription</p><p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{organizationPricing ? formatInr(organizationPricing.totalMonthlyInr) : 'Not available'}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{organizationPricing ? `${organizationPricing.workspaceCount} workspaces · ${organizationPricing.additionalIndustries} additional industry packs` : 'Plan details unavailable.'}</p></div>
                    <button type="button" onClick={() => setBillingPanel('plan')} className="mt-5 self-start rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)]">View plan →</button>
                  </section>
                  <section className="flex flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
                    <div><p className="text-xs font-medium text-[var(--text-muted)]">Workspace spend this period</p><p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{workspaceBilling ? formatInr(workspaceBilling.periodSpendInr) : 'Not available'}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{workspaceBilling?.workspaceName || 'Current workspace'}</p></div>
                    <button type="button" onClick={() => setBillingPanel('usage')} className="mt-5 self-start rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)]">View usage →</button>
                  </section>
                </div>
              </div>}
              <OrganizationTopUp canSubmit={can('billing.payment.submit')} view={billingPanel} onNavigate={setBillingPanel} />
              {billingPanel === 'plan' && <>
              {organizationPricing && <Widget title="Organization monthly plan" subtitle="Shared across all organization workspaces" icon={CreditCard} accent="#0891b2" padding="md">
                <p className="text-lg font-semibold">{formatInr(organizationPricing.totalMonthlyInr)} / month</p>
                <p className="mt-2 text-xs text-slate-500">{organizationPricing.workspaceCount} workspace(s) · {organizationPricing.additionalIndustries} additional industry pack(s). Usage charges and applicable taxes are additional. This is the configured fixed monthly price.</p>
              </Widget>}
              </>}
              {billingPanel === 'usage' && <>
              {workspaceBilling && (
                <Widget
                  title={`${workspaceBilling.workspaceName} spend this period`}
                  subtitle={`${workspaceBilling.budgetPeriod?.label || 'Current billing period'} · Organization invoice and wallet remain shared`}
                  icon={CreditCard}
                  accent="#f59e0b"
                  padding="md"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                    <div className="bg-[var(--bg-base)] p-4 rounded-[9px] text-center">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Workspace spend</span>
                      <strong className="text-md text-slate-800 font-mono">{formatInr(workspaceBilling.periodSpendInr)}</strong>
                    </div>
                    <div className="bg-[var(--bg-base)] p-4 rounded-[9px] text-center">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Monthly cap</span>
                      <strong className="text-md text-slate-800 font-mono">{workspaceBilling.monthlyBudgetInr == null ? 'No cap' : formatInr(workspaceBilling.monthlyBudgetInr)}</strong>
                    </div>
                    <div className="bg-[var(--bg-base)] p-4 rounded-[9px] text-center">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Cap remaining</span>
                      <strong className="text-md text-slate-800 font-mono">{workspaceBilling.remainingBudgetInr == null ? '—' : formatInr(workspaceBilling.remainingBudgetInr)}</strong>
                    </div>
                  </div>
                  {can('workspace.settings.manage') && (
                    <div className="mt-4 flex flex-col sm:flex-row sm:items-end gap-3">
                      <label className="flex-1 text-xs text-slate-500">
                        Monthly workspace cap (INR)
                        <input
                          type="number" min="0" step="0.01" value={workspaceBudgetDraft}
                          onChange={(event) => setWorkspaceBudgetDraft(event.target.value)}
                          placeholder="Leave blank for no cap"
                          className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono text-sm text-slate-700"
                        />
                      </label>
                      <button onClick={saveWorkspaceBudget} disabled={savingWorkspaceBudget} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                        {savingWorkspaceBudget ? 'Saving…' : 'Save cap'}
                      </button>
                    </div>
                  )}
                  {workspaceBudgetError && <p className="mt-2 text-xs text-rose-600">{workspaceBudgetError}</p>}
                  <p className="mt-3 text-[10px] text-slate-400">Spend is attributed to this workspace. New Vobiz outbound calls stop when the cap is reached; active calls can finish and may take the final spend slightly over the cap. The organization wallet remains shared.</p>
                </Widget>
              )}

              {orgSettings.billingMethod === 'recharge_based' && (
                <Widget title="Available Balance" subtitle="Recharge wallet balance available for calls" icon={DollarSign} accent="#10b981" padding="md">
                  {(() => {
                    const balance = Number(orgSettings.rechargeBalanceInr ?? 0);
                    const reserved = Number(orgSettings.rechargeReservedInr ?? 0);
                    const available = Math.max(0, balance - reserved);
                    return (
                      <div className="flex items-center justify-between gap-4 rounded-[9px] border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 px-5 py-4">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Available balance</p>
                          <p className="text-xs text-slate-500 dark:text-[var(--text-secondary)] mt-1">
                            {reserved > 0 ? 'Reserved for active calls' : 'Ready to use'}
                          </p>
                        </div>
                        <strong className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400">
                          {'₹'}{available.toFixed(2)}
                        </strong>
                      </div>
                    );
                  })()}
                </Widget>
              )}

              <Widget title="AI Voice Usage This Period" icon={CreditCard} accent="#10b981" padding="md">
                <div className="grid grid-cols-3 gap-4 pt-2">
                  <div className="bg-[var(--bg-base)] p-4 rounded-[9px] text-center">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Minutes Consumed</span>
                    <strong className="text-md text-slate-800 font-mono">{(workspaceBilling?.aiMinutesUsed ?? orgSettings.aiMinutesUsed).toFixed(2)}</strong>
                  </div>
                  <div className="bg-[var(--bg-base)] p-4 rounded-[9px] text-center">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">AI spend this period</span>
                    <strong className="text-md text-slate-800 font-mono">{formatInr(workspaceBilling?.aiSpendInr ?? (orgSettings.aiMinutesUsed * costPerMinuteInr))}</strong>
                  </div>
                  <div className="bg-[var(--bg-base)] p-4 rounded-[9px] text-center">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                      {callProviderRate
                        ? `${callProviderRate.label} ${phoneChargesBillable ? 'Charges' : '(Est.)'} (${currencySymbol()}${callProviderRate.rateAmount}/${callProviderRate.rateUnit}${callProviderRate.taxPercent ? ` +${callProviderRate.taxPercent}% tax` : ''})`
                        : `Phone ${phoneChargesBillable ? 'Charges' : '(Est.)'} (${currencySymbol()}${phoneCostPerMinute}/min)`}
                    </span>
                    <strong className="text-md text-slate-800 font-mono">{formatCurrency(workspaceBilling?.phoneSpendInr ?? orgSettings.phoneCharges)}</strong>
                  </div>
                </div>
                {!phoneChargesBillable && (
                  <p className="text-[10px] text-slate-400 mt-3">
                    You're using your own {callProviderRate?.label || 'Vobiz'} account for calls, so this figure is an estimate for your own
                    reference only — it isn't billed to you by the platform.
                  </p>
                )}
              </Widget>

              {aiTokenCost && (
                <Widget title="AI Token Cost This Period" icon={CreditCard} accent="#6366f1" padding="md">
                  <div className="grid grid-cols-3 gap-4 pt-2">
                    <div className="bg-[var(--bg-base)] p-4 rounded-[9px] text-center">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Tokens Used</span>
                      <strong className="text-md text-slate-800 font-mono">{(aiTokenUsage?.totalTokens ?? 0).toLocaleString()}</strong>
                    </div>
                    <div className="bg-[var(--bg-base)] p-4 rounded-[9px] text-center">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                        {aiTokenCurrentRate ? `${aiTokenCurrentRate.label} Rate (₹${aiTokenCurrentRate.ratePer1kTokens}/${aiTokenCurrentRate.tokenUnit.toLocaleString()} tokens)` : 'Rate before tax'}
                      </span>
                      <strong className="text-md text-slate-800 font-mono">{formatInr(aiTokenCost.baseCost)}</strong>
                    </div>
                    <div className="bg-[var(--bg-base)] p-4 rounded-[9px] text-center">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                        Total {aiTokenCurrentRate?.taxPercent ? `(incl. tax)` : ''}
                      </span>
                      <strong className="text-md text-slate-800 font-mono">{formatInr(aiTokenCost.totalCost)}</strong>
                    </div>
                  </div>
                  {aiTokenCost.pricedSessionCount < aiTokenCost.sessionCount && (
                    <p className="text-[10px] text-amber-600 mt-3">
                      {aiTokenCost.sessionCount - aiTokenCost.pricedSessionCount} of {aiTokenCost.sessionCount} sessions this period predate an AI rate being set on the platform Cost page, and aren't included above.
                    </p>
                  )}
                </Widget>
              )}

              {/* Gemini Live model usage & cost — see
                  docs/ai-usage-tracking.md. Every figure here is an
                  application-level ESTIMATE computed from token counts
                  and this app's own pricing config, NOT the authoritative
                  Google Cloud invoice amount. */}
              <Widget
                title="Gemini AI Model Usage & Cost"
                subtitle="Estimated — computed from token usage, not your Google Cloud invoice"
                icon={Activity}
                accent="#6366f1"
                padding="md"
                action={
                  <button
                    onClick={loadAiUsage}
                    disabled={loadingAiUsage}
                    className="text-[10px] font-mono text-slate-400 hover:text-slate-600 disabled:opacity-50 cursor-pointer"
                  >
                    {loadingAiUsage ? 'Loading…' : 'Refresh'}
                  </button>
                }
              >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                  <div className="bg-[var(--bg-base)] p-4 rounded-[9px] text-center">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Sessions</span>
                    <strong className="text-md text-slate-800 font-mono">{aiUsageSummary?.sessionCount ?? 0}</strong>
                  </div>
                  <div className="bg-[var(--bg-base)] p-4 rounded-[9px] text-center">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Total Tokens</span>
                    <strong className="text-md text-slate-800 font-mono">{(aiUsageSummary?.totalTokens ?? 0).toLocaleString()}</strong>
                  </div>
                  <div className="bg-[var(--bg-base)] p-4 rounded-[9px] text-center">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Est. Cost ({currencySymbol()})</span>
                    <strong className="text-md text-slate-800 font-mono">
                      {formatCurrency(convertToDisplayCurrency(aiUsageSummary?.totalCost ?? 0, aiUsageSummary?.currency || 'USD'), { decimals: 4 })}
                    </strong>
                  </div>
                  <div className="bg-[var(--bg-base)] p-4 rounded-[9px] text-center">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Failed Sessions</span>
                    <strong className={`text-md font-mono ${(aiUsageSummary?.failedCount ?? 0) > 0 ? 'text-rose-600' : 'text-slate-800'}`}>{aiUsageSummary?.failedCount ?? 0}</strong>
                  </div>
                </div>

                {aiUsageByAdmin.length > 0 && (
                  <div className="mt-5">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Cost by Admin</p>
                    <div className="space-y-1.5">
                      {aiUsageByAdmin.map((row) => (
                        <div key={row.adminId} className="flex items-center justify-between text-xs bg-[var(--bg-base)] rounded-lg px-3 py-2">
                          {/* adminId is the authenticated user's id, not an
                              email — no reliable id-to-email lookup is
                              available here, so shown as-is rather than
                              guessing at a name. */}
                          <span className="font-mono text-slate-600" title={row.adminId || undefined}>{row.adminId ? `${row.adminId.slice(0, 8)}…` : 'Unknown'}</span>
                          <span className="text-slate-400">{row.sessionCount} sessions · {row.totalTokens.toLocaleString()} tokens</span>
                          <span className="font-mono font-bold text-slate-700">
                            {formatCurrency(convertToDisplayCurrency(row.totalCost, aiUsageSummary?.currency || 'USD'), { decimals: 4 })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-5">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Recent Sessions</p>
                  {aiUsageSessions.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 text-xs bg-[var(--bg-base)] rounded-[9px]">
                      {loadingAiUsage ? 'Loading…' : 'No Gemini Live sessions tracked yet.'}
                    </div>
                  ) : (
                    <DataTable
                      bare
                      resizable
                      columns={[
                        { key: 'provider', header: 'Provider', cell: (s: AiUsageSession) => <span className="font-mono text-xs text-slate-600 capitalize">{s.provider}</span> },
                        { key: 'model', header: 'Model', cell: (s: AiUsageSession) => <span className="font-mono text-[10px] text-slate-500">{s.model}</span> },
                        {
                          key: 'status', header: 'Status', cell: (s: AiUsageSession) => (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                              s.status === 'completed' ? 'bg-emerald-100 text-emerald-700'
                                : s.status === 'failed' ? 'bg-rose-100 text-rose-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}>{s.status}</span>
                          )
                        },
                        { key: 'tokens', header: 'Tokens (in/out)', align: 'right', cell: (s: AiUsageSession) => <span className="font-mono text-xs text-slate-600">{s.inputTokens.toLocaleString()} / {s.outputTokens.toLocaleString()}</span> },
                        { key: 'cost', header: 'Est. Cost', align: 'right', cell: (s: AiUsageSession) => <span className="font-mono text-xs font-bold text-slate-700">{formatCurrency(convertToDisplayCurrency(s.totalCost, s.currency || 'USD'), { decimals: 4 })}</span> },
                        { key: 'duration', header: 'Duration', align: 'right', cell: (s: AiUsageSession) => <span className="font-mono text-xs text-slate-500">{s.durationSeconds != null ? `${Math.round(s.durationSeconds)}s` : '—'}</span> },
                        { key: 'started', header: 'Started', align: 'right', cell: (s: AiUsageSession) => <span className="text-[9px] text-slate-400 font-mono">{new Date(s.sessionStartedAt).toLocaleString()}</span> },
                      ]}
                      rows={aiUsageSessions}
                      rowKey={(s) => s.id}
                    />
                  )}
                </div>
              </Widget>
              </>}
            </div>
          )}

          {/* Subtab: API details & Audit Logs */}
          {subTab === 'api' && (
            <div className="space-y-6">
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
