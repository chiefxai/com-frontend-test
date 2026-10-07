// Operational caches are partitioned by validated identity and workspace.
// Never restore the legacy shared cache before membership validation.
let cacheScope: string | null = null;
export function setStorageScope(userId: string | null, workspaceId: string | null): void {
  cacheScope = userId && workspaceId
    ? `${encodeURIComponent(userId)}:${encodeURIComponent(workspaceId)}` : null;
}
function storageKey(key: string): string | null {
  if (key === 'chiefx_theme_mode') return key;
  return cacheScope ? `chiefx_scoped:${cacheScope}:${key}` : null;
}
export const loadFromStorage = <T>(key: string, defaultValue: T): T => {
  try {
    const scoped = storageKey(key);
    const item = scoped ? localStorage.getItem(scoped) : null;
    return item ? JSON.parse(item) : defaultValue;
  } catch { return defaultValue; }
};
export const saveToStorage = <T>(key: string, value: T): void => {
  try {
    const scoped = storageKey(key);
    if (scoped) localStorage.setItem(scoped, JSON.stringify(value));
  } catch { /* Storage is optional; backend remains authoritative. */ }
};
