import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_STYLE: Record<ToastType, { icon: React.ElementType; iconColor: string; accent: string }> = {
  success: { icon: CheckCircle2, iconColor: '#059669', accent: '#059669' },
  error:   { icon: AlertTriangle, iconColor: '#e11d48', accent: '#e11d48' },
  info:    { icon: Info,          iconColor: '#2563eb', accent: '#2563eb' },
  warning: { icon: AlertTriangle, iconColor: '#d97706', accent: '#d97706' },
};

const AUTO_DISMISS_MS = 6000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = AUTO_DISMISS_MS) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => dismiss(id), Math.max(0, duration));
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none">
        {toasts.map((t) => {
          const { icon: Icon, iconColor, accent } = TOAST_STYLE[t.type];
          return (
            <div
              key={t.id}
              role="alert"
              className="pointer-events-auto flex items-start gap-2.5 rounded-xl border shadow-lg px-4 py-3 text-sm"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)', borderLeft: `3px solid ${accent}` }}
            >
              <Icon className="h-4 w-4 shrink-0 mt-0.5" style={{ color: iconColor }} />
              <p className="flex-1 leading-snug" style={{ color: 'var(--text-primary)' }}>{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 h-5 w-5 flex items-center justify-center rounded hover:bg-[var(--bg-subtle)] transition-colors"
                style={{ color: 'var(--text-muted)' }}
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
