import React, { createContext, useContext, useState } from 'react';

export interface PageHeaderConfig {
  title: React.ReactNode;
  subtitle?: string;
  /** Extra controls rendered right AFTER the title, before the refresh
   * icon (e.g. a workflow switcher dropdown) — still in the left-hand
   * title group, not clipped by the title's own truncate styling the way
   * embedding it inside `title` itself would be. */
  titleSuffix?: React.ReactNode;
  /** Extra controls rendered right after the title/refresh icon, still in
   * the left-hand title group — for per-page icon actions that should read
   * as "belonging to this page" (e.g. Copy/Save) rather than sitting in
   * the right-aligned `action` slot. */
  titleActions?: React.ReactNode;
  action?: React.ReactNode;
  toolbar?: React.ReactNode;
  /** Reloads just this page's own data. Falls back to the app-wide refresh when omitted. */
  onRefresh?: () => void;
}

interface PageHeaderContextValue {
  header: PageHeaderConfig | null;
  setHeader: React.Dispatch<React.SetStateAction<PageHeaderConfig | null>>;
}

const PageHeaderContext = createContext<PageHeaderContextValue | null>(null);

// Holds the current page's header content (title/subtitle/action/toolbar) so
// it can be rendered by a single, permanently-mounted header bar in App.tsx
// instead of by each view's own PageShell instance. Views are swapped via a
// switch statement that unmounts the old view and mounts the new one, so a
// header rendered *inside* PageShell was being torn down and rebuilt on every
// tab change; publishing it into this shared slot means only its content
// updates, not the DOM node itself.
export function PageHeaderProvider({ children }: { children: React.ReactNode }) {
  const [header, setHeader] = useState<PageHeaderConfig | null>(null);
  // Memoized so consumers only see a new context value when `header` itself
  // actually changes — `setHeader` is already stable from useState. Without
  // this, every render created a brand-new { header, setHeader } object,
  // which fed straight into an infinite loop with PageShell's effect (see
  // that file's comment): its effect depended on this whole object, so a
  // fresh reference every render re-triggered setHeader() every render,
  // which re-rendered this provider, which created another fresh object...
  const value = React.useMemo(() => ({ header, setHeader }), [header]);
  return (
    <PageHeaderContext.Provider value={value}>
      {children}
    </PageHeaderContext.Provider>
  );
}

/** Returns null when rendered outside a PageHeaderProvider (e.g. in tests). */
export function usePageHeaderContext() {
  return useContext(PageHeaderContext);
}
