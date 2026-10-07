import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { apiFetch, getAuthToken, getApiBase } from './lib/api';
import { COST_PER_MINUTE_INR_FALLBACK as COST_PER_MINUTE_INR } from './lib/pricing';
import { loadFromStorage, saveToStorage } from './lib/storage';
import { recordToLead } from './lib/objectContacts';
import { RefreshProvider } from './lib/RefreshContext';
import { PageHeaderProvider } from './lib/PageHeaderContext';
import PageHeaderBar from './components/ui/PageHeaderBar';
import { ActiveTabProvider } from './lib/ActiveTabContext';
import PageShell from './components/ui/PageShell';
import { fetchUserFlags, resetUserFlags, subscribe as subscribeFlags, isLoaded as flagsLoaded } from './features/feature-flags/userFlagsStore';
import { TAB_TO_FLAG } from './features/feature-flags/registry';
import {
  Lead,
  Workflow,
  CallLog,
  Loan,
  VirtualNumber,
  TeamMember,
  OrganizationSettings,
  UserRole
} from './types';
import { useAuth } from './features/auth/AuthProvider';
import { resolveIndustryContext } from './lib/industry';
import type { DomainRecord } from './lib/industry';
import type { RemoteIndustryConfig } from './lib/industry/types';

// Placeholder shown only until the real org settings arrive from the backend.
const EMPTY_ORG_SETTINGS: OrganizationSettings = {
  id: '',
  name: '',
  workspaceName: '',
  subscriptionPlan: 'Starter',
  aiMinutesUsed: 0,
  phoneCharges: 0,
  billingPeriodEnd: '',
  apiKeys: []
};

// UI components imports
import { useTheme } from './shared/theme/ThemeContext';
import ProfileMenu from './components/ProfileMenu';
import Sidebar from './components/Sidebar';
import { ErrorBoundary } from './components/ErrorBoundary';
import DashboardView from './features/dashboard';
import WorkflowsView from './features/workflows/WorkflowsView';
import { QuestionFlow } from './features/workflows/types';
import { useFeatureFlags } from './features/feature-flags/FeatureFlagContext';
import DialerSimulator from './features/dialer';
import ScheduledCallbacksView from './components/ScheduledCallbacksView';
import LoanLifecycleView from './components/LoanLifecycleView';
import SettingsView from './features/settings';
import LeadsView from './components/LeadsView';
import PipelineView from './components/PipelineView';
import ContactDirectoryView from './features/contacts';
import CallLogsView from './components/CallLogsView';
import ReportsView from './features/reports';
import CompanyProfileView from './features/company-profile';
import CustomObjectsView from './components/CustomObjectsView';
import UnifiedInboxView from './components/UnifiedInboxView';
import AgentStudioView from './features/agents';
import ComplianceView from './components/ComplianceView';
import KnowledgeBaseView from './components/KnowledgeBaseView';
import AuditLogView from './components/AuditLogView';
import EnquiriesView from './components/EnquiriesView';
import NotificationBell, { AppNotification } from './components/NotificationBell';
import { ToastProvider } from './components/ui/Toast';
import { Building2, ChevronDown } from 'lucide-react';

// Debounced sync: collapses multiple rapid state changes into one POST.
// Without this, setting 8 state vars at load triggers 8 simultaneous syncs.
//
// Only checked for network-level failures (.catch on a rejected fetch) —
// never checked res.ok, so a non-2xx response (e.g. a real DB write error)
// was completely silent: the local state change (a workflow toggle, a
// team edit, etc.) looked like it worked because the UI updates
// optimistically, but nothing actually persisted server-side and no error
// ever surfaced anywhere. Now logs loudly on a failed sync so a stuck
// backend write is at least visible in the console instead of only ever
// showing up as "changes don't survive a reload."
function useDebouncedSync(url: string, data: any, enabled: boolean, delay = 800) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
        .then(async (res) => {
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            console.error(`Sync failed ${url}: ${res.status} ${body.error || res.statusText}`);
          }
        })
        .catch(err => console.error(`Sync error ${url}:`, err));
    }, delay);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [data, enabled]);
}

// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  // Auth state comes from Keycloak — no manual isAuthenticated flag needed.
  const { user: kcUser, logout } = useAuth();
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);

  // Gate the app: verify the Keycloak user has a membership in our DB.
  // 'checking' → spinner, 'ok' → show app, 'denied' → no-access screen.
  const [membershipStatus, setMembershipStatus] = useState<'checking' | 'ok' | 'denied'>('checking');
  const [membershipError, setMembershipError] = useState<string>('');
  useEffect(() => {
    if (!kcUser) { setMembershipStatus('checking'); return; }
    setMembershipStatus('checking');
    // Check org membership first; if denied, check platform-admin access as fallback.
    apiFetch('/api/auth/me')
      .then(async r => {
        if (r.ok) { setMembershipStatus('ok'); return; }
        // Not an org member — check if they're a platform admin
        return apiFetch('/api/platform/whoami').then(async r2 => {
          if (r2.ok) { setMembershipStatus('ok'); return; }
          const body = await r.json().catch(() => ({}));
          setMembershipError(body.error || 'Your account is not registered in this platform.');
          setMembershipStatus('denied');
        });
      })
      .catch(() => {
        setMembershipError('Could not reach the server. Please try again later.');
        setMembershipStatus('denied');
      });
  }, [kcUser?.id]);
  const navigate = useNavigate();
  const location = useLocation();

  // Slug ↔ tab-ID mappings — URL uses human-readable slugs, internal code uses short IDs.
  const TAB_TO_SLUG: Record<string, string> = {
    dashboard:     'dashboard',
    leads:         'leads',
    pipeline:      'pipeline',
    contacts:      'contact-directory',
    workflows:     'workflow-builder',
    dialer:        'campaign',
    'call-logs':   'call-logs',
    reports:       'reports',
    inbox:         'unified-inbox',
    'agent-studio':'agent-studio',
    compliance:    'compliance',
    knowledge:     'knowledge-base',
    enquiries:     'enquiries',
    'audit-log':   'audit-log',
    objects:       'objects',
    loans:         'loan-lifecycle',
    company:       'company-profile',
    settings:      'administration',
  };
  const SLUG_TO_TAB: Record<string, string> = Object.fromEntries(
    Object.entries(TAB_TO_SLUG).map(([tab, slug]) => [slug, tab])
  );

  // Derive active tab from URL slug — /leads → "leads", /dashboard (or /) → "dashboard"
  // Sub-tabs for company-profile and administration are encoded as the second segment:
  // /company-profile/legal → tab=company, subTab=legal
  const segments = location.pathname.split('/').filter(Boolean);
  const slug = segments[0] || 'dashboard';
  const subSlug = segments[1] || '';
  const activeTab = SLUG_TO_TAB[slug] || 'dashboard';

  // Sub-tab defaults per parent tab
  const DEFAULT_SUB_TAB: Record<string, string> = {
    company: 'profile',
    settings: 'numbers',
    dialer: 'outbound',
  };
  const activeSubTab = subSlug || DEFAULT_SUB_TAB[activeTab] || '';

  // Keep-alive tab rendering: once a tab has been visited, keep it mounted
  // (hidden via CSS instead of unmounted) so navigating back to it shows the
  // data it already loaded instantly instead of remounting the view, losing
  // its state, and flashing its loading spinner again.
  //
  // `visitedTabsForRender` folds the current activeTab in synchronously
  // during render, rather than waiting for the effect below to add it to
  // state. Doing it only in the effect meant that clicking a sidebar item
  // you hadn't visited yet rendered a frame with the new tab missing from
  // the list entirely (URL/activeTab updates immediately; the effect that
  // adds it to `visitedTabs` only runs after that render commits) — the
  // previous page's panel had already flipped to hidden, so nothing (or a
  // blank gap) showed until the follow-up render, which read as the page
  // header disappearing and reappearing on every first visit.
  const [visitedTabs, setVisitedTabs] = useState<string[]>([activeTab]);
  const visitedTabsForRender = visitedTabs.includes(activeTab) ? visitedTabs : [...visitedTabs, activeTab];
  useEffect(() => {
    setVisitedTabs(prev => prev.includes(activeTab) ? prev : [...prev, activeTab]);
  }, [activeTab]);

  const setActiveTab = (tab: string) => {
    const s = TAB_TO_SLUG[tab] || tab;
    navigate(`/${s}`, { replace: false });
  };

  const setActiveSubTab = (subTab: string, parentTab?: string) => {
    const parent = parentTab ?? activeTab;
    const parentSlug = TAB_TO_SLUG[parent] || parent;
    navigate(`/${parentSlug}/${subTab}`, { replace: false });
  };

  // CRM DB states — default to empty, NOT the built-in demo/seed data.
  // These get populated for real from the backend right after login (see
  // the effect below); a fresh browser session should show real empty
  // states, never fabricated leads/calls/etc. that look like this org's
  // own data. loadFromStorage still restores a returning user's last-seen
  // real data if present.
  const [leads, setLeads] = useState<Lead[]>(() =>
    loadFromStorage<Lead[]>('chiefx_leads', [])
  );
  const [workflows, setWorkflows] = useState<Workflow[]>(() =>
    loadFromStorage<Workflow[]>('chiefx_workflows', [])
  );
  const [callLogs, setCallLogs] = useState<CallLog[]>(() =>
    loadFromStorage<CallLog[]>('chiefx_calllogs', [])
  );
  const [loans, setLoans] = useState<Loan[]>(() =>
    loadFromStorage<Loan[]>('chiefx_loans', [])
  );
  const [virtualNumbers, setVirtualNumbers] = useState<VirtualNumber[]>(() =>
    loadFromStorage<VirtualNumber[]>('chiefx_numbers', [])
  );
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() =>
    loadFromStorage<TeamMember[]>('chiefx_team', [])
  );
  const [orgSettings, setOrgSettings] = useState<OrganizationSettings>(() =>
    loadFromStorage<OrganizationSettings>('chiefx_org', EMPTY_ORG_SETTINGS)
  );
  const [workspaces, setWorkspaces] = useState<Array<{
    orgId: string;
    role: string;
    organization: { id: string; name: string; workspaceName: string; industry?: string; status?: string };
  }>>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(() => {
    try { return localStorage.getItem('chiefx_active_workspace_id') || ''; } catch { return ''; }
  });
  const [dialerTasks, setDialerTasks] = useState<any[]>(() =>
    loadFromStorage<any[]>('chiefx_dialer_tasks', [])
  );
  // The org's REAL per-minute rate, set live from the super admin panel
  // (services/pricing.js) — lib/pricing.ts's COST_PER_MINUTE_INR constant
  // was a hardcoded 4 that never changed when an admin updated the real
  // rate to 6, so every cost display in the app (Dashboard, Settings,
  // Call Logs) silently showed the wrong, stale number. Fetched once
  // here and threaded down instead.
  const [costPerMinuteInr, setCostPerMinuteInr] = useState<number>(COST_PER_MINUTE_INR);
  // Telephony (Vobiz) per-minute rate — same admin-configurable
  // pattern as costPerMinuteInr above, backing the Billing & Usage page's
  // "Phone Charges" figure, which the backend now actually accrues per call
  // (previously always 0 — nothing wrote to organizations.phone_charges).
  const [phoneCostPerMinute, setPhoneCostPerMinute] = useState<number>(8);
  // AI token cost + call-provider rate/tax for the current billing period,
  // computed server-side from the super admin's Cost page rates (see
  // billingEngine.js's getBillingInfo). Null fields mean "not priced yet"
  // (no admin-set rate for that provider) rather than "free" — Billing &
  // Usage should only show a cost line once these are non-null.
  // aiTokenCost is the SUM of what each session was actually charged,
  // locked in at its own finalize time — never recomputed against today's
  // rate, so a rate change never retroactively re-prices past usage.
  // aiTokenCurrentRate is the rate as configured RIGHT NOW, shown
  // separately for reference (may differ from what older sessions above
  // were actually billed at, if the rate changed mid-period).
  const [aiTokenCost, setAiTokenCost] = useState<{ baseCost: number; taxAmount: number; totalCost: number; pricedSessionCount: number; sessionCount: number } | null>(null);
  const [aiTokenCurrentRate, setAiTokenCurrentRate] = useState<{ key: string; label: string; ratePer1kTokens: number; tokenUnit: number; taxPercent: number } | null>(null);
  const [aiTokenUsage, setAiTokenUsage] = useState<{ totalTokens: number; totalInputTokens: number; totalOutputTokens: number; callCount: number } | null>(null);
  const [callProviderRate, setCallProviderRate] = useState<{ key: string; label: string; rateUnit: 'minute' | 'hour'; rateAmount: number; taxPercent: number } | null>(null);
  // False when this org connected its own Vobiz account (Settings >
  // Numbers) — the platform never paid for those calls, so phoneCharges
  // is only an estimate for the org's own reference, never a bill.
  const [phoneChargesBillable, setPhoneChargesBillable] = useState<boolean>(true);
  // Non-lending orgs have no `leads` table rows at all — their real
  // contacts live as Industry Objects records instead. When set, `leads`
  // is populated from this object's records (mapped via
  // lib/objectContacts.ts) and synced back to it instead of /api/leads,
  // so the Voice Simulator (and anything else reading `leads`) has real
  // data to work with for every industry, not just lending.
  const [primaryObject, setPrimaryObject] = useState<{ key: string; stages: { id: string; key: string; label: string }[]; fields: { id: string; key: string; label: string; type: string; required?: boolean }[] } | null>(null);
  // Canonical industry-object snapshot. `leads` remains a compatibility projection
  // for lending-era views; new industry UI should consume these records directly.
  const [domainRecords, setDomainRecords] = useState<DomainRecord[]>([]);

  const [hasLoaded, setHasLoaded] = useState<boolean>(false);
  // Server is the source of truth for industry semantics. The local registry
  // remains a safe fallback for startup/offline rendering and tests.
  const [remoteIndustryConfig, setRemoteIndustryConfig] = useState<RemoteIndustryConfig | null>(null);
  // DB membership role — authoritative once /api/settings/me resolves.
  const [dbRole, setDbRole] = useState<string>('');
  const [flagsReady, setFlagsReady] = useState<boolean>(flagsLoaded);
  const [grantedFlags, setGrantedFlags] = useState<string[]>([]);
  useEffect(() => {
    return subscribeFlags((granted, loaded, role) => {
      if (role) setDbRole(role);
      if (loaded) { setFlagsReady(true); setGrantedFlags(granted); }
    });
  }, []);
  const previousLeadsRef = useRef<Lead[]>([]);
  const previousDomainRecordsRef = useRef<DomainRecord[]>([]);
  const [questionFlows, setQuestionFlows] = useState<QuestionFlow[]>(() =>
    loadFromStorage<QuestionFlow[]>('chiefx_question_flows', [])
  );
  const { isEnabled } = useFeatureFlags();
  const industryContext = resolveIndustryContext(orgSettings);
  const effectiveIndustryProfile = remoteIndustryConfig?.industry === industryContext.industry
    ? {
        ...industryContext.profile,
        label: remoteIndustryConfig.label || industryContext.profile.label,
        tagline: remoteIndustryConfig.tagline || industryContext.profile.tagline,
        businessTypes: remoteIndustryConfig.businessTypes || industryContext.profile.businessTypes,
        labels: remoteIndustryConfig.labels,
        modules: remoteIndustryConfig.modules,
        pipeline: remoteIndustryConfig.pipeline,
        domainModel: remoteIndustryConfig.domainModel || {
          objects: remoteIndustryConfig.domainObjects,
          relationships: industryContext.profile.domainModel?.relationships || [],
        },
      }
    : industryContext.profile;


  // Live call notifications — set when a real inbound/outbound call is in
  // progress (from the org-scoped /api/logs-stream SSE connection below),
  // cleared when it completes. Not a simulation: this only fires for real
  // Vobiz call events from server.js/vobizProxy.js.
  const [liveCallBanner, setLiveCallBanner] = useState<{ message: string; startedAt: number } | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const pushNotification = (type: string, message: string) => {
    setNotifications(prev => [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, type, message, timestamp: Date.now(), read: false },
      ...prev.slice(0, 49), // keep last 50
    ]);
  };

  // Lightweight refresh for just the dialer tasks — used to keep
  // auto-dial progress (autoDialStatus, callResults) live in the UI
  // without re-fetching everything else refreshData() does. The backend
  // (src/crm/autoDialEngine.js) is the actual source of truth here: this
  // component never drives the dialing itself for a server-run task, it
  // only reflects whatever the backend row currently says — which is also
  // exactly what makes "open the app mid-campaign and see where it's at"
  // and "the process got killed mid-call, does the UI still make sense"
  // both just work for free, with no special-case recovery logic needed.
  const refreshDialerTasks = useCallback(async () => {
    if (!kcUser) return;
    try {
      const res = await apiFetch('/api/dialer-tasks');
      const rows = await res.json();
      if (Array.isArray(rows)) setDialerTasks(rows);
    } catch { /* transient — next poll tick or SSE event will retry */ }
  }, [kcUser]);

  // Fetch all CRM data from the backend and update state.
  // Exposed as `refreshData` so page-level refresh buttons can call it directly.
  const refreshData = useCallback(async () => {
    if (!kcUser) return;
    try {
      const [
        resLeads,
        resWorkflows,
        resCallLogs,
        resLoans,
        resNumbers,
        resTeam,
        resOrg,
        resDialerTasks,
        resBilling,
        resQuestionFlows,
        resIndustry
      ] = await Promise.all([
        apiFetch('/api/leads').then(r => r.json()).catch(() => null),
        apiFetch('/api/workflows').then(r => r.json()).catch(() => null),
        apiFetch('/api/call-logs').then(r => r.json()).catch(() => null),
        apiFetch('/api/loans').then(r => r.json()).catch(() => null),
        apiFetch('/api/settings/numbers').then(r => r.json()).catch(() => null),
        apiFetch('/api/settings/team').then(r => r.json()).catch(() => null),
        apiFetch('/api/settings/org').then(r => r.json()).catch(() => null),
        apiFetch('/api/dialer-tasks').then(r => r.json()).catch(() => null),
        apiFetch('/api/billing').then(r => r.json()).catch(() => null),
        apiFetch('/api/question-flows').then(r => r.json()).catch(() => null),
        apiFetch('/api/settings/industry').then(r => r.ok ? r.json() : null).catch(() => null)
      ]);

      if (Array.isArray(resLeads)) setLeads(resLeads);
      if (Array.isArray(resWorkflows)) setWorkflows(resWorkflows);
      if (Array.isArray(resCallLogs)) setCallLogs(resCallLogs);
      if (Array.isArray(resLoans)) setLoans(resLoans);
      if (Array.isArray(resNumbers)) setVirtualNumbers(resNumbers);
      if (Array.isArray(resTeam)) setTeamMembers(resTeam);
      if (resBilling && typeof resBilling.costPerMinuteInr === 'number') setCostPerMinuteInr(resBilling.costPerMinuteInr);
      if (resBilling && typeof resBilling.phoneCostPerMinute === 'number') setPhoneCostPerMinute(resBilling.phoneCostPerMinute);
      if (resBilling && typeof resBilling.phoneChargesBillable === 'boolean') setPhoneChargesBillable(resBilling.phoneChargesBillable);
      if (resBilling && resBilling.aiTokenCost) setAiTokenCost(resBilling.aiTokenCost);
      if (resBilling && resBilling.aiTokenCurrentRate) setAiTokenCurrentRate(resBilling.aiTokenCurrentRate);
      if (resBilling && resBilling.aiTokenUsage) setAiTokenUsage(resBilling.aiTokenUsage);
      if (resBilling && resBilling.callProvider) setCallProviderRate(resBilling.callProvider);
      if (resOrg && Object.keys(resOrg).length > 0) setOrgSettings({ ...EMPTY_ORG_SETTINGS, ...resOrg });
      if (resIndustry && typeof resIndustry.industry === 'string') setRemoteIndustryConfig(resIndustry);
      if (Array.isArray(resDialerTasks)) setDialerTasks(resDialerTasks);
      if (Array.isArray(resQuestionFlows) && resQuestionFlows.length > 0)
        setQuestionFlows(resQuestionFlows.map((f: any) => ({ nodes: [], edges: [], variables: [], ...f })));

      const industry = (resOrg && resOrg.industry) || orgSettings.industry;
      if (industry && industry !== 'lending') {
        try {
          const objects = await apiFetch('/api/objects').then(r => r.json());
          const primary = Array.isArray(objects) ? objects[0] : null;
          if (primary) {
            const records = await apiFetch(`/api/objects/${primary.key}/records`).then(r => r.json());
            const canonicalRecords: DomainRecord[] = Array.isArray(records)
              ? records.map((r: any) => ({
                  id: String(r.id),
                  objectKey: primary.key,
                  stageKey: r.stageKey ?? primary.stages?.find((s: any) => s.id === r.stageId)?.key ?? null,
                  values: r.values && typeof r.values === 'object' ? r.values : { ...r },
                  createdAt: r.createdAt,
                  updatedAt: r.updatedAt,
                }))
              : [];
            previousDomainRecordsRef.current = canonicalRecords;
            setDomainRecords(canonicalRecords);
            setLeads(canonicalRecords.map((record) => recordToLead({ ...record.values, id: record.id, stageId: primary.stages?.find((s: any) => s.key === record.stageKey)?.id, createdAt: record.createdAt, updatedAt: record.updatedAt }, primary.stages, primary.key)));
            setPrimaryObject({ key: primary.key, stages: primary.stages, fields: primary.fields || [] });
          }
        } catch (err) {
          console.warn("Failed to load Industry Objects records:", err);
        }
      } else {
        setPrimaryObject(null);
        previousDomainRecordsRef.current = [];
        setDomainRecords([]);
      }
    } catch (err) {
      console.warn("Failed to fetch backend data, using local fallbacks:", err);
    } finally {
      setHasLoaded(true);
    }
  // kcUser?.id (not the whole kcUser object) — AuthProvider's
  // onAuthRefreshSuccess calls setUser(extractUser(keycloak)) on every
  // token refresh, handing back a brand-new object reference even though
  // the id/email/role are unchanged. Depending on the object itself made
  // this effect (and the two below) re-fire on every refresh, which
  // re-ran refreshData()'s 10 parallel apiFetch calls — each of which
  // calls keycloak.updateToken(10) internally — creating a feedback loop:
  // refresh -> new kcUser ref -> refetch everything -> more token checks
  // -> another refresh -> ... This is what caused "Maximum update depth
  // exceeded" and made the UI appear to stop responding to navigation
  // (React was saturated re-running this cascade, so the render for
  // wherever you'd actually clicked kept getting starved).
  }, [kcUser?.id, orgSettings.industry]);

  // Load database content once Keycloak has authenticated the user.
  useEffect(() => {
    if (!kcUser) return;

    // Clear all CRM localStorage when the logged-in user changes so a new
    // org admin never sees data that belonged to a previous browser session.
    const lastUserId = localStorage.getItem('chiefx_last_user_id');
    if (lastUserId !== kcUser.id) {
      const CRM_KEYS = [
        'chiefx_leads', 'chiefx_workflows',
        'chiefx_calllogs', 'chiefx_loans', 'chiefx_numbers',
        'chiefx_team', 'chiefx_org', 'chiefx_dialer_tasks', 'chiefx_question_flows',
        'chiefx_feature_flags',
      ];
      CRM_KEYS.forEach(k => localStorage.removeItem(k));
      setLeads([]); setDomainRecords([]); setWorkflows([]); setCallLogs([]);
      setLoans([]); setVirtualNumbers([]); setTeamMembers([]);
      setOrgSettings(EMPTY_ORG_SETTINGS); setDialerTasks([]); setQuestionFlows([]);
    }
    localStorage.setItem('chiefx_last_user_id', kcUser.id);

    resetUserFlags();
    setDbRole('');
    fetchUserFlags();
    setHasLoaded(false);

    apiFetch('/api/auth/workspaces')
      .then(async (res) => {
        if (!res.ok) throw new Error(`Workspace list failed: ${res.status}`);
        const rows = await res.json();
        if (!Array.isArray(rows)) throw new Error('Invalid workspace list');
        setWorkspaces(rows);
        const stored = localStorage.getItem('chiefx_active_workspace_id');
        const selected = rows.some((row: any) => row.orgId === stored)
          ? stored
          : (rows[0]?.orgId || '');
        if (selected) {
          localStorage.setItem('chiefx_active_workspace_id', selected);
          setActiveWorkspaceId(selected);
        }
        return refreshData();
      })
      .catch(() => refreshData());
  // kcUser?.id, not the object — see the comment on the effect above.
  }, [kcUser?.id]);

  // Live call events — SSE stream, authenticated with a short-lived ticket.
  useEffect(() => {
    if (!kcUser || !hasLoaded) return;
    let source: EventSource | null = null;
    let closed = false;

    (async () => {
      let ticket: string;
      try {
        const response = await apiFetch('/api/logs-stream/ticket', { method: 'POST' });
        if (!response.ok) throw new Error(`SSE ticket request failed (${response.status})`);
        const data = await response.json();
        ticket = data.ticket;
      } catch (err) {
        console.warn('SSE: failed to create ticket, skipping stream creation', err);
        return;
      }
      if (closed || !ticket) return;

      source = new EventSource(`${getApiBase()}/api/logs-stream?ticket=${encodeURIComponent(ticket)}`);
      source.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'call_started') {
            const msg = `Incoming call from ${data.callerNumber || 'unknown number'}…`;
            setLiveCallBanner({ message: msg, startedAt: Date.now() });
            pushNotification('call_started', msg);
          } else if (data.type === 'call_completed') {
            setLiveCallBanner(null);
            if (data.callLog) {
              // providerCallSid rides alongside callLog in the SSE payload
              // (not inside it) — fold it onto the stored object so
              // DialerSimulator.tsx can match "this is MY active call" by
              // the exact provider call id instead of comparing phone
              // number strings.
              setCallLogs((prev) => [{ ...data.callLog, providerCallSid: data.providerCallSid }, ...prev]);
            }
            // callFinalizer patches dialer_tasks.call_results server-side;
            // refresh so campaign Survey Status / sentiment / answers match
            // the authoritative row without waiting for the 8s poll.
            refreshDialerTasks();
            pushNotification('call_completed', `Call completed${data.callLog?.leadName ? ` with ${data.callLog.leadName}` : ''}`);
          } else if (data.type === 'auto_dial_progress') {
            // Refetch immediately instead of trying to patch the specific
            // task/field this event mentions — the backend row is the
            // single source of truth for auto-dial state, and re-reading
            // it here is simpler and can't drift out of sync with whatever
            // shape a given progress event happens to carry.
            refreshDialerTasks();
            if (data.message) pushNotification(data.type, data.message);
          } else if (data.message) {
            pushNotification(data.type || 'info', data.message);
          }
        } catch {
          // non-JSON keepalive/init messages — ignore
        }
      };
      source.onerror = () => {
        // EventSource auto-reconnects on its own; nothing to do here beyond
        // not crashing the app if the tunnel/backend is briefly unreachable.
      };
    })();

    return () => {
      closed = true;
      source?.close();
    };
  // kcUser?.id, not the object — see the comment above; otherwise every
  // token refresh tore down and reopened this SSE connection too.
  }, [kcUser?.id, hasLoaded, refreshDialerTasks]);

  // Redirect if a non-lending org lands on a lending-only route or a retired route.
  useEffect(() => {
    // Industry modules, not industry-name conditionals, decide whether a
    // domain-specific route exists for this organization.
    const industryTabIds = new Set(
      effectiveIndustryProfile.modules.map((module) => module.tabId).filter(Boolean)
    );
    const isDomainRoute = activeTab === 'loans' || activeTab === 'objects';
    if (isDomainRoute && !industryTabIds.has(activeTab)) {
      navigate('/', { replace: true });
    }
  }, [effectiveIndustryProfile, activeTab]);

  useEffect(() => {
    saveToStorage('chiefx_leads', leads);
    if (!hasLoaded) return;

    if (primaryObject) {
      // Non-lending organizations persist the canonical DomainRecord collection.
      // Lead[] is deliberately not used as a write model anymore.
      const previousRecords = previousDomainRecordsRef.current;

      domainRecords.forEach((record) => {
        if (record.id.startsWith('L-')) {
          apiFetch(`/api/objects/${primaryObject.key}/records`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...record.values, stageKey: record.stageKey || undefined }),
          })
            .then((res) => res.json())
            .then((created) => {
              if (created?.id) {
                setDomainRecords((records) => records.map((current) =>
                  current.id === record.id
                    ? { ...current, id: created.id, createdAt: created.createdAt, updatedAt: created.updatedAt }
                    : current
                ));
              }
            })
            .catch((err) => console.error("Error creating object record:", err));
          return;
        }

        const previous = previousRecords.find((item) => item.id === record.id);
        if (previous && JSON.stringify(previous) === JSON.stringify(record)) return;

        apiFetch(`/api/objects/${primaryObject.key}/records/${record.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...record.values, stageKey: record.stageKey ?? null }),
        }).catch((err) => console.error("Error syncing object record:", err));
      });

      previousDomainRecordsRef.current = domainRecords;
      return;
    }

    // Lending remains on its existing compatibility endpoint.
    const prevLeads = previousLeadsRef.current;
    const changedLeads = leads.filter((lead) => {
      const prev = prevLeads.find((item) => item.id === lead.id);
      return !prev || JSON.stringify(prev) !== JSON.stringify(lead);
    });
    if (changedLeads.length > 0) {
      apiFetch('/api/leads/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leads),
      }).catch((err) => console.error("Error syncing leads:", err));
    }
    previousLeadsRef.current = leads;
  }, [leads, domainRecords, hasLoaded, primaryObject]);

  useEffect(() => { saveToStorage('chiefx_workflows', workflows); }, [workflows]);
  useDebouncedSync('/api/workflows/sync', workflows, hasLoaded);

  useEffect(() => { saveToStorage('chiefx_calllogs', callLogs); }, [callLogs]);
  // Call Logs are backend-authoritative. Do not replace/reinsert the whole
  // call_logs table from browser state; enquiries and other records reference it.

  useEffect(() => { saveToStorage('chiefx_dialer_tasks', dialerTasks); }, [dialerTasks]);

  // Backstop poll for auto-dial progress, in case an auto_dial_progress
  // SSE event is missed (a brief reconnect gap, a background tab getting
  // throttled) — same "poll is the source of truth, the event is just a
  // latency optimization" reasoning as autoDialEngine.js's own poll loop
  // on the backend. Only runs while at least one task is actually
  // server-auto-dialing, so it costs nothing the rest of the time.
  const hasActiveAutoDial = dialerTasks.some((t: any) => t.autoDialEnabled);
  useEffect(() => {
    if (!hasActiveAutoDial) return;
    const id = setInterval(() => { refreshDialerTasks(); }, 8000);
    return () => clearInterval(id);
  }, [hasActiveAutoDial, refreshDialerTasks]);
  // Dialer tasks are server-authoritative; writes use the dedicated create/patch APIs.

  useEffect(() => { saveToStorage('chiefx_loans', loans); }, [loans]);
  useDebouncedSync('/api/loans/sync', loans, hasLoaded);

  // Only org admins / super admins can write to team, numbers, and org settings.
  // DB role is authoritative once loaded; JWT role is the optimistic initial value.
  const ADMIN_ROLE_SET = new Set(['Organization Admin', 'Super Admin']);
  const isAdmin = ADMIN_ROLE_SET.has(dbRole || kcUser?.role || '');

  // Team membership is persisted through the dedicated /api/settings/team CRUD endpoints.
  // There is intentionally no whole-list /sync endpoint; keeping this hook would
  // continuously POST to a nonexistent route and produce a 500 on every admin session.
  useEffect(() => { saveToStorage('chiefx_team', teamMembers); }, [teamMembers]);

  useEffect(() => { saveToStorage('chiefx_question_flows', questionFlows); }, [questionFlows]);
  useDebouncedSync('/api/question-flows/sync', questionFlows, hasLoaded);

  useEffect(() => { saveToStorage('chiefx_org', orgSettings); }, [orgSettings]);
  useDebouncedSync('/api/settings/org', orgSettings, hasLoaded && isAdmin);

  // Numbers sync kept separate — needs error handling + revert on conflict
  const numbersTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    saveToStorage('chiefx_numbers', virtualNumbers);
    if (!hasLoaded || !isAdmin) return;
    if (numbersTimer.current) clearTimeout(numbersTimer.current);
    numbersTimer.current = setTimeout(async () => {
      try {
        const res = await apiFetch('/api/settings/numbers/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(virtualNumbers)
        });
        if (res.ok) return;
        const body = await res.json().catch(() => ({}));
        alert(body.error || 'Failed to save virtual number(s) — reverting to last saved state.');
        const fresh = await apiFetch('/api/settings/numbers').then(r => r.json()).catch(() => null);
        if (Array.isArray(fresh)) setVirtualNumbers(fresh);
      } catch (err) { console.error("Error syncing virtual numbers:", err); }
    }, 800);
    return () => { if (numbersTimer.current) clearTimeout(numbersTimer.current); };
  }, [virtualNumbers, hasLoaded]);

  // After flags load, redirect to the first accessible tab if the current one is blocked.
  useEffect(() => {
    if (!flagsReady) return;
    const flagKey = TAB_TO_FLAG[activeTab];
    if (!flagKey || isEnabled(flagKey)) return; // current tab is fine

    // Find the first sidebar tab the user can actually see
    const orderedTabs = [
      'dashboard', 'leads', 'pipeline', 'contacts', 'workflows',
      'dialer', 'call-logs', 'reports', 'inbox', 'agent-studio',
      'compliance', 'knowledge', 'enquiries', 'audit-log', 'loans',
    ];
    const firstAccessible = orderedTabs.find(tab => {
      const fk = TAB_TO_FLAG[tab];
      return !fk || isEnabled(fk);
    });

    if (firstAccessible) {
      const s = TAB_TO_SLUG[firstAccessible] || firstAccessible;
      navigate(`/${s}`, { replace: true });
    }
    // If nothing is accessible, stay on current route — renderTabContent shows no-access UI.
  }, [flagsReady, activeTab, isEnabled]);

  // Renders the view for a given tab (not necessarily the active one — see
  // the keep-alive rendering below, which keeps previously-visited tabs
  // mounted so switching back to one doesn't re-run its initial data fetch).
  const renderTabContent = (tab: string) => {
    const flagKey = TAB_TO_FLAG[tab];
    // Only block when flags are fully loaded — render content optimistically
    // while flags are still in-flight so the page doesn't flash null → content.
    if (flagKey && !isEnabled(flagKey) && flagsReady) {
      // Flags loaded but this tab is off — check if user has ANY access
      const hasAnyAccess = grantedFlags.length > 0 ||
        ['Organization Admin', 'Super Admin'].includes(dbRole);
      return (
        <PageShell title="No Access">
          <div className="col-span-12 flex flex-col items-center justify-center h-full py-24 text-center px-6">
            <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-5">
              <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-700 mb-2">No Access</h2>
            <p className="text-sm text-slate-400 max-w-xs">
              {hasAnyAccess
                ? "You don't have access to this feature. Contact your Organization Admin to request access."
                : "Your account has no feature access yet. Please contact your Organization Admin to get started."}
            </p>
          </div>
        </PageShell>
      );
    }
    switch (tab) {
      case 'dashboard':
        return (
          <DashboardView
            leads={leads}
            callLogs={callLogs}
            loans={loans}
            dialerTasks={dialerTasks}
            orgSettings={orgSettings}
            costPerMinuteInr={costPerMinuteInr}
          />
        );
      case 'leads':
        return <LeadsView leads={leads} setLeads={setLeads} dialerTasks={dialerTasks} industryProfile={effectiveIndustryProfile} domainRecords={domainRecords} setDomainRecords={setDomainRecords} />;
      case 'pipeline':
        return <PipelineView leads={leads} setLeads={setLeads} dialerTasks={dialerTasks} setDialerTasks={setDialerTasks} industryProfile={effectiveIndustryProfile} domainRecords={domainRecords} setDomainRecords={setDomainRecords} />;
      case 'contacts':
        return (
          <ContactDirectoryView
            leads={leads}
            setLeads={setLeads}
            industry={industryContext.industry}
            industryProfile={effectiveIndustryProfile}
            callLogs={callLogs}
            dialerTasks={dialerTasks}
            primaryObjectKey={primaryObject?.key}
            primaryObjectFields={primaryObject?.fields || []}
            domainRecords={domainRecords}
            setDomainRecords={setDomainRecords}
          />
        );
      case 'call-logs':
        return <CallLogsView callLogs={callLogs} costPerMinuteInr={costPerMinuteInr} leads={leads} />;
      case 'reports':
        return <ReportsView callLogs={callLogs} dialerTasks={dialerTasks} leads={leads} costPerMinuteInr={costPerMinuteInr} orgName={orgSettings.name} industry={orgSettings.industry} />;
      case 'workflows':
        return (
          <WorkflowsView
            flows={questionFlows}
            setFlows={setQuestionFlows}
            openFlowId={activeSubTab}
            onOpenFlow={(id) => navigate(`/${TAB_TO_SLUG.workflows}/${id}`)}
            onCloseFlow={() => navigate(`/${TAB_TO_SLUG.workflows}`)}
            industryProfile={effectiveIndustryProfile}
          />
        );
      case 'dialer':
        if (activeSubTab === 'scheduled') {
          return <ScheduledCallbacksView leads={leads} />;
        }
        return (
          <DialerSimulator
            leads={leads}
            callLogs={callLogs}
            setCallLogs={setCallLogs}
            leadsDatabase={leads}
            setLeadsDatabase={setLeads}
            virtualNumbers={virtualNumbers}
            setVirtualNumbers={setVirtualNumbers}
            tasks={dialerTasks}
            setTasks={setDialerTasks}
            companyName={orgSettings.workspaceName}
            teamMembers={teamMembers}
            industry={orgSettings.industry}
            flows={questionFlows}
            mode={activeSubTab === 'inbound' ? 'inbound' : 'outbound'}
            setMode={(m) => setActiveSubTab(m, 'dialer')}
            orgSettings={orgSettings}
            setOrgSettings={setOrgSettings}
            isOrganizationAdmin={dbRole === 'Organization Admin'}
            isActive={activeTab === 'dialer'}
          />
        );
      case 'loans':
        return (
          <LoanLifecycleView
            loans={loans}
            setLoans={setLoans}
            leads={leads}
            currentUserLabel={kcUser?.name || kcUser?.email || 'Unknown user'}
          />
        );
      case 'objects':
        return <CustomObjectsView industryProfile={effectiveIndustryProfile} />;
      case 'inbox':
        return <UnifiedInboxView />;
      case 'agent-studio':
        return <AgentStudioView />;
      case 'compliance':
        return <ComplianceView />;
      case 'knowledge':
        return <KnowledgeBaseView />;
      case 'enquiries':
        return <EnquiriesView industryProfile={effectiveIndustryProfile} />;
      case 'audit-log':
        return <AuditLogView />;
      case 'company':
        return (
          <CompanyProfileView
            orgSettings={orgSettings}
            setOrgSettings={setOrgSettings}
            activeSubTab={activeSubTab as 'profile' | 'legal' | 'channels' | 'compliance'}
            setActiveSubTab={setActiveSubTab}
          />
        );
      case 'settings':
        return (
          <SettingsView
            virtualNumbers={virtualNumbers}
            setVirtualNumbers={setVirtualNumbers}
            teamMembers={teamMembers}
            setTeamMembers={setTeamMembers}
            orgSettings={orgSettings}
            setOrgSettings={setOrgSettings}
            costPerMinuteInr={costPerMinuteInr}
            phoneCostPerMinute={phoneCostPerMinute}
            phoneChargesBillable={phoneChargesBillable}
            aiTokenCost={aiTokenCost}
            aiTokenCurrentRate={aiTokenCurrentRate}
            aiTokenUsage={aiTokenUsage}
            callProviderRate={callProviderRate}
            activeSubTab={activeSubTab as 'numbers' | 'team' | 'billing' | 'api'}
            setActiveSubTab={setActiveSubTab}
            currentUserEmail={kcUser?.email}
          />
        );
      default:
        return (
          <PageShell title="Content under active construction">
            <div className="col-span-12 p-8 font-sans" />
          </PageShell>
        );
    }
  };

  // Membership gate — show spinner or no-access screen before the app
  if (membershipStatus === 'checking') {
    return (
      <div className="flex items-center justify-center h-screen w-screen" style={{ background: 'var(--bg-subtle)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Verifying access…</p>
        </div>
      </div>
    );
  }

  if (membershipStatus === 'denied') {
    return (
      <div className="flex items-center justify-center h-screen w-screen" style={{ background: 'var(--bg-subtle)' }}>
        <div className="flex flex-col items-center gap-4 text-center max-w-sm px-6">
          <div className="h-16 w-16 rounded-2xl flex items-center justify-center" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <svg className="h-8 w-8 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Access Denied</h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{membershipError}</p>
          </div>
          <button
            onClick={logout}
            className="mt-2 px-5 py-2 text-sm font-semibold rounded-xl bg-rose-500 text-white hover:bg-rose-600 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className="grid grid-cols-[auto_1fr] h-screen w-screen overflow-hidden bg-slate-50/50 dark:bg-[var(--bg)]">
      {/* Sidebar Rail */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeSubTab={activeSubTab}
        setActiveSubTab={setActiveSubTab}
        userRole={((dbRole || kcUser?.role) as UserRole) ?? null}
        organizationName={orgSettings.name}
        industry={orgSettings.industry}
        businessType={orgSettings.businessType}
        industryProfile={effectiveIndustryProfile}
      />

      {/* Main Workspace — fills remaining 12-col grid space */}
      <main className="flex flex-col min-w-0 overflow-hidden relative">
        {liveCallBanner && (
          <div className="absolute top-0 left-0 right-0 z-50 bg-emerald-600 text-white text-xs font-semibold px-4 py-2 flex items-center justify-center gap-2 animate-pulse">
            <span className="h-1.5 w-1.5 rounded-full bg-white"></span>
            {liveCallBanner.message}
          </div>
        )}
        {/* Global Floating Header */}
        <header className="h-16 bg-[var(--bg-surface)] border-b border-[var(--border)] flex items-center justify-end px-5 md:px-8 shrink-0 relative z-50">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setWorkspaceMenuOpen(open => !open)}
                aria-label={`Switch workspace. Current workspace: ${orgSettings.name}`}
                aria-expanded={workspaceMenuOpen}
                className="flex max-w-[min(18rem,55vw)] items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-left hover:bg-[var(--bg-subtle)] transition-colors"
              >
                <Building2 className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                <span className="min-w-0">
                  <span className="block text-[9px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Workspace</span>
                  <span className="block truncate text-xs font-semibold text-[var(--text-primary)]">{orgSettings.workspaceName || orgSettings.name || 'Select workspace'}</span>
                </span>
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform ${workspaceMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {workspaceMenuOpen && (
                <div className="absolute right-0 top-full z-[100] mt-2 w-72 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl">
                  <div className="border-b border-[var(--border)] px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Your Workspaces</div>
                  <div className="max-h-64 overflow-y-auto p-1">
                    {workspaces.map(workspace => {
                      const active = workspace.orgId === (activeWorkspaceId || orgSettings.id);
                      return (
                        <button
                          key={workspace.orgId}
                          type="button"
                          onClick={() => {
                            setWorkspaceMenuOpen(false);
                            if (!active) {
                              localStorage.setItem('chiefx_active_workspace_id', workspace.orgId);
                              setActiveWorkspaceId(workspace.orgId);
                              window.location.reload();
                            }
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-[var(--bg-subtle)] transition-colors"
                        >
                          <span className={`h-2 w-2 shrink-0 rounded-full ${active ? 'bg-cyan-400' : 'bg-slate-500'}`} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold text-[var(--text-primary)]">{workspace.organization.workspaceName}.chief.ai</span>
                            <span className="block truncate text-[10px] text-[var(--text-muted)]">{workspace.organization.name}</span>
                          </span>
                          {active && <span className="text-[9px] font-bold text-[var(--accent)]">ACTIVE</span>}
                        </button>
                      );
                    })}
                    {!workspaces.length && <div className="px-3 py-3 text-xs text-[var(--text-muted)]">No workspaces found.</div>}
                  </div>
                </div>
              )}
            </div>
            <NotificationBell
              notifications={notifications}
              onMarkAllRead={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
              onClear={() => setNotifications([])}
            />
            <ProfileMenu kcUser={kcUser} dbRole={dbRole} logout={logout} />
          </div>
        </header>

        {/* Selected view — 12-col grid host */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <RefreshProvider onRefresh={refreshData}>
            <PageHeaderProvider>
              <PageHeaderBar />
              <div className="flex-1 overflow-hidden flex flex-col min-h-0 relative">
                {visitedTabsForRender.map(tab => (
                  <div
                    key={tab}
                    className="flex-1 flex-col overflow-hidden min-h-0"
                    style={{ display: tab === activeTab ? 'flex' : 'none' }}
                  >
                    <ActiveTabProvider active={tab === activeTab}>
                      <ErrorBoundary label={tab}>
                        {renderTabContent(tab)}
                      </ErrorBoundary>
                    </ActiveTabProvider>
                  </div>
                ))}
              </div>
            </PageHeaderProvider>
          </RefreshProvider>
        </div>
      </main>
      </div>
    </ToastProvider>
  );
}
