import { afterEach, expect, it } from 'vitest';
import { canAccessTab, legacyAuthorization, setAuthorization } from '../lib/authorization';

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
