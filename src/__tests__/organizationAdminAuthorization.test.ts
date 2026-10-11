import { afterEach, expect, it } from 'vitest';
import { canAccessTab, legacyAuthorization, setAuthorization, canAllocateOrganizationCredits, permissionForRequest } from '../lib/authorization';

afterEach(() => setAuthorization(null));

it.each(['Organization Admin', 'Owner'])('%s can see granted workspace modules and management tabs', role => {
  const access = legacyAuthorization(role);
  setAuthorization(access);
  expect(access.workspaceRole).toBeNull();
  expect(access.permissions).not.toContain('platform.manage');
  expect(canAccessTab('leads')).toBe(true);
  expect(canAccessTab('dialer')).toBe(true);
  expect(canAccessTab('agent-studio')).toBe(true);
  expect(canAccessTab('settings', 'team')).toBe(true);
});

it('billing-only members still cannot access workspace modules', () => {
  setAuthorization(legacyAuthorization('Billing Admin'));
  expect(canAccessTab('leads')).toBe(false);
  expect(canAccessTab('dialer')).toBe(false);
  expect(canAccessTab('settings', 'billing')).toBe(true);
});

it('reserves credit allocation for verified organization-wide admins, not workspace admins', () => {
  const sample = {
    organizationRole: 'Member', workspaceRole: 'Workspace Admin', platformAdmin: false,
    permissions: ['billing.organization.read', 'billing.credit.allocate'],
  };
  expect(canAllocateOrganizationCredits(sample)).toBe(false);
  expect(canAllocateOrganizationCredits({ ...sample, workspaceRole: 'Manager' })).toBe(false);
  expect(canAllocateOrganizationCredits({ ...sample, organizationRole: 'Billing Admin', workspaceRole: null })).toBe(false);
  expect(canAllocateOrganizationCredits({ ...sample, organizationRole: 'Organization Admin', workspaceRole: null })).toBe(true);
  expect(canAllocateOrganizationCredits({ ...sample, organizationRole: 'Owner', workspaceRole: null })).toBe(true);
  expect(canAllocateOrganizationCredits({ ...sample, organizationRole: 'Organization Admin', permissions: ['billing.read'] })).toBe(false);
  expect(canAllocateOrganizationCredits(null)).toBe(false);
});

it('requires credit allocation permission for every workspace transfer mutation', () => {
  expect(permissionForRequest('/api/billing/transfers', 'POST')).toBe('billing.credit.allocate');
  expect(permissionForRequest('/api/billing/manual-allocations/transfer', 'POST')).toBe('billing.credit.allocate');
  expect(permissionForRequest('/api/billing/allocations/preview', 'POST')).toBe('billing.credit.allocate');
  expect(permissionForRequest('/api/billing/allocations/preview', 'GET')).toBe('billing.organization.read');
});
