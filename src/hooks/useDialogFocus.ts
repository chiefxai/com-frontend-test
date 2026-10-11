import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusable(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(element =>
    !element.closest('[hidden], [aria-hidden="true"]')
    && window.getComputedStyle(element).visibility !== 'hidden'
    && window.getComputedStyle(element).display !== 'none',
  );
}

/** Shared accessible focus and keyboard behavior for modal dialogs and slide-overs. */
export function useDialogFocus(open: boolean, panelRef: RefObject<HTMLElement | null>, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Place focus on a predictable dismissal control instead of a resize handle.
    (panel.querySelector<HTMLElement>('[aria-label="Close dialog"], [aria-label="Close panel"]')
      || getFocusable(panel)[0] || panel).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll<HTMLElement>('[data-chief-dialog]');
      if (dialogs[dialogs.length - 1] !== panel) return;
      if (event.key === 'Escape') {
        if (event.defaultPrevented) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      // Permission pickers use a non-modal portal above the parent dialog.
      const active = document.activeElement;
      const popover = document.querySelector('[role="dialog"][aria-modal="false"]');
      if (popover && active instanceof Node && popover.contains(active)) return;

      const items = getFocusable(panel);
      if (!items.length) { event.preventDefault(); panel.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open, panelRef]);
}
