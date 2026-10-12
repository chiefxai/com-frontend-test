/**
 * A single-workspace subscription should not show an unnecessary selector.
 * However, users belonging to multiple organizations must still be able to
 * switch between them, even if each organization has a single-workspace plan.
 * Plan entitlement alone does not require a selector: at least two accessible
 * workspaces must actually exist.
 */
export interface WorkspaceNavigationMembership {
  orgId: string;
  workspaceId?: string | null;
  organization?: { status?: string | null } | null;
  workspace?: { status?: string | null } | null;
}

export function shouldShowWorkspaceSwitcher(
  _multipleWorkspacesEnabled: boolean,
  memberships: readonly WorkspaceNavigationMembership[],
): boolean {
  const accessible = memberships.filter(member =>
    member.organization?.status !== 'Suspended'
    && (!member.workspace?.status || member.workspace.status === 'Active'),
  );
  return new Set(accessible.map(member => `${member.orgId}:${member.workspaceId || member.orgId}`)).size > 1;
}

export function showWorkspaceManagement(multipleWorkspacesEnabled: boolean): boolean {
  return multipleWorkspacesEnabled;
}
