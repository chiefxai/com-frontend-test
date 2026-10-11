import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SettingsView from '../components/SettingsView';
import { setAuthorization } from '../lib/authorization';
import type { OrganizationSettings, TeamMember, VirtualNumber } from '../types';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), showToast: vi.fn() }));
vi.mock('../lib/api', () => ({ apiFetch: mocks.apiFetch, getApiBase: () => '' }));
vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

const orgSettings: OrganizationSettings = {
  id: 'org-1', name: 'Sample Organization', workspaceName: 'North',
  subscriptionPlan: 'Enterprise', aiMinutesUsed: 0, phoneCharges: 0,
  billingPeriodEnd: '', apiKeys: [],
};
const member = (id: string, name: string, role: TeamMember['role'], featureFlags: string[]): TeamMember => ({
  id, name, email: id + '@example.test', role, status: 'Active',
  performanceScore: 0, assignedLeadsCount: 0, featureFlags,
});
const members = [
  member('orgadmin', 'Org Admin', 'Organization Admin', ['leads', 'reports', 'agent_studio']),
  member('employee', 'Staff One', 'Member', ['leads', 'reports', 'agent_studio']),
];
const assignment = (memberId: string, workspaceRole: string | null, featureFlags: string[] | null, organizationRole = 'Member') => ({
  memberId, name: memberId === 'orgadmin' ? 'Org Admin' : 'Staff One',
  email: memberId + '@example.test', workspaceRole, organizationRole,
  assignmentStatus: 'Active', memberStatus: 'Active', roleSource: 'manual',
  featureFlags, canDelete: false,
});
const assignments = {
  'ws-north': [assignment('orgadmin', null, null, 'Organization Admin'), assignment('employee', 'Manager', ['leads'])],
  'ws-south': [assignment('orgadmin', null, null, 'Organization Admin'), assignment('employee', 'Viewer', ['reports'])],
};
const policies = [
  { id: 'ws-north', name: 'North', configured: true, enabledFeatures: ['leads'] },
  { id: 'ws-south', name: 'South', configured: true, enabledFeatures: ['reports', 'agent_studio'] },
];
const response = (data: unknown) => ({ ok: true, json: async () => data }) as Response;

function mount(workspaceId: string, teamMembers: TeamMember[] = members) {
  return <SettingsView
    virtualNumbers={[] as VirtualNumber[]} setVirtualNumbers={vi.fn()}
    teamMembers={teamMembers} setTeamMembers={vi.fn()}
    orgSettings={orgSettings} setOrgSettings={vi.fn()}
    activeSubTab="team" activeWorkspaceId={workspaceId}
    currentUserEmail="admin@example.test"
  />;
}

beforeEach(() => {
  mocks.apiFetch.mockReset(); mocks.showToast.mockReset();
  mocks.apiFetch.mockImplementation(async (path: string) => {
    if (path === '/api/settings/organization/workspace-features')
      return response({ availableFeatures: ['leads', 'reports', 'agent_studio'], workspaces: policies });
    if (path === '/api/settings/organization/workspace-access')
      return response({
        workspaces: policies.map(({ id, name }) => ({ id, name, status: 'Active' })),
        assignments: Object.entries(assignments).map(([workspaceId, rows]) => ({ workspaceId, members: rows })),
      });
    if (path === '/api/settings/workspace/members')
      return response(assignments['ws-north']);
    if (path === '/api/settings/workspace/assignable-features')
      return response({ featureFlags: ['leads', 'reports'] });
    return response([]);
  });
});
afterEach(() => { cleanup(); setAuthorization(null); });

describe('Staff & Teams rendered workspace permissions', () => {
  it('keeps Organization Admin distinct from workspace roles while its effective feature count changes', async () => {
    setAuthorization({
      organizationRole: 'Organization Admin', workspaceRole: null, platformAdmin: false,
      permissions: ['organization.read', 'organization.manage', 'organization.members.read',
        'organization.members.manage', 'workspace.members.manage', 'workspace.read'],
    });
    const rendered = render(mount('ws-north'));
    await waitFor(() => {
      const adminRow = screen.getByText('Org Admin').closest('tr');
      expect(adminRow).toBeTruthy();
      expect(within(adminRow!).getByText('Organization Admin')).toBeInTheDocument();
      expect(within(adminRow!).getByText('1 granted')).toBeInTheDocument();
    });
    const employeeRow = screen.getByText('Staff One').closest('tr')!;
    expect(within(employeeRow).getByText('Manager')).toBeInTheDocument();

    rendered.rerender(mount('ws-south'));
    await waitFor(() => {
      const adminRow = screen.getByText('Org Admin').closest('tr')!;
      expect(within(adminRow).getByText('Organization Admin')).toBeInTheDocument();
      expect(within(adminRow).getByText('2 granted')).toBeInTheDocument();
      const staffRow = screen.getByText('Staff One').closest('tr')!;
      expect(within(staffRow).getByText('Viewer')).toBeInTheDocument();
    });
  });

  it('does not offer organization or elevated workspace roles to a Workspace Manager', async () => {
    setAuthorization({
      organizationRole: 'Member', workspaceRole: 'Manager', platformAdmin: false,
      permissions: ['workspace.read', 'workspace.members.manage'],
    });
    mocks.apiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/settings/workspace/members') return response([assignment('employee', 'Viewer', null)]);
      if (path === '/api/settings/workspace/assignable-features')
        return response({ featureFlags: ['leads', 'reports'] });
      return response([]);
    });
    render(mount('ws-north', []));
    const roleSelect = await screen.findByRole('combobox', { name: 'Role for Staff One' });
    const options = within(roleSelect).getAllByRole('option').map(option => option.textContent);
    expect(options).toContain('Member');
    expect(options).toContain('Viewer');
    expect(options).not.toContain('Manager');
    expect(options).not.toContain('Workspace Admin');
    expect(options).not.toContain('Organization Admin');
    fireEvent.click(screen.getByText('Inherited grants'));
    expect(await screen.findByText(/inherits their default grants/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save access' })).toBeDisabled();
  });
});
