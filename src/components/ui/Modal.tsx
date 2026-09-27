import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Max width class — defaults to 'max-w-lg' */
  maxWidth?: string;
  children: React.ReactNode;
  /** Footer actions rendered in a sticky footer bar */
  footer?: React.ReactNode;
  /** Extra classes on the panel */
  className?: string;
  /** z-index override — defaults to z-[300] */
  zIndex?: string;
}

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  maxWidth = 'max-w-lg',
  children,
  footer,
  className = '',
  zIndex = 'z-[300]',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 bg-black/40 flex items-center justify-center p-4 ${zIndex}`}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className={`relative w-full ${maxWidth} max-h-[90vh] flex flex-col rounded-[18px] shadow-2xl overflow-hidden ${className}`}
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {(title || subtitle) && (
          <div
            className="flex items-start justify-between gap-3 px-5 py-4 shrink-0"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div className="min-w-0">
              {title && (
                <h3 className="text-sm font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {subtitle}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-subtle)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            className="shrink-0 px-5 py-3 flex items-center justify-end gap-2"
            style={{ borderTop: '1px solid var(--border)' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
