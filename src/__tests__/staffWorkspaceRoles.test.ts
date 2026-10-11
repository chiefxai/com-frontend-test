import { describe, expect, it } from 'vitest';
import { getStaffWorkspaceRole, organizationScopedRole, workspaceRoleOptions, canAssignWorkspaceRole } from '../lib/staffWorkspaceRoles';

const byWorkspace = {
  'north': [
    { memberId: 'staff-1', workspaceRole: 'Manager', assignmentStatus: 'Active', memberStatus: 'Active' },
    { memberId: 'staff-2', workspaceRole: 'Viewer', assignmentStatus: 'Active', memberStatus: 'Active' },
  ],
  'south': [
    { memberId: 'staff-1', workspaceRole: 'Viewer', assignmentStatus: 'Active', memberStatus: 'Active' },
    { memberId: 'staff-2', workspaceRole: 'Member', assignmentStatus: 'Inactive', memberStatus: 'Active' },
  ],
};

describe('Staff & Teams workspace Role column', () => {
  it('changes the role for the same person when the current workspace changes', () => {
    expect(getStaffWorkspaceRole('staff-1', 'north', byWorkspace, 'north')).toBe('Manager');
    expect(getStaffWorkspaceRole('staff-1', 'south', byWorkspace, 'south')).toBe('Viewer');
  });

  it('shows no access for an unassigned or inactive workspace membership', () => {
    expect(getStaffWorkspaceRole('staff-2', 'south', byWorkspace, 'south')).toBe('No access');
    expect(getStaffWorkspaceRole('staff-3', 'north', byWorkspace, 'north')).toBe('No access');
  });

  it('uses current workspace members for users without organization-wide member permissions', () => {
    const current = [{ memberId: 'staff-1', workspaceRole: 'Workspace Admin', assignmentStatus: 'Active', memberStatus: 'Active' }];
    expect(getStaffWorkspaceRole('staff-1', 'south', byWorkspace, 'south', current, true)).toBe('Workspace Admin');
    expect(getStaffWorkspaceRole('staff-1', 'north', byWorkspace, 'south', current, true)).toBe('Manager');
  });

  it('does not grant roles to inactive staff or use an organization role as a fallback', () => {
    const inactive = { north: [{ memberId: 'staff-1', workspaceRole: 'Workspace Admin', assignmentStatus: 'Active', memberStatus: 'Inactive' }] };
    expect(getStaffWorkspaceRole('staff-1', 'north', inactive, 'north')).toBe('No access');
    expect(getStaffWorkspaceRole('staff-3', 'north', {}, 'north')).toBe('No access');
  });

  it('keeps Organization Admin above workspace-role assignments in every workspace', () => {
    for (const workspaceId of ['north', 'south', 'new-workspace']) {
      expect(getStaffWorkspaceRole('staff-1', workspaceId, byWorkspace, workspaceId, [], false, 'Organization Admin'))
        .toBe('Organization Admin');
      expect(getStaffWorkspaceRole('staff-1', workspaceId, byWorkspace, workspaceId, [], false, 'Super Admin'))
        .toBe('Organization Admin');
    }
  });

  it('shows Owner as organization-wide and preserves Workspace Admin for ordinary members', () => {
    expect(getStaffWorkspaceRole('staff-1', 'north', byWorkspace, 'north', [], false, 'Owner')).toBe('Owner');
    expect(getStaffWorkspaceRole('staff-1', 'north',
      { north: [{ memberId: 'staff-1', workspaceRole: 'Workspace Admin', assignmentStatus: 'Active' }] },
      'north', [], false, 'Member')).toBe('Workspace Admin');
    expect(organizationScopedRole('Manager')).toBeNull();
    expect(organizationScopedRole('Organization Admin')).toBe('Organization Admin');
  });
});

describe('workspace role editor restrictions', () => {
  it('never offers elevated roles to a workspace manager', () => {
    expect(workspaceRoleOptions(true)).toEqual(['Member', 'Viewer']);
    expect(canAssignWorkspaceRole(true, 'Workspace Admin')).toBe(false);
    expect(canAssignWorkspaceRole(true, 'Manager')).toBe(false);
    expect(canAssignWorkspaceRole(true, 'Member')).toBe(true);
    expect(canAssignWorkspaceRole(true, 'Viewer')).toBe(true);
  });

  it('allows workspace admins to manage workspace role assignments', () => {
    expect(workspaceRoleOptions(false)).toEqual(['Workspace Admin', 'Manager', 'Member', 'Viewer']);
    expect(canAssignWorkspaceRole(false, 'Workspace Admin')).toBe(true);
  });
});
