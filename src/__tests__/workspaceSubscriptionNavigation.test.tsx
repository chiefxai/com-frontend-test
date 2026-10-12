import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar, { type WorkspaceOption } from '../components/Sidebar';
import SettingsView from '../components/SettingsView';
import { legacyAuthorization, setAuthorization } from '../lib/authorization';
import { shouldShowWorkspaceSwitcher, showWorkspaceManagement } from '../lib/workspaceNavigation';
import type { OrganizationSettings, VirtualNumber } from '../types';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), showToast: vi.fn() }));
vi.mock('../lib/api', () => ({ apiFetch: mocks.apiFetch, getApiBase: () => '' }));
vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mocks.showToast }) }));
vi.mock('../shared/theme/ThemeContext', () => ({
  useTheme: () => ({ mode: 'light', resolved: 'light', setMode: vi.fn() }),
}));
vi.mock('../components/NotificationBell', () => ({
  default: () => <button type="button" aria-label="Notifications">Alerts</button>,
}));
vi.mock('../components/WorkspaceManagement', () => ({
  default: () => <div data-testid="workspace-management">Manage workspaces</div>,
}));
vi.mock('../components/WorkspaceSharing', () => ({
  default: () => <div data-testid="workspace-sharing">Workspace sharing</div>,
}));
vi.mock('../features/feature-flags/FeatureFlagContext', () => ({
  useFeatureFlags: () => ({ isEnabled: () => true }),
}));

const workspaces: WorkspaceOption[] = [
  {
    orgId: 'org-one', workspaceId: 'ws-one', role: 'Organization Admin',
    workspace: { id: 'ws-one', name: 'Head Office', status: 'Active' },
    organization: { id: 'org-one', name: 'Sample Org', workspaceName: 'Head Office', status: 'Active' },
  },
  {
    orgId: 'org-two', workspaceId: 'ws-two', role: 'Member',
    workspace: { id: 'ws-two', name: 'East Office', status: 'Active' },
    organization: { id: 'org-two', name: 'Another Org', workspaceName: 'East Office', status: 'Active' },
  },
];
const orgSettings: OrganizationSettings = {
  id: 'org-one', name: 'Sample Org', workspaceName: 'Head Office',
  subscriptionPlan: 'Starter', aiMinutesUsed: 0, phoneCharges: 0,
  billingPeriodEnd: '', apiKeys: [],
};
const number: VirtualNumber & { workspaceId: string } = {
  id: 'line-one', number: '+15550000001', workspaceId: 'ws-one',
  provider: 'Vobiz.ai', status: 'Active', friendlyName: 'Main line',
  routingUrl: '', incomingCallCount: 4, outgoingCallCount: 2,
};
const respond = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

beforeEach(() => {
  setAuthorization(legacyAuthorization('Organization Admin'));
  localStorage.setItem('sidebar-collapsed', 'false');
  mocks.apiFetch.mockReset();
  mocks.showToast.mockReset();
  mocks.apiFetch.mockImplementation(async (path: string) => {
    if (path === '/api/settings/organization/numbers')
      return respond({ rows: [number], workspaces: [{ id: 'ws-one', name: 'Head Office', status: 'Active' }] });
    if (path === '/api/settings/organization/workspace-features')
      return respond({ availableFeatures: ['leads'], workspaces: [{ id: 'ws-one', name: 'Head Office', configured: true, enabledFeatures: ['leads'] }] });
    if (path === '/api/settings/organization/workspace-access')
      return respond({ workspaces: [{ id: 'ws-one', name: 'Head Office', status: 'Active' }], assignments: [] });
    return respond([]);
  });
});
afterEach(() => {
  cleanup();
  setAuthorization(null);
  localStorage.removeItem('sidebar-collapsed');
});

function sidebarView(multipleWorkspacesEnabled: boolean, memberships: WorkspaceOption[] = workspaces.slice(0, 1)) {
  return <MemoryRouter>
    <Sidebar
      workspaces={memberships}
      multipleWorkspacesEnabled={multipleWorkspacesEnabled}
      activeWorkspaceId="ws-one"
      workspaceName="Head Office"
      onWorkspaceChange={vi.fn()}
      notifications={[]}
      onMarkAllNotificationsRead={vi.fn()}
      onClearNotifications={vi.fn()}
      activeTab="dashboard"
      setActiveTab={vi.fn()}
      activeSubTab=""
      setActiveSubTab={vi.fn()}
      userRole="Organization Admin"
      organizationName="Sample Org"
      industry="lending"
      accountUser={null}
      accountRole="Organization Admin"
      onLogout={vi.fn()}
    />
  </MemoryRouter>;
}

function settingsView(multipleWorkspacesEnabled: boolean, workspaceSharingEnabled = true) {
  return <MemoryRouter>
    <SettingsView
      virtualNumbers={[number]} setVirtualNumbers={vi.fn()}
      teamMembers={[]} setTeamMembers={vi.fn()}
      orgSettings={orgSettings} setOrgSettings={vi.fn()}
      activeSubTab="numbers" activeWorkspaceId="ws-one"
      multipleWorkspacesEnabled={multipleWorkspacesEnabled}
      workspaceSharingEnabled={workspaceSharingEnabled}
    />
  </MemoryRouter>;
}

describe('subscription-aware workspace navigation', () => {
  it('hides the switcher when the purchased plan is single-workspace and only one membership exists', () => {
    expect(shouldShowWorkspaceSwitcher(false, workspaces.slice(0, 1))).toBe(false);
    expect(showWorkspaceManagement(false)).toBe(false);
    render(sidebarView(false));
    expect(screen.queryByText('Current workspace')).not.toBeInTheDocument();
    expect(screen.queryByText('Head Office')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Administration' }));
    expect(screen.getByRole('button', { name: 'Phone Numbers' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Workspaces & Numbers' })).not.toBeInTheDocument();
  });

  it('keeps the switcher on a multi-workspace plan even when only one has been created', () => {
    expect(shouldShowWorkspaceSwitcher(true, workspaces.slice(0, 1))).toBe(true);
    expect(showWorkspaceManagement(true)).toBe(true);
    render(sidebarView(true));
    expect(screen.getByText('Current workspace')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Administration' }));
    expect(screen.getByRole('button', { name: 'Workspaces & Numbers' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Phone Numbers' })).not.toBeInTheDocument();
  });

  it('keeps account switching available across two distinct single-workspace organizations', () => {
    expect(shouldShowWorkspaceSwitcher(false, workspaces)).toBe(true);
    render(sidebarView(false, workspaces));
    expect(screen.getByText('Current workspace')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Administration' }));
    expect(screen.getByRole('button', { name: 'Phone Numbers' })).toBeInTheDocument();
  });

  it('does not count suspended or inactive memberships as other available workspaces', () => {
    expect(shouldShowWorkspaceSwitcher(false, [
      workspaces[0],
      { ...workspaces[1], organization: { ...workspaces[1].organization, status: 'Suspended' } },
    ])).toBe(false);
    expect(shouldShowWorkspaceSwitcher(false, [
      workspaces[0],
      { ...workspaces[1], workspace: { ...workspaces[1].workspace!, status: 'Inactive' } },
    ])).toBe(false);
  });

  it('goes straight to Phone Numbers without rendering workspace management or sharing for single-workspace plans', async () => {
    render(settingsView(false, true));
    expect(screen.getByText('Phone Numbers')).toBeInTheDocument();
    expect(screen.queryByText('Workspaces & Numbers')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: 'Workspace management views' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('workspace-management')).not.toBeInTheDocument();
    expect(screen.queryByTestId('workspace-sharing')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to Workspaces & Numbers' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('columnheader', { name: 'Telephone Number' })).toBeInTheDocument());
    expect(screen.queryByRole('columnheader', { name: 'Workspace' })).not.toBeInTheDocument();
    const numberButton = screen.getByRole('button', { name: 'View details for number +15550000001' });
    fireEvent.click(numberButton);
    expect(screen.getByText('Number Details')).toBeInTheDocument();
    expect(screen.queryByText('Workspace association')).not.toBeInTheDocument();
    expect(screen.queryByText('Workspace Members')).not.toBeInTheDocument();
  });

  it('preserves workspace management, sharing, and workspace number filters for multi-workspace plans', async () => {
    render(settingsView(true, true));
    expect(screen.getByRole('tablist', { name: 'Workspace management views' })).toBeInTheDocument();
    expect(screen.getByTestId('workspace-management')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Sharing' }));
    expect(screen.getByTestId('workspace-sharing')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Phone Numbers' }));
    await waitFor(() => expect(screen.getByRole('columnheader', { name: 'Workspace' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'View workspace details for number +15550000001' })).toBeInTheDocument();
  });
});
