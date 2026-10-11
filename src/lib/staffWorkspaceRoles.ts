/** Role shown in Staff & Teams for the workspace in focus.
 * Organization roles are deliberately excluded: they are not interchangeable
 * with a person's workspace assignment.
 */
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
): string {
  const assignments = useCurrentWorkspaceMembers && workspaceId === activeWorkspaceId
    ? currentWorkspaceMembers
    : assignmentsByWorkspace[workspaceId] || [];
  const assignment = assignments.find(row => row.memberId === memberId);
  if (!assignment || assignment.assignmentStatus?.toLowerCase() !== 'active'
    || assignment.memberStatus?.toLowerCase() === 'inactive') return 'No access';
  return assignment.workspaceRole?.trim() || 'No access';
}
