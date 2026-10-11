import { apiFetch } from './api';
import type { OrgDetail } from '../admin/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const COUNT_KEYS = ['leads', 'workflows', 'campaigns', 'members', 'workspaces', 'agents'] as const;

/**
 * Convert the platform organization response to a safe, displayable record.
 * Missing counts are unknown, NEVER silently treated as zero.
 * Other required lists must be arrays so an error envelope cannot masquerade
 * as an empty organization.
 */
export function parsePlatformOrgDetail(payload: unknown, requestedOrgId: string): OrgDetail {
  if (!isRecord(payload)
    || payload.id !== requestedOrgId
    || typeof payload.name !== 'string'
    || !payload.name.trim()
    || !Array.isArray(payload.members)
    || !Array.isArray(payload.recentCalls)
    || !Array.isArray(payload.recentActivity)) {
    throw new Error('Organization details response was incomplete or did not match the selected organization. Please retry.');
  }

  const counts: NonNullable<OrgDetail['counts']> = {};
  if (isRecord(payload.counts)) {
    for (const key of COUNT_KEYS) {
      const count = payload.counts[key];
      if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) {
        counts[key] = count;
      }
    }
  }

  return {
    ...(payload as unknown as OrgDetail),
    counts,
    settings: isRecord(payload.settings) ? payload.settings : {},
  };
}

/** No backend JSON error response may be stored as a platform organization. */
export async function fetchPlatformOrgDetail(orgId: string): Promise<OrgDetail> {
  const response = await apiFetch(`/api/platform/organizations/${encodeURIComponent(orgId)}`);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(body) && typeof body.error === 'string' && body.error.trim()
      ? body.error
      : `Organization details could not be loaded (HTTP ${response.status}).`;
    throw new Error(message);
  }
  return parsePlatformOrgDetail(body, orgId);
}
