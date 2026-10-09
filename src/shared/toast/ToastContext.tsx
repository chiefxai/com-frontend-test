import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { Toaster, toast } from 'sonner';
import { useTheme } from '../theme/ThemeContext';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const DEFAULT_DURATION_MS = 6000;

/**
 * Sonner is mounted once above both organization and platform admin routing.
 * Keep the existing useToast API working for feature screens while delegating
 * stacking, accessible announcements, dismissals and timing to Sonner.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { resolved } = useTheme();

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = DEFAULT_DURATION_MS) => {
    toast[type](message, { duration: Math.max(0, duration) });
  }, []);
  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster
        position="top-right"
        theme={resolved}
        richColors
        closeButton
        expand={false}
        visibleToasts={5}
        toastOptions={{ duration: DEFAULT_DURATION_MS }}
      />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
