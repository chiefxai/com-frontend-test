/**
 * A single-workspace subscription should not show an unnecessary selector.
 * However, users belonging to multiple organizations must still be able to
 * switch between them, even if each organization has a single-workspace plan.
 * An entitled multi-workspace organization keeps its selector when only one
 * workspace has been provisioned so far.
 */
export interface WorkspaceNavigationMembership {
  orgId: string;
  workspaceId?: string | null;
  organization?: { status?: string | null } | null;
  workspace?: { status?: string | null } | null;
}

export function shouldShowWorkspaceSwitcher(
  multipleWorkspacesEnabled: boolean,
  memberships: readonly WorkspaceNavigationMembership[],
): boolean {
  if (multipleWorkspacesEnabled) return true;
  const accessible = memberships.filter(member =>
    member.organization?.status !== 'Suspended'
    && (!member.workspace?.status || member.workspace.status === 'Active'),
  );
  return new Set(accessible.map(member => `${member.orgId}:${member.workspaceId || member.orgId}`)).size > 1;
}

export function showWorkspaceManagement(multipleWorkspacesEnabled: boolean): boolean {
  return multipleWorkspacesEnabled;
}
