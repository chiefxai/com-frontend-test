import React from 'react';
import { RefreshCw } from 'lucide-react';
import { usePageHeaderContext } from '../../lib/PageHeaderContext';
import Tooltip from './Tooltip';

// Permanently-mounted counterpart to PageShell's header markup — rendered
// once in App.tsx so switching tabs (which unmounts/remounts the whole view,
// PageShell included) only swaps the title/subtitle/action content here
// instead of tearing down and rebuilding the header DOM itself.
//
// The refresh button calls the CURRENT page's own onRefresh (published by
// PageShell, defaulting to the app-wide refresh when a page doesn't supply
// one) — not a fixed handler — so it always reloads whatever page is showing.
export default function PageHeaderBar() {
  const ctx = usePageHeaderContext();
  const [spinning, setSpinning] = React.useState(false);

  const header = ctx?.header;
  if (!header) return null;
  const refresh = header.onRefresh;

  const handleRefresh = () => {
    if (!refresh || spinning) return;
    setSpinning(true);
    refresh();
    setTimeout(() => setSpinning(false), 800);
  };

  return (
    <>
      <div className="shrink-0 h-16 px-8 flex items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--bg-surface)]">
        <div className="min-w-0 flex items-center gap-1.5 shrink-0">
          <h1 className="text-lg font-semibold tracking-tight text-[var(--text-primary)] leading-snug truncate">
            {header.title}
          </h1>
          {header.titleSuffix}
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
          {header.titleActions}
        </div>
        {/* Fixed header height (h-16) keeps every page's header the same
            size regardless of what's in the action slot — a page with no
            button and a page with several used to end up visibly
            different heights whenever action content wrapped onto a
            second line. Deliberately no overflow-x/y here — any non-
            visible overflow on this ancestor clips an absolutely
            positioned dropdown (e.g. ActionMenu) opened from inside it,
            regardless of the dropdown's own z-index; flex-nowrap on the
            action content itself (see e.g. WorkflowsView.tsx) is what
            keeps a wide row from wrapping and growing the header. */}
        <div className="shrink-0 flex items-center gap-2 h-full">
          {header.action && header.action}
        </div>
      </div>

      {header.toolbar && (
        <div className="shrink-0 px-8 py-2.5 border-b border-[var(--border)] bg-[var(--bg-subtle)] flex items-center gap-3 flex-wrap">
          {header.toolbar}
        </div>
      )}
    </>
  );
}
