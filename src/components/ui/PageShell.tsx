import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useRefresh } from '../../lib/RefreshContext';
import { usePageHeaderContext } from '../../lib/PageHeaderContext';
import { useIsActiveTab } from '../../lib/ActiveTabContext';
import Tooltip from './Tooltip';

// ── Grid helpers ──────────────────────────────────────────────────────────────

/** Tailwind col-span class map for 1–12 columns */
export const COL_SPAN: Record<number, string> = {
  1:  'col-span-1',
  2:  'col-span-2',
  3:  'col-span-3',
  4:  'col-span-4',
  5:  'col-span-5',
  6:  'col-span-6',
  7:  'col-span-7',
  8:  'col-span-8',
  9:  'col-span-9',
  10: 'col-span-10',
  11: 'col-span-11',
  12: 'col-span-12',
};

interface GridRowProps {
  children: React.ReactNode;
  className?: string;
}

/** A 12-col sub-grid row for nested grids inside a PageShell */
export function GridRow({ children, className = '' }: GridRowProps) {
  return (
    <div className={`col-span-12 grid grid-cols-12 gap-6 ${className}`}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface PageShellProps {
  /** Page title shown as the large H1 — a plain string, or JSX (e.g. a
   * breadcrumb built with <BreadcrumbTitle>) for finer-grained styling. */
  title: React.ReactNode;
  /** Short descriptive line under the title */
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
  /** Buttons / controls placed in the top-right of the header */
  action?: React.ReactNode;
  /** Secondary toolbar row (filters, tabs, search) rendered below the header */
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  /** Extra class on the outer wrapper */
  className?: string;
  /**
   * "grid" (default) — scrollable 12-col grid body; good for dashboards & list pages.
   * "fill"           — body is flex-1 flex flex-col overflow-hidden; children manage
   *                   their own overflow — use for split-pane layouts like Inbox.
   */
  layout?: 'grid' | 'fill';
  /** Called when the user clicks the refresh button — reload this page's data */
  onRefresh?: () => void;
}

export default function PageShell({ title, subtitle, titleSuffix, titleActions, action, toolbar, children, className = '', layout = 'grid', onRefresh }: PageShellProps) {
  const contextRefresh = useRefresh();
  const refresh = onRefresh ?? contextRefresh;
  const [spinning, setSpinning] = React.useState(false);
  const pageHeaderCtx = usePageHeaderContext();
  const isActiveTab = useIsActiveTab();

  const handleRefresh = () => {
    if (!refresh || spinning) return;
    setSpinning(true);
    refresh();
    setTimeout(() => setSpinning(false), 800);
  };

  // When a PageHeaderProvider is present (the normal app shell), publish this
  // page's header content into the shared, permanently-mounted header bar
  // instead of rendering our own — see PageHeaderContext.tsx for why. Views
  // stay mounted after their first visit (App.tsx keeps hidden tabs alive so
  // switching back doesn't re-run their initial fetch), so several PageShells
  // can exist at once — only the currently active one may touch the shared
  // header, or a hidden page's own re-renders (e.g. a polling interval)
  // would stomp on the visible page's title.
  //
  // Deliberately no cleanup here: whichever tab becomes active always
  // re-publishes its own header in the same render pass (its `isActiveTab`
  // flips to true, which is in this effect's deps), so the outgoing page's
  // header is naturally overwritten rather than needing to be cleared first.
  // A clearing cleanup would instead set it to null on every re-run of this
  // effect — including React 18 StrictMode's dev-only double-invoke of a
  // fresh mount (setup → cleanup → setup), which made the header visibly
  // flash blank on every first visit to a page in development.
  React.useEffect(() => {
    if (!pageHeaderCtx || !isActiveTab) return;
    pageHeaderCtx.setHeader({ title, subtitle, titleSuffix, titleActions, action, toolbar, onRefresh: refresh });
    // Depend on pageHeaderCtx.setHeader specifically, NOT the pageHeaderCtx
    // object itself — setHeader is a stable useState setter, so this only
    // re-fires on a real prop change. Depending on the whole context object
    // was an infinite loop: PageHeaderProvider used to hand back a brand-new
    // { header, setHeader } object every render (now memoized, but even
    // memoized it still legitimately changes reference whenever `header`
    // updates), so calling setHeader() here always re-triggered this same
    // effect, which called setHeader() again, forever — this alone was
    // enough to saturate React's render queue and make the whole app
    // (including sidebar navigation elsewhere) stop responding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageHeaderCtx?.setHeader, isActiveTab, title, subtitle, titleSuffix, titleActions, action, toolbar, refresh]);

  const renderOwnHeader = !pageHeaderCtx;

  return (
    <div className={`flex flex-col h-full overflow-hidden ${className}`}>
      {/* ── Page header (only rendered here when there's no shared header slot) ── */}
      {renderOwnHeader && (
        <div className="shrink-0 h-16 px-8 flex items-center justify-between gap-4 border-b border-slate-100 dark:border-[var(--border)] bg-white dark:bg-[var(--bg-surface)]">
          <div className="min-w-0 flex items-center gap-1.5 shrink-0">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-[var(--text-primary)] leading-snug truncate">
              {title}
            </h1>
            {titleSuffix}
            {refresh && (
              <Tooltip label="Refresh" side="bottom">
                <button
                  onClick={handleRefresh}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-[var(--bg-subtle)] transition-colors shrink-0"
                >
                  <RefreshCw className={`h-4 w-4 ${spinning ? 'animate-spin' : ''}`} />
                </button>
              </Tooltip>
            )}
            {titleActions}
          </div>
          {/* Fixed header height (h-16) keeps every page's header the same
              size regardless of what's in the action slot — see
              PageHeaderBar.tsx's identical comment (the shared header the
              running app actually uses; this is only the standalone
              fallback). Deliberately no overflow-x/y here — see
              PageHeaderBar.tsx's comment on why that clips dropdowns. */}
          <div className="shrink-0 flex items-center gap-2 h-full">
            {action && action}
          </div>
        </div>
      )}

      {/* ── Optional toolbar (filters / search) — shown here only in standalone mode ── */}
      {renderOwnHeader && toolbar && (
        <div className="shrink-0 px-8 py-2.5 border-b border-slate-100 dark:border-[var(--border)] bg-slate-50/60 dark:bg-[var(--bg-subtle)] flex items-center gap-3 flex-wrap">
          {toolbar}
        </div>
      )}

      {/* ── Content area ── */}
      {layout === 'fill' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {children}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 md:px-6 xl:px-8 py-4 md:py-6">
          <div className="grid grid-cols-12 gap-4 md:gap-5 xl:gap-6 content-start">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
