import { apiFetch } from './api';

async function requireSuccessfulResponse(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  const body = await response.json().catch(() => ({}));
  throw new Error(typeof body?.error === 'string' && body.error ? body.error : fallback);
}

export async function deleteStaffMember(memberId: string): Promise<void> {
  const response = await apiFetch('/api/settings/team/' + encodeURIComponent(memberId), { method: 'DELETE' });
  await requireSuccessfulResponse(response, 'Failed to remove staff member.');
}

export async function updateStaffMemberStatus(memberId: string, status: 'Active' | 'Inactive'): Promise<void> {
  const response = await apiFetch('/api/settings/team/' + encodeURIComponent(memberId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  await requireSuccessfulResponse(response, 'Failed to change staff member status.');
}
