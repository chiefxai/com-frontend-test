import React from 'react';
import { Globe2, LayoutDashboard, Building2, Users, ScrollText, Settings, Database, IndianRupee, MessageSquareText, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Routes, Route, NavLink, Navigate, Link } from 'react-router-dom';
import OverviewPage from './OverviewPage';
import OrganizationsPage from './OrganizationsPage';
import CreateWorkspacePage from './CreateWorkspacePage';
import UsersPage from './UsersPage';
import ActivityPage from './ActivityPage';
import SettingsPage from './SettingsPage';
import DataRetentionPage from './DataRetentionPage';
import CostPage from './CostPage';
import PromptsPage from './PromptsPage';
import ProfileMenu from '../components/ProfileMenu';

const NAV: { path: string; label: string; icon: React.ElementType }[] = [
  { path: 'overview',       label: 'Overview',           icon: LayoutDashboard },
  { path: 'organizations',  label: 'Organizations',      icon: Building2 },
  { path: 'users',          label: 'Users',              icon: Users },
  { path: 'activity',       label: 'Activity',           icon: ScrollText },
  { path: 'cost',           label: 'Cost & Pricing',     icon: IndianRupee },
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
    <div className="admin-shell flex h-screen w-screen overflow-hidden bg-[var(--bg-base)] text-[var(--text-primary)] font-sans">
      <aside className={`admin-sidebar flex flex-col shrink-0 transition-all duration-200 ${collapsed ? 'w-[72px]' : 'w-60'}`}>
        <div className={`h-16 flex items-center border-b border-[var(--border)] ${collapsed ? 'justify-center px-2' : 'gap-2 px-5'}`}>
          <div className="h-8 w-8 rounded-lg bg-amber-500 flex items-center justify-center">
            <Globe2 className="h-4 w-4 text-white" />
          </div>
          {!collapsed && <div>
            <div className="text-sm font-bold text-[var(--text-primary)] leading-none">ChiefVoice</div>
            <div className="text-[9px] text-amber-500 uppercase tracking-widest mt-0.5">Platform Admin</div>
          </div>}
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
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

        <div className="p-3 border-t border-[var(--border)]">
          <button type="button" onClick={() => setCollapsed(value => !value)} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className={`mb-1 w-full flex items-center rounded-xl text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'}`}>
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4 mr-3" />}
            {!collapsed && 'Collapse sidebar'}
          </button>

        </div>
      </aside>

      <main className="flex-1 overflow-y-auto min-w-0">
        <div className="h-16 bg-[var(--header-bg)] border-b border-[var(--border)] flex items-center justify-between px-8 sticky top-0 z-20">
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Platform control center
          </div>
          <ProfileMenu kcUser={{ name: email, email }} dbRole="Platform Admin" logout={onLogout} />
        </div>
        <Routes>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview"      element={<PageWrap title="Overview" section="Overview"><OverviewPage /></PageWrap>} />
          <Route path="organizations" element={<PageWrap title="Organizations" section="Organizations"><OrganizationsPage /></PageWrap>} />
          <Route path="organizations/create" element={<PageWrap title="Create Workspace" section="Organizations" backTo="/admin/organizations"><CreateWorkspacePage /></PageWrap>} />
          <Route path="users"         element={<PageWrap title="Users" section="Users"><UsersPage /></PageWrap>} />
          <Route path="activity"      element={<PageWrap title="Activity" section="Activity"><ActivityPage /></PageWrap>} />
          <Route path="cost"          element={<PageWrap title="Cost & Pricing" section="Cost & Pricing"><CostPage /></PageWrap>} />
          <Route path="settings"      element={<PageWrap title="Features" section="Features"><SettingsPage /></PageWrap>} />
          <Route path="data-retention" element={<PageWrap title="Data Retention" section="Data Retention"><DataRetentionPage /></PageWrap>} />
          <Route path="prompts"       element={<PageWrap title="Prompts" section="Prompts"><PromptsPage /></PageWrap>} />
          <Route path="*"             element={<Navigate to="overview" replace />} />
        </Routes>
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
  return (
    <div className="admin-page">
      <div className="sticky top-16 z-10 border-b border-[var(--border)] bg-[var(--header-bg)]/95 backdrop-blur">
        <div className="px-8 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-medium text-[var(--text-muted)]">
                <span>Admin</span>
                <span className="text-[var(--border)]">/</span>
                {backTo && (
                  <Link
                    to={backTo}
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
                    aria-label={`Back to ${section}`}
                  >
                    ←
                  </Link>
                )}
                <span className="truncate text-[var(--text-secondary)]">{title}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="p-8 pt-5">{children}</div>
    </div>
  );
}
