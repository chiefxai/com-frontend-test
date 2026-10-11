import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteStaffMember, updateStaffMemberStatus } from '../lib/staffMemberMutations';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../lib/api', () => ({ apiFetch: mocks.apiFetch }));

describe('staff mutations require server success', () => {
  beforeEach(() => mocks.apiFetch.mockReset());
  it('deletes only after a successful response and encodes IDs', async () => {
    mocks.apiFetch.mockResolvedValue({ ok: true });
    await expect(deleteStaffMember('user/123')).resolves.toBeUndefined();
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/settings/team/user%2F123', { method: 'DELETE' });
  });
  it('rejects HTTP errors instead of silently treating them as successful', async () => {
    mocks.apiFetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'Forbidden' }) });
    await expect(deleteStaffMember('123')).rejects.toThrow('Forbidden');
  });
  it('rejects denied status updates and sends the expected patch', async () => {
    mocks.apiFetch.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Denied' }) });
    await expect(updateStaffMemberStatus('u1', 'Inactive')).resolves.toBeUndefined();
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/settings/team/u1', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'Inactive' }),
    });
    await expect(updateStaffMemberStatus('u1', 'Active')).rejects.toThrow('Denied');
  });
  it('surfaces network failures', async () => {
    mocks.apiFetch.mockImplementationOnce(async () => { throw new Error('Offline'); });
    let message = '';
    try {
      await deleteStaffMember('u1');
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    expect(message).toBe('Offline');
  });
});
