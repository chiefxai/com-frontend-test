/** Role shown in Staff & Teams for the workspace in focus.
 * Organization roles are deliberately excluded: they are not interchangeable
 * with a person's workspace assignment.
 */
/** Organization-level roles are not workspace roles. */
export function organizationScopedRole(role: string | undefined | null): 'Owner' | 'Organization Admin' | null {
  if (role === 'Owner') return 'Owner';
  if (role === 'Organization Admin' || role === 'Super Admin') return 'Organization Admin';
  return null;
}

export interface StaffWorkspaceAssignment {
  memberId: string;
  workspaceRole: string | null;
  assignmentStatus: string | null;
  memberStatus?: string | null;
}

export function getStaffWorkspaceRole(
  memberId: string,
  workspaceId: string,
  assignmentsByWorkspace: Record<string, StaffWorkspaceAssignment[]>,
  activeWorkspaceId: string,
  currentWorkspaceMembers: StaffWorkspaceAssignment[] = [],
  useCurrentWorkspaceMembers = false,
  organizationRole?: string | null,
): string {
  const organizationRoleLabel = organizationScopedRole(organizationRole);
  if (organizationRoleLabel) return organizationRoleLabel;
  const assignments = useCurrentWorkspaceMembers && workspaceId === activeWorkspaceId
    ? currentWorkspaceMembers
    : assignmentsByWorkspace[workspaceId] || [];
  const assignment = assignments.find(row => row.memberId === memberId);
  if (!assignment || assignment.assignmentStatus?.toLowerCase() !== 'active'
    || assignment.memberStatus?.toLowerCase() === 'inactive') return 'No access';
  return assignment.workspaceRole?.trim() || 'No access';
}
