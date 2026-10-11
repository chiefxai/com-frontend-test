/** The selected workspace must come from the authenticated membership list. */
export interface WorkspaceMembershipLike {
  orgId: string;
  workspaceId?: string | null;
  organization?: { status?: string | null };
  workspace?: { status?: string | null };
}

export function workspaceIdentifier(row: WorkspaceMembershipLike): string {
  return row.workspaceId || row.orgId;
}

export function selectAuthorizedWorkspace<T extends WorkspaceMembershipLike>(
  rows: T[],
  preferredWorkspaceId: string | null | undefined,
): T | null {
  const active = rows.filter(row =>
    row.organization?.status !== 'Suspended'
    && (!row.workspace?.status || row.workspace.status === 'Active'),
  );
  return active.find(row => workspaceIdentifier(row) === preferredWorkspaceId)
    || active[0] || null;
}

export interface WorkspaceIdentityLike {
  org?: { id?: string | null } | null;
  workspace?: { id?: string | null } | null;
}

/** Organization-wide fallback membership may omit workspace only when selected ID is the org ID. */
export function identityMatchesSelectedWorkspace(
  identity: WorkspaceIdentityLike,
  selected: WorkspaceMembershipLike,
): boolean {
  const workspaceId = workspaceIdentifier(selected);
  return identity.org?.id === selected.orgId
    && (!identity.workspace?.id || identity.workspace.id === workspaceId)
    && (workspaceId === selected.orgId || Boolean(identity.workspace?.id));
}
