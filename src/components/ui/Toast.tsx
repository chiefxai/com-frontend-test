// Compatibility barrel: existing imports now use the app-wide toast context.
// Keep this file until callers have been migrated to src/shared/toast.
export { ToastProvider, useToast } from '../../shared/toast/ToastContext';
export type { ToastType } from '../../shared/toast/ToastContext';
