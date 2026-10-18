import { useSyncExternalStore } from 'react';
export interface Authorization {
  organizationRole: string;
  workspaceRole: string | null;
  platformAdmin: boolean;
  permissions: string[];
}
let current: Authorization | null = null;
const listeners = new Set<() => void>();
export function setAuthorization(value: Authorization | null) {
  current = value && Array.isArray(value.permissions) ? value : null;
  listeners.forEach(listener => listener());
}
export function getAuthorization() { return current; }
/** Organization-owned credits require both the verified credit-allocation grant
 * and an organization-wide administrator role. Workspace Admin is distinct.
 */
export function canAllocateOrganizationCredits(access: Authorization | null): boolean {
  return Boolean(access
    && ['Owner', 'Organization Admin'].includes(access.organizationRole)
    && access.permissions.includes('billing.credit.allocate'));
}
export function can(permission: string) { return current?.permissions.includes(permission) === true; }
export function useAuthorization() {
  const access = useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },getAuthorization);
  return { authorization: access, can: (permission: string) => access?.permissions.includes(permission) === true };
}
// Only initial-workspace rollout compatibility uses legacy roles. Server
// permissions become authoritative as soon as the VM has been upgraded.
export function legacyAuthorization(role: string): Authorization {
  const orgAdmin = ['Organization Admin','Owner','Super Admin'].includes(role);
  const workspaceAdmin = role === 'Workspace Admin';
  const viewer = ['Viewer','Customer'].includes(role);
  const billingOnly = role === 'Billing Admin';
  const manager = role === 'Manager' || role === 'Sales Manager';
  return { organizationRole: role,workspaceRole: orgAdmin || billingOnly ? null : workspaceAdmin ? 'Workspace Admin' : manager ? 'Manager' : viewer ? 'Viewer' : 'Member',platformAdmin: false,
    permissions: ['notifications.read',
      ...(!billingOnly ? ['workspace.read'] : []),
      ...(!viewer && !billingOnly ? ['workspace.write','workspace.call'] : []),
      ...(!billingOnly && (orgAdmin || workspaceAdmin || manager) ? ['workspace.members.manage'] : []),
      ...(!viewer && !billingOnly ? ['workspace.share.propose'] : []),
      ...(!viewer && !billingOnly ? ['workspace.share.copy'] : []),
      ...(orgAdmin || workspaceAdmin ? ['workspace.delete','workspace.settings.manage','workspace.members.manage','workspace.audit.read'] : []),
      ...(['Organization Admin','Owner','Super Admin'].includes(role) ? ['organization.read','organization.manage','organization.members.read','organization.members.manage','billing.read','billing.organization.read','billing.payment.submit','billing.contacts.manage','billing.notifications.manage','billing.credit.allocate','billing.allocation_rules.manage','billing.postpaid.manage'] : []),
      ...(billingOnly ? ['organization.read','billing.read','billing.organization.read','billing.payment.submit'] : []),
    ] };
}
export function permissionForRequest(path: string,method: string): string | null {
  const read = ['GET','HEAD','OPTIONS'].includes(method);
  path = path.toLowerCase().replace(/\/+$/,'');
  if (path === '/api/settings/team' && method === 'POST') return null; // Backend allows organization or scoped workspace member managers.
  if (/^\/api\/settings\/team\/[^/]+$/.test(path) && method === 'DELETE') return null; // Backend checks creator and workspace hierarchy.
  if (['/api/auth/me','/api/auth/roles','/api/settings/me'].includes(path)) return null;
  if (path === '/api/settings/workspace-policy') return 'organization.read';
  if (path === '/api/settings/workspaces') return read ? 'organization.read' : 'organization.manage';
  if (path === '/api/settings/organization/workspace-features') return 'organization.read';
  if (/^\/api\/settings\/organization\/workspace-features\//.test(path)) return 'organization.manage';
  if (/^\/api\/settings\/organization\/workspace-access(?:\/|$)/.test(path)) return read ? 'organization.members.read' : 'organization.members.manage';
  if (path === '/api/settings/organization/numbers') return 'organization.read';
  if (path === '/api/workspace-sharing/proposals' || /^\/api\/workspace-sharing\/proposals\/[^/]+\/review$/.test(path)) return 'workspace.settings.manage';
  if (/^\/api\/workspace-sharing\/records\/[^/]+\/proposals$/.test(path)) return 'workspace.share.propose';
  if (/^\/api\/workspace-sharing\/records\/[^/]+\/copies$/.test(path)) return 'workspace.share.copy';
  if (/^\/api\/workspace-sharing\/records(?:\/|$)/.test(path)) return 'workspace.read';
  if (/^\/api\/workspace-sharing\/grants(?:\/|$)/.test(path)) return read ? 'workspace.read' : 'workspace.settings.manage';
  // Platform notification mutations are protected by the platform-admin router.
  if (/^\/api\/platform\/notifications(?:\/|$)/.test(path)) return 'platform.manage';
  if (/^\/api\/notifications(?:\/|$)/.test(path)) {
    // These operations only change the signed-in user's own notification state.
    // Let the backend authenticate and scope them instead of blocking on stale
    // client authorization cached from before notifications.read was granted.
    if (!read && ['/api/notifications/read','/api/notifications/clear','/api/notifications/preferences'].includes(path)) return null;
    return 'notifications.read';
  }
  if (/^\/api\/billing\/workspaces\/[^/]+\/(?:overview|usage|ledger)$/.test(path) && read) return 'billing.workspace.read';
  if (path === '/api/billing/topup-quotes' && !read) return 'billing.payment.submit';
  if (/^\/api\/billing\/workspace-addons(?:\/|$)/.test(path) && !read) return 'billing.payment.submit';
  if (path === '/api/billing/workspace-addons' && read) return 'billing.organization.read';
  if (/^\/api\/billing\/payments(?:\/|$)/.test(path) && !read) return 'billing.payment.submit';
  if (/^\/api\/billing\/contacts(?:\/|$)/.test(path) && !read) return 'billing.contacts.manage';
  if (path === '/api/billing/notification-policy' && !read) return 'billing.notifications.manage';
  if (/^\/api\/billing\/manual-allocations(?:\/|$)/.test(path))
    return read ? 'billing.organization.read' : 'billing.credit.allocate';
  if (/^\/api\/billing\/allocation-rules(?:\/|$)/.test(path) && !read) return 'billing.allocation_rules.manage';
  if (/^\/api\/billing\/(?:allocations|transfers)(?:\/|$)/.test(path) && !read) return 'billing.credit.allocate';
  if (/^\/api\/billing\/postpaid-policy(?:\/|$)/.test(path) && !read) return 'billing.postpaid.manage';
  if (/^\/api\/billing\/(?:overview|subscription|payments|invoices|contacts|notification-policy|allocations|transfers|allocation-rules)(?:\/|$)/.test(path)) return 'billing.organization.read';
  if (/^\/api\/(billing|ai-usage)(?:\/|$)/.test(path)) return 'billing.read';
  if (/^\/api\/settings\/workspace\/members(?:\/|$)/.test(path)) return 'workspace.members.manage';
  if (/^\/api\/settings\/team(?:\/|$)/.test(path)) return read ? 'organization.members.read' : 'organization.members.manage';
  if (path === '/api/settings/org') return read ? 'organization.read' : 'organization.manage';
  if (path === '/api/logs-stream/ticket') return 'workspace.read';
  if (path === '/api/voice-session/ticket' || /^\/api\/(vobiz|twilio|telecmi|piopiy)\/(call|hangup)$/.test(path) || ['/api/simulate-call','/api/gemini/simulate-call','/api/config/preview'].includes(path)) return 'workspace.call';
  if (!read && (/^\/api\/(config|agents|channels|knowledge)(?:\/|$)/.test(path) || /^\/api\/settings\/(workspace|numbers|vobiz-inbound-webhook)(?:\/|$)/.test(path))) return 'workspace.settings.manage';
  return method === 'DELETE' ? 'workspace.delete' : read ? 'workspace.read' : 'workspace.write';
}
export function canAccessTab(tab: string,subTab?: string) {
  if (tab === 'notification-settings') return can('notifications.read') || can('workspace.read');
  if (tab === 'settings') {
    if (!subTab) return can('workspace.settings.manage') || can('organization.members.read') || can('workspace.members.manage') || can('billing.read');
    if (subTab === 'workspaces' || subTab === 'numbers' || subTab === 'sharing') return can('organization.read') || can('organization.manage') || can('workspace.settings.manage');
    return (subTab === 'billing' ? can('billing.read') || can('billing.organization.read') || can('billing.workspace.read') : can(subTab === 'team' ? 'organization.members.read' : 'workspace.settings.manage'))
      || (subTab === 'team' && can('workspace.members.manage'));
  }
  if (tab === 'company' || tab === 'agent-studio') return can('workspace.settings.manage');
  if (tab === 'audit-log') return can('workspace.audit.read');
  if (tab === 'dialer') return can('workspace.call');
  return can('workspace.read');
}
