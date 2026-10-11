import { beforeEach, describe, expect, it } from 'vitest';
import { clearScopedStorageForUser, loadFromStorage, saveToStorage, setStorageScope } from '../lib/storage';

describe('per-user workspace cache privacy', () => {
  beforeEach(() => { localStorage.clear(); setStorageScope(null, null); });
  it('removes cached CRM data from all workspaces belonging to the signed-out user', () => {
    setStorageScope('alice', 'org1:workspace1');
    saveToStorage('chiefx_leads', [{ id: 'private-lead' }]);
    setStorageScope('alice', 'org1:workspace2');
    saveToStorage('chiefx_calllogs', [{ id: 'private-call' }]);
    setStorageScope('bob', 'org2:workspace1');
    saveToStorage('chiefx_leads', [{ id: 'bob-lead' }]);
    saveToStorage('chiefx_theme_mode', 'dark');

    clearScopedStorageForUser('alice');
    setStorageScope('alice', 'org1:workspace1');
    expect(loadFromStorage('chiefx_leads', [])).toEqual([]);
    setStorageScope('alice', 'org1:workspace2');
    expect(loadFromStorage('chiefx_calllogs', [])).toEqual([]);
    setStorageScope('bob', 'org2:workspace1');
    expect(loadFromStorage('chiefx_leads', [])).toEqual([{ id: 'bob-lead' }]);
    expect(loadFromStorage('chiefx_theme_mode', 'system')).toBe('dark');
  });
  it('tolerates an unknown identity without deleting other users\u0027 data', () => {
    setStorageScope('user-x', 'workspace-a');
    saveToStorage('chiefx_leads', [1]);
    clearScopedStorageForUser(null);
    expect(loadFromStorage('chiefx_leads', [])).toEqual([1]);
  });
});
