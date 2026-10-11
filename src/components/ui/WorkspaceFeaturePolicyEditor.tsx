import React, { useState } from 'react';
import Button from './Button';
import FeatureAccessSelector from './FeatureAccessSelector';

interface WorkspaceFeaturePolicyEditorProps {
  workspaceName: string;
  availableKeys: string[];
  enabledKeys: string[];
  canEdit: boolean;
  loading: boolean;
  saving: boolean;
  error: string;
  onSave: (keys: string[]) => Promise<boolean>;
}

/** Workspace feature ceilings are separate from each member's custom grants. */
export default function WorkspaceFeaturePolicyEditor({
  workspaceName, availableKeys, enabledKeys, canEdit, loading, saving, error, onSave,
}: WorkspaceFeaturePolicyEditorProps) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const save = async () => {
    if (saving || loading) return;
    if (await onSave(selected)) setEditing(false);
  };

  return (
    <div className="space-y-2 border-t border-[var(--border)] pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-[var(--text-secondary)]">
          Workspace feature policy · {loading ? 'Loading…' : `${enabledKeys.length} allowed`}
        </p>
        {canEdit && !loading && (
          <Button type="button" size="sm" variant="secondary" disabled={saving}
            onClick={() => {
              setSelected(enabledKeys);
              setEditing(current => !current);
            }}>
            {editing ? 'Cancel policy edit' : 'Configure workspace features'}
          </Button>
        )}
      </div>
      {editing && (
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]/40 p-3">
          <FeatureAccessSelector
            label={`Allowed features in ${workspaceName}`}
            description="This policy limits feature access for everyone in this workspace. Configure each person's permissions separately."
            availableKeys={availableKeys}
            value={selected}
            onChange={setSelected}
            disabled={saving}
          />
          {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
          <div className="flex justify-end">
            <Button type="button" size="sm" variant="primary" loading={saving} onClick={() => void save()}>
              Save workspace policy
            </Button>
          </div>
        </div>
      )}
      {!loading && enabledKeys.length === 0 && (
        <p role="status" className="text-xs leading-5 text-amber-700 dark:text-amber-300">
          {availableKeys.length === 0
            ? 'The organization has no enabled features. Ask the platform administrator to enable them.'
            : canEdit
              ? 'No features are enabled in this workspace. Configure workspace features above before assigning them to staff.'
              : 'No features are enabled in this workspace. Ask an organization administrator to configure them.'}
        </p>
      )}
    </div>
  );
}
