import React from 'react';
import {
  LayoutDashboard, Building2, Users, ScrollText, Settings, Database,
  IndianRupee, MessageSquareText, Layers3, ShieldCheck,
} from 'lucide-react';
import { Routes, Route, NavLink, Navigate, Link } from 'react-router-dom';
import OverviewPage from './OverviewPage';
import OrganizationsPage from './OrganizationsPage';
import CreateWorkspacePage from './CreateWorkspacePage';
import UsersPage from './UsersPage';
import ActivityPage from './ActivityPage';
import SettingsPage from './SettingsPage';
import DataRetentionPage from './DataRetentionPage';
import CostPage from './CostPage';
import WorkspacePlansPage from './WorkspacePlansPage';
import PaymentReviewsPage from './PaymentReviewsPage';
import PromptsPage from './PromptsPage';
import ProfileMenu from '../components/ProfileMenu';
import PageHeaderBar from '../components/ui/PageHeaderBar';
import Tooltip from '../components/ui/Tooltip';
import { PageHeaderProvider, usePageHeaderContext } from '../lib/PageHeaderContext';
import SidebarBrand from '../components/ui/SidebarBrand';

const NAV: { path: string; label: string; icon: React.ElementType }[] = [
  { path: 'overview',        label: 'Overview',                icon: LayoutDashboard },
  { path: 'organizations',   label: 'Organizations',           icon: Building2 },
  { path: 'users',           label: 'Users',                   icon: Users },
  { path: 'activity',        label: 'Activity',                icon: ScrollText },
  { path: 'cost',            label: 'Cost & Pricing',          icon: IndianRupee },
  { path: 'workspace-plans', label: 'Workspace Plans',         icon: Layers3 },
  { path: 'payment-reviews', label: 'Payment Reviews',         icon: ShieldCheck },
  { path: 'settings',        label: 'Features',                icon: Settings },
  { path: 'data-retention',  label: 'Data Retention & Backup', icon: Database },
  { path: 'prompts',         label: 'Prompts',                 icon: MessageSquareText },
];

const COLLAPSE_STORAGE = 'admin-sidebar-collapsed';

function initialCollapsed() {
  if (typeof window === 'undefined') return false;
  try {
    const saved = window.localStorage.getItem(COLLAPSE_STORAGE);
    // Default to an icon rail on narrow screens, while respecting a stored choice.
    return saved === null ? window.innerWidth < 768 : saved === 'true';
  } catch {
    return window.innerWidth < 768;
  }
}

export default function AdminShell({ email, onLogout }: { email: string; onLogout: () => void }) {
  const [collapsed, setCollapsed] = React.useState(initialCollapsed);
  const toggleSidebar = () => setCollapsed(current => !current);

  React.useEffect(() => {
    try { window.localStorage.setItem(COLLAPSE_STORAGE, String(collapsed)); }
    catch { /* Browsers may restrict local storage. */ }
  }, [collapsed]);

  return (
    <div className="admin-shell flex h-dvh w-screen min-w-0 overflow-hidden bg-[var(--sidebar-bg)] font-sans text-[var(--text-primary)]">
      {/* A single, full-height navigation surface contains the brand, collapse
          control, routes, and account menu. There is no separate app header. */}
      <aside
        aria-label="Platform Admin sidebar"
        className={`admin-sidebar relative z-30 flex h-dvh min-h-0 shrink-0 flex-col overflow-visible transition-[width] duration-200 ease-out ${collapsed ? 'w-[64px]' : 'w-[268px] max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:shadow-2xl'}`}
      >
        <SidebarBrand
          collapsed={collapsed}
          onToggle={toggleSidebar}
          title="ChiefVoice"
          subtitle="Platform Admin"
          homeTo="/admin/overview"
          navId="platform-admin-nav"
        />


        <nav id="platform-admin-nav" aria-label="Platform Admin navigation"
          className={`min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pb-3 ${collapsed ? 'px-2' : 'px-3'}`}>
          {!collapsed && (
            <p className="px-3 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              Workspace
            </p>
          )}
          {NAV.map(({ path, label, icon: Icon }) => {
            const item = (
              <NavLink
                key={path}
                to={`/admin/${path}`}
                onClick={() => { if (window.innerWidth < 768) setCollapsed(true); }}
                title={collapsed ? label : undefined}
                aria-label={collapsed ? label : undefined}
                className={({ isActive }) =>
                  `group flex h-11 w-full items-center rounded-xl text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${collapsed ? 'justify-center' : 'gap-3 px-3'} ${isActive
                    ? 'bg-[var(--accent-subtle)] font-semibold text-[var(--accent)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'}`
                }
              >
                <Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span className="min-w-0 truncate">{label}</span>}
              </NavLink>
            );
            return collapsed
              ? <Tooltip key={path} label={label} side="right" className="flex w-full">{item}</Tooltip>
              : item;
          })}
        </nav>

        <div className={`shrink-0 border-t border-[var(--sidebar-border)] ${collapsed ? 'px-2 py-3' : 'px-3 py-3'}`}>
          {!collapsed && (
            <p className="mb-2 flex items-center gap-2 px-2.5 text-[11px] text-[var(--text-muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              Platform control center
            </p>
          )}
          <div className={`flex items-center gap-2 rounded-xl ${collapsed ? 'justify-center' : 'px-1'}`}>
            <ProfileMenu
              kcUser={{ name: email, email }}
              dbRole="Platform Admin"
              logout={onLogout}
              placement="top-start"
              compact={collapsed}
            />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-[var(--text-primary)]" title={email}>{email}</p>
                <p className="text-[10px] text-[var(--text-muted)]">Account & appearance</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* On narrow screens, an expanded sidebar overlays the content rather than
          shrinking the workspace; tapping outside closes it. */}
      {!collapsed && (
        <button type="button" aria-label="Close navigation panel" onClick={() => setCollapsed(true)}
          className="fixed inset-0 z-20 bg-black/40 md:hidden" />
      )}

      {/* The page title and route content share one uninterrupted canvas,
          like ChatGPT and Google Cloud, instead of two stacked chrome bars. */}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-tl-2xl bg-[var(--bg-base)]">
        <PageHeaderProvider>
          <PageHeaderBar integrated />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-[var(--bg-base)]">
            <Routes>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<PageWrap title="Overview" section="Overview"><OverviewPage /></PageWrap>} />
              <Route path="organizations" element={<PageWrap title="Organizations" section="Organizations"><OrganizationsPage /></PageWrap>} />
              <Route path="organizations/create" element={<PageWrap title="Create Workspace" section="Organizations" backTo="/admin/organizations"><CreateWorkspacePage /></PageWrap>} />
              <Route path="users" element={<PageWrap title="Users" section="Users"><UsersPage /></PageWrap>} />
              <Route path="activity" element={<PageWrap title="Activity" section="Activity"><ActivityPage /></PageWrap>} />
              <Route path="cost" element={<PageWrap title="Cost & Pricing" section="Cost & Pricing"><CostPage /></PageWrap>} />
              <Route path="workspace-plans" element={<PageWrap title="Workspace Plans" section="Workspace Plans"><WorkspacePlansPage /></PageWrap>} />
              <Route path="payment-reviews" element={<PageWrap title="Payment Reviews" section="Payment Reviews"><PaymentReviewsPage /></PageWrap>} />
              <Route path="settings" element={<PageWrap title="Features" section="Features"><SettingsPage /></PageWrap>} />
              <Route path="data-retention" element={<PageWrap title="Data Retention & Backup" section="Data Retention & Backup"><DataRetentionPage /></PageWrap>} />
              <Route path="prompts" element={<PageWrap title="Prompts" section="Prompts"><PromptsPage /></PageWrap>} />
              <Route path="*" element={<Navigate to="overview" replace />} />
            </Routes>
          </div>
        </PageHeaderProvider>
      </main>
    </div>
  );
}

function PageWrap({
  title, section, backTo, children,
}: {
  title: string;
  section: string;
  backTo?: string;
  children: React.ReactNode;
}) {
  const headerCtx = usePageHeaderContext();
  React.useEffect(() => {
    if (!headerCtx) return;
    headerCtx.setHeader({
      title: (
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-[10px] font-medium text-[var(--text-muted)]">Admin</span>
          <span className="text-[var(--border)]">/</span>
          {backTo && (
            <>
              <Link to={backTo} className="text-[10px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">
                {section}
              </Link>
              <span className="text-[var(--border)]">/</span>
            </>
          )}
          <span className="truncate">{title}</span>
        </span>
      ),
    });
  }, [headerCtx?.setHeader, title, section, backTo]);

  return <div className="admin-page px-5 pb-5 pt-3 md:px-8">{children}</div>;
}
