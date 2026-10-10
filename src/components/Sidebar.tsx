import { useAuthorization, canAccessTab } from '../lib/authorization';
import React, { useState, useRef, useEffect } from 'react';
import Tooltip from './ui/Tooltip';
import SidebarFrame from './ui/SidebarFrame';
import chiefVoiceLogo from '../assets/chiefvoice-logo.webp';
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
} from 'lucide-react';
import { UserRole } from '../types';
import { useFeatureFlags } from '../features/feature-flags/FeatureFlagContext';
import { TAB_TO_FLAG } from '../features/feature-flags/registry';
import { useIndustry } from '../lib/industry';
import type { IndustryProfile } from '../lib/industry/types';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeSubTab: string;
  setActiveSubTab: (subTab: string, parentTab?: string) => void;
  userRole: UserRole | null;
  organizationName: string;
  industry: string;
  businessType?: string;
  industryProfile?: IndustryProfile;
}

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
      { id: 'numbers',  label: 'Workspaces & Numbers', icon: Building2 },
      { id: 'team',     label: 'Staff & Teams',   icon: Users },
      { id: 'billing',  label: 'Billing & Usage', icon: CreditCard },
    ],
  },
];

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
  activeItemId,
  anchorRect,
  onSelect,
  onClose,
}: {
  group: SidebarGroup;
  activeTab: string;
  activeSubTab: string;
  /** Flat sub-route active in a synthetic group such as Dashboard. */
  activeItemId?: string;
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

  const isGroupActive = activeItemId !== undefined || activeTab === group.tabId;
  const top = Math.max(8, Math.min(anchorRect.top, window.innerHeight - (group.subItems.length * 44 + 56)));

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
      <div className="px-4 py-2 mb-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{group.label}</span>
      </div>
      {group.subItems.map((sub) => {
        const SubIcon = sub.icon;
        const isActive = activeItemId !== undefined ? activeItemId === sub.id : isGroupActive && activeSubTab === sub.id;
        return (
          <button
            key={sub.id}
            onClick={() => { onSelect(sub.id); onClose(); }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-[var(--accent-subtle)] text-[var(--text-primary)]'
                : 'hover:bg-[var(--bg-subtle)]'
            }`}
            style={isActive ? { color: 'var(--accent)' } : { color: 'var(--text-secondary)' }}
          >
            <SubIcon className={`h-4 w-4 shrink-0 ${isActive ? 'text-[var(--accent)]' : ''}`} style={isActive ? {} : { color: 'var(--text-muted)' }} />
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
  businessType,
  industryProfile,
}: SidebarProps) {
  const industryContext = useIndustry({ industry, businessType });
  const { can } = useAuthorization();
  const isAdmin = can('workspace.settings.manage') || can('organization.members.read') || can('billing.read');
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

  const profile = industryProfile || industryContext.profile;
  const labels = profile.labels;
  const isHealthcare = profile.key === 'healthcare';

  const industryModuleIcons: Record<string, React.ElementType> = {
    layers: Layers,
    users: Users,
    target: Target,
    contact: Contact,
    phone: Phone,
    calendar: Clock,
    sparkles: Sparkles,
  };

  const industryModuleItems = profile.modules
    .filter((module) => module.tabId)
    .filter((module) => !module.featureFlag || isEnabled(module.featureFlag))
    .map((module) => ({
      id: module.tabId!,
      // The healthcare patient records module is the single Patients entry.
      // The server may still send the legacy "Patient Records" label.
      label: isHealthcare && module.tabId === 'objects' ? 'Patients' : module.label,
      icon: industryModuleIcons[module.iconKey || 'layers'] || Layers,
    }));

  // Prefer the existing Patient Records screen when permitted. Keep a
  // Patients fallback for users who have directory access but not Objects.
  const canUsePatientRecords = isHealthcare
    && industryModuleItems.some(item => item.id === 'objects')
    && canAccessTab('objects');

  const allMenuItems = [
    { id: 'leads',        label: labels.lead.plural,             icon: UserPlus },
    { id: 'pipeline',     label: labels.pipeline.plural,          icon: Target },
    { id: 'contacts',     label: isHealthcare ? 'Patients' : `${labels.contact.plural} Directory`, icon: Contact },
    { id: 'workflows',    label: 'Workflow Builder',  icon: GitBranch },
    { id: 'call-logs',    label: 'Call Logs',         icon: History },
    { id: 'inbox',        label: 'Unified Inbox',     icon: Inbox },
    { id: 'agent-studio', label: 'Agent Studio',      icon: Sparkles },
    { id: 'compliance',   label: 'Compliance',        icon: ShieldBan },
    { id: 'knowledge',    label: 'Knowledge Base',    icon: BookOpen },
    { id: 'enquiries',    label: labels.enquiry.plural,         icon: MessageCircleQuestion },
    { id: 'audit-log',    label: 'Audit Log',         icon: ScrollText },
    ...industryModuleItems,
  ];

  const menuItems = allMenuItems.filter((item) => {
    // One Patients navigation item, never a second Patients Directory link.
    if (canUsePatientRecords && item.id === 'contacts') return false;
    if (!canAccessTab(item.id)) return false;
    const flagKey = TAB_TO_FLAG[item.id];
    if (flagKey && !isEnabled(flagKey)) return false;
    return true;
  });

  const visibleGroups = SIDEBAR_GROUPS.map(group => ({ ...group,
    subItems: group.subItems.filter(item => canAccessTab(group.tabId,item.id)),
  })).filter((group) => {
    if (!group.subItems.length || !canAccessTab(group.tabId)) return false;
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

    if (!canAccessTab(item.id)) return false;
    const flagKey = TAB_TO_FLAG[item.id];
    return !flagKey || isEnabled(flagKey);
  });

  const navBtnCls = (isActive: boolean) =>
    `w-full flex items-center rounded-[9px] text-sm font-medium transition-all duration-150 group ${
      collapsed ? 'justify-center px-0 py-3' : 'px-4 py-3'
    } ${isActive ? 'shadow-none ring-1 ring-inset ring-cyan-300/10' : 'hover:bg-white/5'}`;

  const navBtnStyle = (isActive: boolean): React.CSSProperties =>
    isActive
      ? {
          background: 'linear-gradient(90deg, rgba(24,200,242,0.16), rgba(22,119,255,0.14), rgba(123,44,255,0.12))',
          color: 'var(--text-primary)',
          boxShadow: 'inset 3px 0 0 #18C8F2, inset 0 0 0 1px rgba(22,119,255,0.14)',
        }
      : { color: 'var(--text-secondary)' };

  const iconCls = (isActive: boolean) =>
    `h-4 w-4 shrink-0 ${collapsed ? '' : 'mr-3'}`;

  const iconStyle = (isActive: boolean): React.CSSProperties =>
    isActive ? { color: 'var(--accent)' } : { color: 'var(--text-muted)' };

  const subBtnCls = (isActive: boolean) =>
    `w-full flex items-center px-4 py-3 rounded-[9px] text-sm font-medium transition-all duration-150 group ${
      isActive ? 'shadow-none ring-1 ring-inset ring-[var(--accent)]/10' : 'hover:bg-[var(--bg-subtle)]'
    }`;

  const subBtnStyle = (isActive: boolean): React.CSSProperties =>
    isActive
      ? {
          background: 'linear-gradient(90deg, rgba(24,200,242,0.16), rgba(123,44,255,0.12))',
          color: 'var(--text-primary)',
          boxShadow: 'inset 2px 0 0 #7B2CFF, inset 0 0 0 1px rgba(123,44,255,0.14)',
        }
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
    <SidebarFrame
      id="sidebar-container"
      collapsed={collapsed}
      onToggleCollapse={toggleCollapsed}
      collapsedWidth="w-16"
      expandedWidth="w-64"
      className="font-sans transition-all duration-200 ease-in-out"
      style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)', color: 'var(--text-primary)' }}
    >
      {/* Product brand and organization identity */}
      <div
        className={`shrink-0 ${collapsed ? 'px-2 py-3' : 'px-4 pt-4 pb-0'}`}
        style={collapsed ? { borderBottom: '1px solid var(--sidebar-border)' } : undefined}
      >
        <div className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : ''}`}>
        <img
          src={chiefVoiceLogo}
          alt="ChiefVoice"
          className="h-9 w-9 shrink-0 rounded-lg object-contain"
        />
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-sm font-bold leading-tight tracking-wide" style={{ color: 'var(--text-primary)' }}>Chief Voice</div>
          </div>
        )}
        </div>
        {!collapsed && (
          <div className="-mx-4 mt-3 border-y px-4 py-2" style={{ borderColor: 'var(--sidebar-border)' }}>
            <div className="truncate text-xs font-medium" style={{ color: 'var(--text-secondary)' }} title={organizationName}>
              {organizationName || 'Organization'}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className={`flex-1 overflow-y-auto space-y-1.5 ${collapsed ? 'px-2 py-6' : 'px-4 pt-4 pb-6'}`}>

        {/* Dashboard uses the SAME collapsed group flyout as Campaign. */}
        {dashboardSubItems.length > 0 && (() => {
          const dashboardGroup: SidebarGroup = {
            tabId: DASHBOARD_GROUP_KEY,
            label: 'Dashboard',
            icon: LayoutDashboard,
            subItems: dashboardSubItems,
          };
          const isGroupActive = activeTab === 'dashboard' || activeTab === 'reports';
          const isExpanded = expandedGroups.has(DASHBOARD_GROUP_KEY) && !collapsed;
          const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;
          const flyoutOpen = collapsed && flyoutGroup === DASHBOARD_GROUP_KEY;

          const groupBtn = (
            <button
              id="nav-dashboard-group"
              type="button"
              aria-label="Dashboard"
              aria-expanded={flyoutOpen || isExpanded}
              aria-haspopup={collapsed ? 'menu' : undefined}
              onClick={event => toggleGroup(DASHBOARD_GROUP_KEY, event.currentTarget)}
              className={navBtnCls(isGroupActive)}
              style={navBtnStyle(isGroupActive)}
            >
              <LayoutDashboard className={iconCls(isGroupActive)} style={iconStyle(isGroupActive)} />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left truncate min-w-0">Dashboard</span>
                  <ChevronIcon className="h-3.5 w-3.5 shrink-0"
                    style={{ color: isGroupActive ? '#ffffff99' : 'var(--text-muted)' }} />
                </>
              )}
            </button>
          );

          return (
            <div className="relative">
              {collapsed ? <CollapsedTooltip label="Dashboard">{groupBtn}</CollapsedTooltip> : groupBtn}

              {flyoutOpen && flyoutRect && (
                <GroupFlyout
                  group={dashboardGroup}
                  activeTab={activeTab}
                  activeSubTab={activeSubTab}
                  activeItemId={activeTab}
                  anchorRect={flyoutRect}
                  onSelect={id => {
                    setActiveTab(id);
                    setFlyoutGroup(null);
                    setFlyoutRect(null);
                  }}
                  onClose={() => {
                    setFlyoutGroup(null);
                    setFlyoutRect(null);
                  }}
                />
              )}

              {isExpanded && (
                <div className="mt-1.5 space-y-1.5">
                  {dashboardSubItems.map(sub => {
                    const SubIcon = sub.icon;
                    const isActive = activeTab === sub.id;
                    return (
                      <button
                        type="button"
                        key={sub.id}
                        id={'nav-dashboard-group-' + sub.id}
                        onClick={() => {
                          setActiveTab(sub.id);
                          setFlyoutGroup(null);
                          setFlyoutRect(null);
                        }}
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

    </SidebarFrame>
  );
}
