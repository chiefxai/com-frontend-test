import { describe, expect, it } from 'vitest';
import { visibleWorkspaceFeatureKeys, effectiveWorkspaceMemberKeys } from '../lib/workspaceMemberFeatures';

describe('per-workspace staff feature access', () => {
  const organization = ['leads', 'reports', 'agent_studio'];
  const workA = ['leads', 'reports'];
  const workB = ['reports', 'agent_studio'];

  it('uses independent workspace overrides for the same staff member', () => {
    expect(visibleWorkspaceFeatureKeys(organization, workA, ['leads'], ['leads'], false)).toEqual(['leads']);
    expect(visibleWorkspaceFeatureKeys(organization, workB, ['leads'], ['agent_studio'], false)).toEqual(['agent_studio']);
  });

  it('treats an empty override as no access rather than inheriting grants', () => {
    expect(visibleWorkspaceFeatureKeys(organization, workA, ['leads'], [], false)).toEqual([]);
    expect(visibleWorkspaceFeatureKeys(organization, workA, ['leads'], null, false)).toEqual(['leads']);
  });

  it('never displays features above organization and workspace policies', () => {
    expect(visibleWorkspaceFeatureKeys(['leads'], ['leads', 'reports'], [], ['leads', 'reports'], false)).toEqual(['leads']);
    expect(visibleWorkspaceFeatureKeys(organization, ['leads'], [], ['agent_studio'], false)).toEqual([]);
  });

  it('honors explicit overrides for a workspace admin without changing inherited access', () => {
    expect(visibleWorkspaceFeatureKeys(organization, workA, [], null, true)).toEqual(['leads','reports']);
    expect(visibleWorkspaceFeatureKeys(organization, workA, [], ['reports'], true)).toEqual(['reports']);
  });

  it('shows the exact same workspace-specific count as the Workspace Access panel', () => {
    const person = { workspaceRole: 'Member', assignmentStatus: 'Active', memberStatus: 'Active', featureFlags: ['leads'] };
    expect(effectiveWorkspaceMemberKeys(organization, { enabledFeatures: workA }, person, ['reports'])).toEqual(['leads']);
    expect(effectiveWorkspaceMemberKeys(organization, { enabledFeatures: workB },
      { ...person, featureFlags: ['agent_studio', 'reports'] }, ['leads'])).toEqual(['reports', 'agent_studio']);
  });

  it('distinguishes missing workspace policies from an intentionally empty policy', () => {
    const assigned = { workspaceRole: 'Workspace Admin', assignmentStatus: 'Active', memberStatus: 'Active' };
    expect(effectiveWorkspaceMemberKeys(organization, undefined, assigned, ['leads'])).toBeNull();
    expect(effectiveWorkspaceMemberKeys(organization, { enabledFeatures: [] }, assigned, ['leads'])).toEqual([]);
  });

  it('does not count absent, suspended or inactive workspace assignments', () => {
    const policy = { enabledFeatures: workA };
    expect(effectiveWorkspaceMemberKeys(organization, policy, undefined, ['leads'])).toEqual([]);
    expect(effectiveWorkspaceMemberKeys(organization, policy,
      { workspaceRole: 'Member', assignmentStatus: 'Inactive' }, ['leads'])).toEqual([]);
    expect(effectiveWorkspaceMemberKeys(organization, policy,
      { workspaceRole: 'Member', assignmentStatus: 'Active', memberStatus: 'Inactive' }, ['leads'])).toEqual([]);
  });

  it('supports explicit empty member grants and legacy inherited grants', () => {
    const policy = { enabledFeatures: workA };
    const member = { workspaceRole: 'Member', assignmentStatus: 'Active', memberStatus: 'Active' };
    expect(effectiveWorkspaceMemberKeys(organization, policy, { ...member, featureFlags: [] }, ['leads'])).toEqual([]);
    expect(effectiveWorkspaceMemberKeys(organization, policy, { ...member, featureFlags: null }, ['leads'])).toEqual(['leads']);
    expect(effectiveWorkspaceMemberKeys(organization, policy,
      { ...member, workspaceRole: 'Workspace Admin' }, [])).toEqual(['leads', 'reports']);
  });
});

describe('effective counts track the selected workspace', () => {
  it('counts policy-constrained grants instead of organization defaults', () => {
    const org = ['leads', 'reports', 'agent_studio'];
    const a = { enabledFeatures: ['leads', 'reports'] };
    const b = { enabledFeatures: ['reports', 'agent_studio'] };
    const onA = { workspaceRole: 'Member', assignmentStatus: 'Active', featureFlags: ['leads'] };
    const onB = { workspaceRole: 'Member', assignmentStatus: 'Active', featureFlags: ['reports', 'agent_studio'] };
    expect(effectiveWorkspaceMemberKeys(org, a, onA, ['leads', 'reports'])?.length).toBe(1);
    expect(effectiveWorkspaceMemberKeys(org, b, onB, ['leads'])?.length).toBe(2);
    expect(effectiveWorkspaceMemberKeys(org, b, { ...onB, featureFlags: [] }, ['reports'])?.length).toBe(0);
  });
});
