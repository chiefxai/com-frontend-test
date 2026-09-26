import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface CommonDropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: 'left' | 'right' | 'center' | 'auto';
  side?: 'top' | 'bottom' | 'auto';
  offset?: number;
  width?: string;
  maxHeight?: string;
  className?: string;
  contentClassName?: string;
  closeOnSelect?: boolean;
  closeOnOutsideClick?: boolean;
  disabled?: boolean;
}

export default function CommonDropdown({
  trigger, children, open: controlledOpen, onOpenChange, align = 'auto',
  side = 'auto', offset = 8, width = 'auto', maxHeight = 'min(70vh, 480px)',
  className = '', contentClassName = '', closeOnSelect = false,
  closeOnOutsideClick = true, disabled = false,
}: CommonDropdownProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (value: boolean) => { setInternalOpen(value); onOpenChange?.(value); };

  useLayoutEffect(() => {
    if (!open || !rootRef.current || !panelRef.current) return;
    const update = () => {
      const trigger = rootRef.current!.getBoundingClientRect();
      const panel = panelRef.current!.getBoundingClientRect();
      const margin = 8;
      const topSpace = trigger.top - margin;
      const bottomSpace = window.innerHeight - trigger.bottom - margin;
      const placeTop = side === 'top' || (side === 'auto' && bottomSpace < panel.height + offset && topSpace > bottomSpace);
      let top = placeTop ? trigger.top - panel.height - offset : trigger.bottom + offset;
      let left = align === 'center'
        ? trigger.left + (trigger.width - panel.width) / 2
        : align === 'left'
          ? trigger.left
          : align === 'right'
            ? trigger.right - panel.width
            : window.innerWidth - trigger.right >= panel.width + margin
              ? trigger.left
              : trigger.right - panel.width;
      left = Math.max(margin, Math.min(left, window.innerWidth - panel.width - margin));
      top = Math.max(margin, Math.min(top, window.innerHeight - panel.height - margin));
      setStyle({ position: 'fixed', top, left, width: width === 'auto' ? undefined : width, maxHeight });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [open, align, side, offset, width, maxHeight]);

  useEffect(() => {
    if (!open || !closeOnOutsideClick) return;
    const close = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close); };
  }, [open, closeOnOutsideClick]);

  useEffect(() => {
    if (!open || !closeOnSelect || !panelRef.current) return;
    const close = () => setOpen(false);
    panelRef.current.addEventListener('click', close);
    return () => panelRef.current?.removeEventListener('click', close);
  }, [open, closeOnSelect]);

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`}>
      <button type="button" disabled={disabled} aria-haspopup="menu" aria-expanded={open}
        onClick={() => !disabled && setOpen(!open)} className="inline-flex">
        {trigger}
      </button>
      {open && (
        <div ref={panelRef} role="menu"
          className={`z-[100] overflow-auto rounded-xl border shadow-xl ${contentClassName}`}
          style={{ ...style, background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          {children}
        </div>
      )}
    </div>
  );
}
