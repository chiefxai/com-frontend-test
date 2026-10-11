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
