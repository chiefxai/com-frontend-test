import { describe, expect, it } from 'vitest';
import { visibleWorkspaceFeatureKeys } from '../lib/workspaceMemberFeatures';

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
});
