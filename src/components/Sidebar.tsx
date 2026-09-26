import React, { useState, useRef, useEffect } from 'react';
import Tooltip from './ui/Tooltip';
import {
  LayoutDashboard,
  Users,
  GitBranch,
  PhoneCall,
  PhoneIncoming,
  Settings,
  Layers,
  Contact,
  UserPlus,
  Target,
  Building2,
  Inbox,
  Sparkles,
  ShieldBan,
  BookOpen,
  ScrollText,
  CreditCard,
  History,
  MessageCircleQuestion,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Phone,
  Clock,
  Scale,
  Globe,
  UserCheck,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { UserRole } from '../types';
import { useFeatureFlags } from '../features/feature-flags/FeatureFlagContext';
import { TAB_TO_FLAG } from '../features/feature-flags/registry';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeSubTab: string;
  setActiveSubTab: (subTab: string, parentTab?: string) => void;
  userRole: UserRole | null;
  organizationName: string;
  industry: string;
}

const LENDING_ONLY_TAB_IDS = new Set(['loans']);

// Synthetic key for the "Dashboard" group's own expand/collapse + flyout
// state — not a real routable tab, just a Set/Map key (see DASHBOARD_GROUP
// usage below), so it can share the exact same generic toggleGroup()/
// expandedGroups state the Company Profile / Administration groups use.
const DASHBOARD_GROUP_KEY = 'dashboard-group';

interface SubItem { id: string; label: string; icon: React.ElementType; }
interface SidebarGroup { tabId: string; label: string; icon: React.ElementType; subItems: SubItem[]; adminOnly?: boolean; }

const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    tabId: 'dialer',
    label: 'Campaign',
    icon: PhoneCall,
    subItems: [
      { id: 'outbound',  label: 'Outbound Campaigns',       icon: PhoneCall },
      { id: 'inbound',   label: 'Inbound Calls',            icon: PhoneIncoming },
      { id: 'scheduled', label: 'Scheduled Callbacks',      icon: Clock },
    ],
  },
  {
    tabId: 'company',
    label: 'Company Profile',
    icon: Building2,
    adminOnly: true,
    subItems: [
      { id: 'profile',    label: 'Organization Profile',   icon: UserCheck },
      { id: 'legal',      label: 'Legal & Registration',   icon: Scale },
      { id: 'channels',   label: 'Communication Channels', icon: Globe },
      { id: 'compliance', label: 'Compliance',             icon: ShieldBan },
    ],
  },
  {
    tabId: 'settings',
    label: 'Administration',
    icon: Settings,
    adminOnly: true,
    // 'api' (API Keys) hidden from navigation for now — SettingsView.tsx's
    // content for it is untouched, just not reachable from here.
    subItems: [
      { id: 'numbers',  label: 'Virtual Numbers', icon: Phone },
      { id: 'team',     label: 'Staff & Teams',   icon: Users },
      { id: 'billing',  label: 'Billing & Usage', icon: CreditCard },
    ],
  },
];

const INDUSTRY_TAGLINES: Record<string, string> = {
  lending:        'Loan CRM Platform',
  real_estate:    'Real Estate CRM Platform',
  healthcare:     'Healthcare CRM Platform',
  insurance:      'Insurance CRM Platform',
  education:      'Education CRM Platform',
  ecommerce:      'E-commerce CRM Platform',
  automotive:     'Automotive CRM Platform',
  field_services: 'Field Services CRM Platform',
  it_sales:       'IT Sales CRM Platform',
};

// ── Tooltip (flat items in collapsed mode) ────────────────────────────────────
// Thin wrapper over the shared ui/Tooltip — kept as its own name since
// every call site below already uses <CollapsedTooltip>, and this is just
// that component pinned to the sidebar's "always appears to the right"
// requirement instead of every call site repeating side="right".
function CollapsedTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  // Tooltip's own wrapper defaults to inline-flex (shrink-to-fit). Nav
  // buttons inside are `w-full justify-center` to center their icon —
  // but "full width of the shrink-wrapped tooltip div" isn't the same as
  // "full width of the nav column", so the button never actually got the
  // width it needed to center against, and the icon sat squashed to one
  // side instead of centered in the collapsed 64px rail. "w-full flex"
  // here makes the tooltip wrapper itself take the nav's full width so
  // the button's own centering has something real to center within.
  return <Tooltip label={label} side="right" className="w-full flex">{children}</Tooltip>;
}

// ── Flyout panel (group items in collapsed mode) ──────────────────────────────
function GroupFlyout({
  group,
  activeTab,
  activeSubTab,
  anchorRect,
  onSelect,
  onClose,
}: {
  group: SidebarGroup;
  activeTab: string;
  activeSubTab: string;
  anchorRect: DOMRect;
  onSelect: (subId: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const isGroupActive = activeTab === group.tabId;
  const top = Math.min(anchorRect.top, window.innerHeight - (group.subItems.length * 44 + 56));

  return (
    <div
      ref={ref}
      className="fixed z-[9999] rounded-xl shadow-2xl py-2"
      style={{
        top,
        left: anchorRect.right + 8,
        minWidth: 200,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
      }}
    >
      {/* Group title */}
      <div className="px-4 py-2 mb-1" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{group.label}</span>
      </div>
      {group.subItems.map((sub) => {
        const SubIcon = sub.icon;
        const isActive = isGroupActive && activeSubTab === sub.id;
        return (
          <button
            key={sub.id}
            onClick={() => { onSelect(sub.id); onClose(); }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-blue-600 text-white'
                : 'hover:bg-[var(--bg-subtle)]'
            }`}
            style={isActive ? {} : { color: 'var(--text-secondary)' }}
          >
            <SubIcon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : ''}`} style={isActive ? {} : { color: 'var(--text-muted)' }} />
            {sub.label}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Sidebar({
  activeTab,
  setActiveTab,
  activeSubTab,
  setActiveSubTab,
  userRole,
  organizationName,
  industry,
}: SidebarProps) {
  const isLending = !industry || industry === 'lending';
  const isAdmin = userRole === 'Organization Admin' || userRole === 'Super Admin';
  const { isEnabled } = useFeatureFlags();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true'; } catch { return false; }
  });

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('sidebar-collapsed', String(next)); } catch {}
      return next;
    });
    // Close any open flyout when toggling
    setFlyoutGroup(null);
  };

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const initial = new Set(SIDEBAR_GROUPS.filter(g => g.tabId === activeTab).map(g => g.tabId));
    if (activeTab === 'dashboard' || activeTab === 'reports') initial.add(DASHBOARD_GROUP_KEY);
    return initial;
  });

  // Which group flyout is open in collapsed mode, plus its anchor rect
  const [flyoutGroup, setFlyoutGroup] = useState<string | null>(null);
  const [flyoutRect, setFlyoutRect] = useState<DOMRect | null>(null);

  const toggleGroup = (tabId: string, triggerEl?: HTMLElement) => {
    if (collapsed) {
      if (flyoutGroup === tabId) {
        setFlyoutGroup(null);
        setFlyoutRect(null);
      } else {
        setFlyoutGroup(tabId);
        setFlyoutRect(triggerEl ? triggerEl.getBoundingClientRect() : null);
      }
      return;
    }
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(tabId) ? next.delete(tabId) : next.add(tabId);
      return next;
    });
  };

  const tagline = INDUSTRY_TAGLINES[industry] || 'AI CRM Platform';

  const allMenuItems = [
    { id: 'leads',        label: 'Leads',             icon: UserPlus },
    { id: 'pipeline',     label: 'Pipeline',          icon: Target },
    { id: 'contacts',     label: 'Contact Directory', icon: Contact },
    { id: 'workflows',    label: 'Workflow Builder',  icon: GitBranch },
    { id: 'call-logs',    label: 'Call Logs',         icon: History },
    { id: 'inbox',        label: 'Unified Inbox',     icon: Inbox },
    { id: 'agent-studio', label: 'Agent Studio',      icon: Sparkles },
    { id: 'compliance',   label: 'Compliance',        icon: ShieldBan },
    { id: 'knowledge',    label: 'Knowledge Base',    icon: BookOpen },
    { id: 'enquiries',    label: 'Enquiries',         icon: MessageCircleQuestion },
    { id: 'audit-log',    label: 'Audit Log',         icon: ScrollText },
    { id: 'loans',        label: 'Loan Lifecycle',    icon: Layers },
  ];

  const menuItems = allMenuItems.filter((item) => {
    if (LENDING_ONLY_TAB_IDS.has(item.id) && !isLending) return false;
    const flagKey = TAB_TO_FLAG[item.id];
    if (flagKey && !isEnabled(flagKey)) return false;
    return true;
  });

  const visibleGroups = SIDEBAR_GROUPS.filter((group) => {
    const flagKey = TAB_TO_FLAG[group.tabId];
    return !flagKey || isEnabled(flagKey);
  });
  const publicGroups = visibleGroups.filter((g) => !g.adminOnly);
  const configGroups = visibleGroups.filter((g) => g.adminOnly);

  // "Dashboard" section — groups the two overview-style pages (Executive
  // Desk, Reports) under one collapsible header, same visual treatment as
  // the Company Profile / Administration groups below. Each item still
  // routes exactly like it did as a flat item (setActiveTab(id) directly —
  // no shared parent tab/subTab), so App.tsx's routing, TAB_TO_SLUG, and
  // the flag-gated redirect logic for these two pages are untouched.
  const dashboardSubItems = [
    { id: 'dashboard', label: 'Executive Desk', icon: LayoutDashboard },
    { id: 'reports',   label: 'Reports',        icon: BarChart3 },
  ].filter((item) => {
    // Keep Reports visible when the feature flag is enabled.
    // TAB_TO_FLAG is derived from the feature registry.

    const flagKey = TAB_TO_FLAG[item.id];
    return !flagKey || isEnabled(flagKey);
  });

  const navBtnCls = (isActive: boolean) =>
    `w-full flex items-center rounded-xl text-sm font-medium transition-all duration-150 group ${
      collapsed ? 'justify-center px-0 py-3' : 'px-4 py-3'
    } ${isActive ? 'shadow-sm' : 'hover:bg-[var(--bg-subtle)]'}`;

  const navBtnStyle = (isActive: boolean): React.CSSProperties =>
    isActive
      ? { background: '#2563eb', color: '#ffffff' }
      : { color: 'var(--text-secondary)' };

  const iconCls = (isActive: boolean) =>
    `h-4 w-4 shrink-0 ${collapsed ? '' : 'mr-3'}`;

  const iconStyle = (isActive: boolean): React.CSSProperties =>
    isActive ? { color: '#ffffff' } : { color: 'var(--text-muted)' };

  const subBtnCls = (isActive: boolean) =>
    `w-full flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 group ${
      isActive ? 'shadow-sm' : 'hover:bg-[var(--bg-subtle)]'
    }`;

  const subBtnStyle = (isActive: boolean): React.CSSProperties =>
    isActive
      ? { background: '#2563eb', color: '#ffffff' }
      : { color: 'var(--text-secondary)' };

  const renderGroup = (group: SidebarGroup) => {
    const GroupIcon = group.icon;
    const isGroupActive = activeTab === group.tabId;
    const isExpanded = expandedGroups.has(group.tabId) && !collapsed;
    const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;
    const flyoutOpen = collapsed && flyoutGroup === group.tabId;

    const groupBtn = (
      <button
        id={`nav-${group.tabId}`}
        onClick={(e) => {
          toggleGroup(group.tabId, e.currentTarget);
          if (!collapsed) setActiveSubTab(group.subItems[0].id, group.tabId);
        }}
        className={navBtnCls(isGroupActive)}
        style={navBtnStyle(isGroupActive)}
      >
        <GroupIcon className={iconCls(isGroupActive)} style={iconStyle(isGroupActive)} />
        {!collapsed && (
          <>
            <span className="flex-1 text-left truncate min-w-0">{group.label}</span>
            <ChevronIcon className="h-3.5 w-3.5 shrink-0" style={{ color: isGroupActive ? '#ffffff99' : 'var(--text-muted)' }} />
          </>
        )}
      </button>
    );

    return (
      <div key={group.tabId} className="relative">
        {/* In collapsed mode wrap with tooltip; flyout is separate */}
        {collapsed ? (
          <CollapsedTooltip label={group.label}>{groupBtn}</CollapsedTooltip>
        ) : groupBtn}

        {/* Flyout for collapsed mode */}
        {flyoutOpen && flyoutRect && (
          <GroupFlyout
            group={group}
            activeTab={activeTab}
            activeSubTab={activeSubTab}
            anchorRect={flyoutRect}
            onSelect={(subId) => { setActiveSubTab(subId, group.tabId); setFlyoutGroup(null); setFlyoutRect(null); }}
            onClose={() => { setFlyoutGroup(null); setFlyoutRect(null); }}
          />
        )}

        {/* Inline sub-items for expanded mode */}
        {isExpanded && (
          <div className="mt-1.5 space-y-1.5">
            {group.subItems.map((sub) => {
              const SubIcon = sub.icon;
              const isSubActive = isGroupActive && activeSubTab === sub.id;
              return (
                <button
                  key={sub.id}
                  id={`nav-${group.tabId}-${sub.id}`}
                  onClick={() => setActiveSubTab(sub.id, group.tabId)}
                  className={subBtnCls(isSubActive)}
                  style={subBtnStyle(isSubActive)}
                >
                  <SubIcon className="h-4 w-4 mr-3 shrink-0" style={iconStyle(isSubActive)} />
                  <span className="truncate min-w-0 flex-1 text-left">{sub.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      id="sidebar-container"
      className={`relative flex flex-col h-screen shrink-0 font-sans transition-all duration-200 ease-in-out ${
        collapsed ? 'w-16' : 'w-64'
      }`}
      style={{ background: 'var(--bg-surface)', borderRight: '1px solid var(--border)', color: 'var(--text-primary)' }}
    >
      {/* Brand Header */}
      <div className={`flex items-center ${collapsed ? 'p-3 justify-center' : 'p-6'}`} style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="h-10 w-10 rounded-xl flex items-center justify-center shadow-lg bg-blue-600 shadow-blue-600/20 text-white shrink-0">
          <Layers className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="ml-3 min-w-0">
            <h1 className="text-lg font-bold font-display tracking-tight leading-none truncate" style={{ color: 'var(--text-primary)' }}>
              {organizationName || 'ChiefVoice'}
            </h1>
            <p className="text-[10px] text-slate-400 font-mono mt-1 uppercase tracking-widest">{tagline}</p>
          </div>
        )}
      </div>

      {/* Org Badge */}
      {!collapsed && (
        <div className="px-6 py-3 flex items-center justify-between" style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 truncate max-w-[150px]">
            <Building2 className="h-3.5 w-3.5 shrink-0" /> {organizationName}
          </span>
          <div className="flex items-center space-x-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[9px] font-mono text-emerald-600 uppercase tracking-wider">Live</span>
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={toggleCollapsed}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-16 z-20 flex items-center justify-center h-6 w-6 rounded-full border shadow-sm transition-all duration-150 hover:text-blue-600 hover:border-blue-300"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
      >
        {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
      </button>

      {/* Navigation */}
      <nav className={`flex-1 py-6 overflow-y-auto space-y-1.5 ${collapsed ? 'px-2' : 'px-4'}`}>
        {!collapsed && (
          <p className="px-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Workspace</p>
        )}

        {/* Dashboard group — Executive Desk + Reports, collapsible like Company Profile / Administration */}
        {dashboardSubItems.length > 0 && (() => {
          const isGroupActive = activeTab === 'dashboard' || activeTab === 'reports';
          const isExpanded = expandedGroups.has(DASHBOARD_GROUP_KEY) && !collapsed;
          const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;
          const flyoutOpen = collapsed && flyoutGroup === DASHBOARD_GROUP_KEY;

          const groupBtn = (
            <button
              id="nav-dashboard-group"
              onClick={(e) => toggleGroup(DASHBOARD_GROUP_KEY, e.currentTarget)}
              className={navBtnCls(isGroupActive)}
              style={navBtnStyle(isGroupActive)}
            >
              <LayoutDashboard className={iconCls(isGroupActive)} style={iconStyle(isGroupActive)} />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left truncate min-w-0">Dashboard</span>
                  <ChevronIcon className="h-3.5 w-3.5 shrink-0" style={{ color: isGroupActive ? '#ffffff99' : 'var(--text-muted)' }} />
                </>
              )}
            </button>
          );

          return (
            <div className="relative">
              {collapsed ? <CollapsedTooltip label="Dashboard">{groupBtn}</CollapsedTooltip> : groupBtn}

              {flyoutOpen && flyoutRect && (
                <div
                  className="fixed z-[9999] rounded-xl shadow-2xl py-2"
                  style={{
                    top: Math.min(flyoutRect.top, window.innerHeight - (dashboardSubItems.length * 44 + 56)),
                    left: flyoutRect.right + 8,
                    minWidth: 200,
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <div className="px-4 py-2 mb-1" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Dashboard</span>
                  </div>
                  {dashboardSubItems.map((sub) => {
                    const SubIcon = sub.icon;
                    const isActive = activeTab === sub.id;
                    return (
                      <button
                        key={sub.id}
                        onClick={() => { setActiveTab(sub.id); setFlyoutGroup(null); setFlyoutRect(null); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
                          isActive ? 'bg-blue-600 text-white' : 'hover:bg-[var(--bg-subtle)]'
                        }`}
                        style={isActive ? {} : { color: 'var(--text-secondary)' }}
                      >
                        <SubIcon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : ''}`} style={isActive ? {} : { color: 'var(--text-muted)' }} />
                        {sub.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {isExpanded && (
                <div className="mt-1.5 space-y-1.5">
                  {dashboardSubItems.map((sub) => {
                    const SubIcon = sub.icon;
                    const isActive = activeTab === sub.id;
                    return (
                      <button
                        key={sub.id}
                        id={`nav-dashboard-group-${sub.id}`}
                        onClick={() => { setActiveTab(sub.id); setFlyoutGroup(null); }}
                        className={subBtnCls(isActive)}
                        style={subBtnStyle(isActive)}
                      >
                        <SubIcon className="h-4 w-4 mr-3 shrink-0" style={iconStyle(isActive)} />
                        <span className="truncate min-w-0 flex-1 text-left">{sub.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* Public sidebar groups (e.g. Voice Simulator) — visible to all roles */}
        {publicGroups.map((group) => renderGroup(group))}

        {/* Flat menu items */}
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const btn = (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              onClick={() => { setActiveTab(item.id); setFlyoutGroup(null); }}
              className={navBtnCls(isActive)}
              style={navBtnStyle(isActive)}
            >
              <Icon className={iconCls(isActive)} style={iconStyle(isActive)} />
              {!collapsed && <span className="truncate min-w-0 flex-1 text-left">{item.label}</span>}
            </button>
          );
          return collapsed ? (
            <CollapsedTooltip key={item.id} label={item.label}>{btn}</CollapsedTooltip>
          ) : btn;
        })}

        {/* Configuration groups — admin only */}
        {isAdmin && <div className={collapsed ? 'pt-2' : 'pt-3'}>
          {!collapsed && (
            <p className="px-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Configuration</p>
          )}

          {configGroups.map((group) => renderGroup(group))}
        </div>}
      </nav>

    </aside>
  );
}
