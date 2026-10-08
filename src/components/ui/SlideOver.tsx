import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

const WIDTH_STORAGE_KEY = 'chiefvoice-right-sidebar-width';
const DEFAULT_WIDTH = 672;
const MIN_WIDTH = 320;
const MAX_VIEWPORT_RATIO = 0.9;

function clampWidth(width: number): number {
  if (typeof window === 'undefined') return Math.max(MIN_WIDTH, width);
  const maximum = Math.max(0, Math.floor(window.innerWidth * MAX_VIEWPORT_RATIO));
  return Math.min(Math.max(0, maximum), Math.max(0, width));
}

function savedWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_WIDTH;
  try {
    const value = Number(window.localStorage.getItem(WIDTH_STORAGE_KEY));
    return Number.isFinite(value) && value >= MIN_WIDTH ? value : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Max width class — defaults to 'max-w-2xl' */
  maxWidth?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  zIndex?: string;
}

export default function SlideOver({
  open,
  onClose,
  title,
  subtitle,
  maxWidth: _maxWidth = 'max-w-2xl',
  children,
  footer,
  className = '',
  zIndex = 'z-[300]',
}: SlideOverProps) {
  const [width, setWidth] = useState(savedWidth);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const updateWidth = useCallback((next: number) => {
    const bounded = clampWidth(Math.max(MIN_WIDTH, next));
    setWidth(bounded);
    try { window.localStorage.setItem(WIDTH_STORAGE_KEY, String(bounded)); } catch { /* storage unavailable */ }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onResize = () => setWidth(current => clampWidth(current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open]);

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragRef.current = { startX: event.clientX, startWidth: width };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    updateWidth(dragRef.current.startWidth + dragRef.current.startX - event.clientX);
  };

  const stopResize = () => { dragRef.current = null; };

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 bg-black/40 flex justify-end ${zIndex}`}
      onClick={onClose}
    >
      <div
        className={`relative w-full h-full flex flex-col overflow-hidden shadow-2xl ${className}`}
        style={{ background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)', width: `min(${width}px, 90vw)`, maxWidth: '90vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Shared resize handle for all right-hand slide-over panels. */}
        <div
          role="separator"
          aria-label="Resize right sidebar"
          aria-orientation="vertical"
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={Math.max(MIN_WIDTH, Math.floor((typeof window !== 'undefined' ? window.innerWidth : 1200) * MAX_VIEWPORT_RATIO))}
          aria-valuenow={Math.round(width)}
          tabIndex={0}
          title="Drag to resize sidebar; use arrow keys to adjust"
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={stopResize}
          onPointerCancel={stopResize}
          onLostPointerCapture={stopResize}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              updateWidth(width + (event.key === 'ArrowLeft' ? 24 : -24));
            } else if (event.key === 'Home') {
              event.preventDefault();
              updateWidth(MIN_WIDTH);
            } else if (event.key === 'End') {
              event.preventDefault();
              updateWidth(window.innerWidth * MAX_VIEWPORT_RATIO);
            }
          }}
          className="absolute left-0 top-0 z-50 h-full w-2 cursor-col-resize touch-none bg-transparent hover:bg-blue-400/20 focus-visible:bg-blue-400/30 focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <div className="absolute left-0 top-1/2 h-14 w-1 -translate-y-1/2 rounded-full bg-slate-400/60" />
        </div>
        {/* Header */}
        {(title || subtitle) && (
          <div
            className="flex items-start justify-between gap-3 px-6 py-5 shrink-0 sticky top-0 z-10"
            style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}
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
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            className="shrink-0 px-6 py-4 flex items-center justify-end gap-2"
            style={{ borderTop: '1px solid var(--border)' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
