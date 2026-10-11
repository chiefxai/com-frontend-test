import { describe, expect, it } from 'vitest';
import { createWorkspaceFeatureDraft, setWorkspaceFeatureDraftKeys, shouldSaveWorkspaceFeatureDraft } from '../lib/workspaceFeatureDraft';

describe('workspace-scoped feature editing', () => {
  it('keeps inherited grants unchanged when the editor is opened without edits', () => {
    const inherited = createWorkspaceFeatureDraft(null);
    expect(inherited).toEqual({ selectedKeys: [], inherited: true, changed: false });
    expect(shouldSaveWorkspaceFeatureDraft(inherited)).toBe(false);
  });

  it('distinguishes explicit deny-all from inheritance', () => {
    const denyAll = createWorkspaceFeatureDraft([]);
    expect(denyAll.inherited).toBe(false);
    expect(shouldSaveWorkspaceFeatureDraft(denyAll)).toBe(false);
    const changed = setWorkspaceFeatureDraftKeys(denyAll, ['leads']);
    expect(changed).toEqual({ selectedKeys: ['leads'], inherited: false, changed: true });
    expect(shouldSaveWorkspaceFeatureDraft(changed)).toBe(true);
    expect(denyAll.selectedKeys).toEqual([]);
  });

  it('does not mutate inherited defaults when customizing one workspace', () => {
    const inherited = createWorkspaceFeatureDraft(null);
    const custom = setWorkspaceFeatureDraftKeys(inherited, ['reports']);
    expect(inherited.inherited).toBe(true);
    expect(custom).toEqual({ selectedKeys: ['reports'], inherited: false, changed: true });
  });
});
