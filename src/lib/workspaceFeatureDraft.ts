/** A workspace override is independent from organization-level default grants. */
export interface WorkspaceFeatureDraft {
  selectedKeys: string[];
  inherited: boolean;
  changed: boolean;
}

/** Keep inherited (null) distinct from an explicit deny-all override ([]). */
export function createWorkspaceFeatureDraft(override: string[] | null | undefined): WorkspaceFeatureDraft {
  return {
    selectedKeys: Array.isArray(override) ? [...override] : [],
    inherited: override == null,
    changed: false,
  };
}

/** Explicitly opt in to creating/replacing an override for one workspace. */
export function setWorkspaceFeatureDraftKeys(draft: WorkspaceFeatureDraft, selectedKeys: string[]): WorkspaceFeatureDraft {
  return { ...draft, selectedKeys: [...selectedKeys], inherited: false, changed: true };
}

/** Viewing an inherited or custom grant is not a write operation. */
export function shouldSaveWorkspaceFeatureDraft(draft: WorkspaceFeatureDraft | null): boolean {
  return draft?.changed === true;
}
