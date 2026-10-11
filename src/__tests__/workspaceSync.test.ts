import { beforeEach, describe, expect, it, vi } from 'vitest';
import { postWorkspaceSync } from '../hooks/useDebouncedSync';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../lib/api', () => ({ apiFetch: mocks.apiFetch }));

describe('retryable workspace synchronization', () => {
  beforeEach(() => mocks.apiFetch.mockReset());
  it('posts the latest document and only succeeds on a confirmed HTTP success', async () => {
    mocks.apiFetch.mockResolvedValue({ ok: true });
    await postWorkspaceSync('/api/workflows/sync', [{ id: 'flow-1' }]);
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/workflows/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ id: 'flow-1' }]),
    });
  });
  it('rejects 4xx and 5xx HTTP responses instead of reporting a saved change', async () => {
    mocks.apiFetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: 'Write temporarily unavailable' }) });
    await expect(postWorkspaceSync('/api/workflows/sync', [])).rejects.toThrow('Write temporarily unavailable');
  });
  it('handles unexpected non-JSON failed responses', async () => {
    mocks.apiFetch.mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error('Invalid JSON'); } });
    await expect(postWorkspaceSync('/api/workflows/sync', [])).rejects.toThrow('Save failed (500)');
  });
});
