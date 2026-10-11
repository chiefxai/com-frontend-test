import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuthorization, setAuthorization } from '../lib/authorization';
import { getStaffWorkspaceRole } from '../lib/staffWorkspaceRoles';
import { effectiveWorkspaceMemberKeys, organizationAdminWorkspaceFeatures } from '../lib/workspaceMemberFeatures';
import { selectAuthorizedWorkspace, workspaceIdentifier, identityMatchesSelectedWorkspace } from '../lib/workspaceSelection';
import { fetchUserFlags, resetUserFlags } from '../features/feature-flags/userFlagsStore';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../lib/api', () => ({ apiFetch: mocks.apiFetch }));

const memberships = [
  { orgId: 'org-a', workspaceId: 'a-main', organization: { status: 'Active' }, workspace: { status: 'Active' } },
  { orgId: 'org-a', workspaceId: 'a-branch', organization: { status: 'Active' }, workspace: { status: 'Active' } },
  { orgId: 'org-b', workspaceId: 'b-hold', organization: { status: 'Suspended' }, workspace: { status: 'Active' } },
  { orgId: 'org-b', workspaceId: 'b-closed', organization: { status: 'Active' }, workspace: { status: 'Inactive' } },
];
const makeAuth = (permissions: string[]) => ({
  organizationRole: 'Member', workspaceRole: 'Viewer', platformAdmin: false, permissions,
});
describe('authenticated workspace bootstrap boundary', () => {
  beforeEach(() => { mocks.apiFetch.mockReset(); resetUserFlags(); });
  afterEach(() => setAuthorization(null));

  it('rejects a remembered workspace that is not in the member list', () => {
    expect(workspaceIdentifier(selectAuthorizedWorkspace(memberships, 'attacker-workspace')!)).toBe('a-main');
  });
  it('retains a permitted remembered workspace without treating the organization as workspace', () => {
    expect(workspaceIdentifier(selectAuthorizedWorkspace(memberships, 'a-branch')!)).toBe('a-branch');
  });
  it('never selects suspended organizations or inactive workspaces', () => {
    expect(workspaceIdentifier(selectAuthorizedWorkspace(memberships, 'b-hold')!)).toBe('a-main');
    expect(workspaceIdentifier(selectAuthorizedWorkspace(memberships, 'b-closed')!)).toBe('a-main');
    expect(selectAuthorizedWorkspace(memberships.slice(2), 'b-hold')).toBeNull();
  });
  it('rejects a cross-org response and an incorrectly acknowledged workspace', () => {
    const selected = memberships[1];
    expect(identityMatchesSelectedWorkspace({ org: { id: 'org-b' }, workspace: { id: 'a-branch' } }, selected)).toBe(false);
    expect(identityMatchesSelectedWorkspace({ org: { id: 'org-a' }, workspace: { id: 'a-main' } }, selected)).toBe(false);
    expect(identityMatchesSelectedWorkspace({ org: { id: 'org-a' } }, selected)).toBe(false);
    expect(identityMatchesSelectedWorkspace({ org: { id: 'org-a' }, workspace: { id: 'a-branch' } }, selected)).toBe(true);
  });
  it('permits the original organization-as-workspace legacy membership only for the same org', () => {
    const legacy = { orgId: 'org-a' };
    expect(identityMatchesSelectedWorkspace({ org: { id: 'org-a' } }, legacy)).toBe(true);
    expect(identityMatchesSelectedWorkspace({ org: { id: 'org-b' } }, legacy)).toBe(false);
  });
  it('does not escalate verified read-only permissions from stale feature grants or org-admin labels', async () => {
    const verified = makeAuth(['workspace.read']);
    setAuthorization(verified);
    mocks.apiFetch.mockResolvedValue({ ok: true, json: async () => ({
      role: 'Organization Admin',
      featureFlags: ['reports'],
      authorization: { organizationRole: 'Organization Admin', workspaceRole: null,
        platformAdmin: false, permissions: ['organization.manage', 'billing.credit.allocate'] },
    }) });
    await fetchUserFlags();
    expect(getAuthorization()).toEqual(verified);
    expect(getAuthorization()?.permissions).not.toContain('billing.credit.allocate');
  });
  it('accepts a canonical authorization only when no earlier snapshot exists', async () => {
    const verified = makeAuth(['workspace.read']);
    mocks.apiFetch.mockResolvedValue({ ok: true, json: async () => ({
      role: 'Viewer', featureFlags: [], authorization: verified,
    }) });
    await fetchUserFlags();
    expect(getAuthorization()).toEqual(verified);
  });
  it('does not replace verified authorization with inferred role permissions', async () => {
    const verified = makeAuth(['workspace.read']);
    setAuthorization(verified);
    mocks.apiFetch.mockResolvedValue({ ok: true, json: async () => ({
      role: 'Organization Admin', featureFlags: ['leads'],
    }) });
    await fetchUserFlags();
    expect(getAuthorization()).toEqual(verified);
  });
  it('retains validated permissions when the feature endpoint fails', async () => {
    const verified = makeAuth(['workspace.read']);
    setAuthorization(verified);
    mocks.apiFetch.mockRejectedValue(new Error('Temporary outage'));
    await fetchUserFlags();
    expect(getAuthorization()).toEqual(verified);
  });
});

describe('two-workspace authorization projection', () => {
  const policyA = { enabledFeatures: ['leads', 'reports'] };
  const policyB = { enabledFeatures: ['reports', 'agent_studio'] };
  const orgKeys = ['leads', 'reports', 'agent_studio'];
  const memberId = 'staff-42';
  const assignments = {
    'a-main': [{ memberId, workspaceRole: 'Manager', assignmentStatus: 'Active', memberStatus: 'Active', featureFlags: ['leads'] }],
    'a-branch': [{ memberId, workspaceRole: 'Viewer', assignmentStatus: 'Active', memberStatus: 'Active', featureFlags: ['reports'] }],
  };
  it('changes ordinary staff role and effective grants with workspace selection', () => {
    expect(getStaffWorkspaceRole(memberId, 'a-main', assignments, 'a-main')).toBe('Manager');
    expect(effectiveWorkspaceMemberKeys(orgKeys, policyA, assignments['a-main'][0], ['leads'])).toEqual(['leads']);
    expect(getStaffWorkspaceRole(memberId, 'a-branch', assignments, 'a-branch')).toBe('Viewer');
    expect(effectiveWorkspaceMemberKeys(orgKeys, policyB, assignments['a-branch'][0], ['leads'])).toEqual(['reports']);
  });
  it('keeps Organization Admin organization-wide while counts change per workspace', () => {
    for (const id of ['a-main', 'a-branch']) {
      expect(getStaffWorkspaceRole(memberId, id, assignments, id, [], false, 'Organization Admin')).toBe('Organization Admin');
    }
    expect(organizationAdminWorkspaceFeatures(orgKeys, policyA)).toEqual(['leads', 'reports']);
    expect(organizationAdminWorkspaceFeatures(orgKeys, policyB)).toEqual(['reports', 'agent_studio']);
  });
});
