import { apiFetch } from './api';
import { getAuthorization, setAuthorization, type Authorization } from './authorization';
import { identityMatchesSelectedWorkspace, type WorkspaceMembershipLike } from './workspaceSelection';

export function profileRole(access: Authorization | null, fallback: string): string {
  if (!access) return fallback;
  if (access.platformAdmin) return 'Platform Admin';
  if (['Owner', 'Organization Admin', 'Billing Admin'].includes(access.organizationRole)) {
    return access.organizationRole;
  }
  return access.workspaceRole || 'No workspace access';
}

/** Refresh from the canonical session without applying a response from an older session. */
export async function refreshProfileAuthorization(selected: WorkspaceMembershipLike): Promise<void> {
  const previous = getAuthorization();
  try {
    const response = await apiFetch('/api/auth/me');
    if (!response.ok) return;
    const session = await response.json();
    if (getAuthorization() !== previous || !identityMatchesSelectedWorkspace(session, selected)) return;
    if (Array.isArray(session.authorization?.permissions)) setAuthorization(session.authorization);
  } catch {
    // Retain the last verified role when the session endpoint is unavailable.
  }
}
