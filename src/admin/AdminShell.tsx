import React from 'react';
import { LayoutDashboard, Building2, Users, ScrollText, Settings, Database, IndianRupee, MessageSquareText } from 'lucide-react';
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
import { PageHeaderProvider, usePageHeaderContext } from '../lib/PageHeaderContext';
import chiefVoiceLogo from '../assets/chiefvoice-logo.webp';
import SidebarFrame from '../components/ui/SidebarFrame';

const NAV: { path: string; label: string; icon: React.ElementType }[] = [
  { path: 'overview',       label: 'Overview',           icon: LayoutDashboard },
  { path: 'organizations',  label: 'Organizations',      icon: Building2 },
  { path: 'users',          label: 'Users',              icon: Users },
  { path: 'activity',       label: 'Activity',           icon: ScrollText },
  { path: 'cost',           label: 'Cost & Pricing',     icon: IndianRupee },
  { path: 'workspace-plans', label: 'Workspace Plans',   icon: Building2 },
  { path: 'payment-reviews', label: 'Payment Reviews', icon: IndianRupee },
  { path: 'settings',       label: 'Features',           icon: Settings },
  { path: 'data-retention', label: 'Data Retention',      icon: Database },
  { path: 'prompts',        label: 'Prompts',             icon: MessageSquareText },
];

export default function AdminShell({ email, onLogout }: { email: string; onLogout: () => void }) {
  const [collapsed, setCollapsed] = React.useState(() => localStorage.getItem('admin-sidebar-collapsed') === 'true');

  React.useEffect(() => {
    localStorage.setItem('admin-sidebar-collapsed', String(collapsed));
  }, [collapsed]);
  return (
    <div className="admin-shell flex h-dvh w-screen overflow-hidden overscroll-none bg-[var(--bg-base)] text-[var(--text-primary)] font-sans">
      <SidebarFrame
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(value => !value)}
        collapsedWidth="w-[72px]"
        expandedWidth="w-60"
        className="admin-sidebar self-start transition-all duration-200"
      >
        <div className={`sticky top-0 z-10 h-16 shrink-0 flex items-center border-b border-[var(--border)] bg-[var(--sidebar-bg)] ${collapsed ? 'justify-center px-2' : 'gap-2 px-5'}`}>
          <div className="h-8 w-8 shrink-0 flex items-center justify-center overflow-hidden">
            <img src={chiefVoiceLogo} alt="ChiefVoice" className="h-9 w-9 object-contain" />
          </div>
          {!collapsed && <div className="min-w-0 overflow-hidden">
            <div className="text-sm font-bold text-[var(--text-primary)] leading-none truncate">ChiefVoice</div>
            <div className="text-[9px] text-amber-500 uppercase tracking-widest mt-0.5">Platform Admin</div>
          </div>}
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-4 space-y-1">
          {NAV.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={`/admin/${path}`}
              className={({ isActive }) =>
                `w-full flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive ? 'admin-nav-active' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                }`
              }
            >
              <Icon className={`h-4 w-4 shrink-0 ${collapsed ? '' : 'mr-3'}`} />
              {!collapsed && label}
            </NavLink>
          ))}
        </nav>

      </SidebarFrame>

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <header className="h-16 shrink-0 bg-[var(--header-bg)] border-b border-[var(--border)] flex items-center justify-between px-8 z-20">
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Platform control center
          </div>
          <ProfileMenu kcUser={{ name: email, email }} dbRole="Platform Admin" logout={onLogout} />
        </header>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <PageHeaderProvider>
            <PageHeaderBar />
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain">
        <Routes>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview"      element={<PageWrap title="Overview" section="Overview"><OverviewPage /></PageWrap>} />
          <Route path="organizations" element={<PageWrap title="Organizations" section="Organizations"><OrganizationsPage /></PageWrap>} />
          <Route path="organizations/create" element={<PageWrap title="Create Workspace" section="Organizations" backTo="/admin/organizations"><CreateWorkspacePage /></PageWrap>} />
          <Route path="users"         element={<PageWrap title="Users" section="Users"><UsersPage /></PageWrap>} />
          <Route path="activity"      element={<PageWrap title="Activity" section="Activity"><ActivityPage /></PageWrap>} />
          <Route path="cost"          element={<PageWrap title="Cost & Pricing" section="Cost & Pricing"><CostPage /></PageWrap>} />
          <Route path="workspace-plans" element={<PageWrap title="Workspace Plans" section="Workspace Plans"><WorkspacePlansPage /></PageWrap>} />
          <Route path="payment-reviews" element={<PageWrap title="Payment Reviews" section="Payment Reviews"><PaymentReviewsPage /></PageWrap>} />
          <Route path="settings"      element={<PageWrap title="Features" section="Features"><SettingsPage /></PageWrap>} />
          <Route path="data-retention" element={<PageWrap title="Data Retention" section="Data Retention"><DataRetentionPage /></PageWrap>} />
          <Route path="prompts"       element={<PageWrap title="Prompts" section="Prompts"><PromptsPage /></PageWrap>} />
          <Route path="*"             element={<Navigate to="overview" replace />} />
        </Routes>
            </div>
          </PageHeaderProvider>
        </div>
      </main>
    </div>
  );
}

function PageWrap({
  title,
  section,
  backTo,
  children,
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
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-medium text-[var(--text-muted)]">Admin</span>
          <span className="text-[var(--border)]">/</span>
          {backTo ? (
            <>
              <Link
                to={backTo}
                className="text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                {section}
              </Link>
              <span className="text-[var(--border)]">/</span>
            </>
          ) : null}
          <span className="truncate">{title}</span>
        </span>
      )
    });
  }, [headerCtx?.setHeader, title, section, backTo]);

  return <div className="admin-page px-8 pb-4 pt-5">{children}</div>;
}
