/** Display-time projection of workspace-scoped feature entitlements.
 * The backend validates and enforces grants; this helper must not be used for API authorization.
 */
export function visibleWorkspaceFeatureKeys(
  organizationKeys: string[],
  workspaceKeys: string[],
  inheritedMemberKeys: string[] | undefined,
  workspaceOverride: string[] | null,
  isWorkspaceAdmin: boolean,
): string[] {
  const organization = new Set(organizationKeys);
  const member = new Set(workspaceOverride === null ? inheritedMemberKeys ?? [] : workspaceOverride);
  return workspaceKeys.filter(key => organization.has(key)
    && ((workspaceOverride === null && isWorkspaceAdmin) || member.has(key)));
}

export interface WorkspaceFeaturePolicy {
  enabledFeatures: string[];
}

export interface WorkspaceFeatureMember {
  workspaceRole: string | null;
  assignmentStatus: string | null;
  memberStatus?: string | null;
  featureFlags?: string[] | null;
}

/** Compute a member's *effective* feature keys for exactly one workspace.
 * null means policy data is unavailable: never misrepresent it as zero.
 * Empty means the member has no active assignment or has no permitted features.
 */
export function effectiveWorkspaceMemberKeys(
  organizationKeys: string[],
  workspacePolicy: WorkspaceFeaturePolicy | undefined,
  assignment: WorkspaceFeatureMember | undefined,
  inheritedMemberKeys: string[] | undefined,
): string[] | null {
  if (!workspacePolicy) return null;
  if (!assignment || assignment.assignmentStatus?.toLowerCase() !== 'active'
    || assignment.memberStatus?.toLowerCase() === 'inactive') return [];
  return visibleWorkspaceFeatureKeys(
    organizationKeys, workspacePolicy.enabledFeatures, inheritedMemberKeys,
    assignment.featureFlags ?? null, assignment.workspaceRole === 'Workspace Admin',
  );
}

/** Organization-wide admins inherit each workspace's enabled entitlements
 * without acquiring a Workspace Admin membership or workspace-specific override.
 * null means workspace policy has not been loaded (not zero access).
 */
export function organizationAdminWorkspaceFeatures(
  organizationKeys: string[],
  workspacePolicy: WorkspaceFeaturePolicy | undefined,
): string[] | null {
  if (!workspacePolicy) return null;
  const allowed = new Set(organizationKeys);
  return workspacePolicy.enabledFeatures.filter(key => allowed.has(key));
}
