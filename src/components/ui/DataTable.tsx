import React, { useEffect, useRef, useState } from 'react';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T, index: number) => React.ReactNode;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  className?: string;
  /** Render inside an existing Card (no outer border/rounding) */
  bare?: boolean;
  /** Extra classes applied to a specific row's <tr> (e.g. highlighting a call in progress) */
  rowClassName?: (row: T, index: number) => string;
  /**
   * Lets the user drag each column header's right edge to resize it.
   * Widths are kept in this component's own state, seeded from each
   * column's `width` (parsed as a px number when possible, otherwise an
   * even split of the table). Off by default so existing tables keep
   * their current auto-sizing behavior unless a page opts in.
   */
  resizable?: boolean;
  /** Minimum column width in px while resizing (default 60) */
  minColWidth?: number;
  /**
   * Adds a page-size selector + Previous/Next footer and slices `rows`
   * to the current page internally. Off by default so existing tables
   * keep showing every row unless a page opts in.
   */
  paginated?: boolean;
  /** Rows-per-page choices shown in the selector (default [25, 50, 100, 150]) */
  pageSizeOptions?: number[];
  /** Initial rows-per-page when paginated (default 25) */
  defaultPageSize?: number;
  /**
   * Hands pagination control to the caller: `rows` is assumed to already
   * be just the current page (fetched from the server), and DataTable
   * renders the same page-size/Prev/Next footer but drives it through
   * these callbacks instead of slicing `rows` itself. Use this whenever
   * the backend supports `?page=&limit=` so large tables don't have to
   * fetch every row up front — omit it (just pass `paginated`) for
   * tables that already have the full array in memory.
   */
  serverPagination?: {
    page: number;
    pageSize: number;
    /** Total row count across all pages (from the backend) */
    total: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
  };
  /**
   * Renders an extra full-width row directly under a given row (an
   * inline editor, an accordion detail panel, etc.) — provide both this
   * and `isRowExpanded` to opt in. Neither is called when omitted, so
   * tables that don't need this pay nothing for it.
   */
  renderExpandedRow?: (row: T, index: number) => React.ReactNode;
  isRowExpanded?: (row: T) => boolean;
}

const MIN_COL_WIDTH_DEFAULT = 60;
const PAGE_SIZE_OPTIONS_DEFAULT = [25, 50, 100, 150];
// Width given to a resizable column that has no explicit `width` and
// hasn't been manually resized yet — e.g. one auto-generated per workflow
// variable (Reports' Campaign Details, Campaign's Workflow View), where
// the column set (and count) is only known at render time. Without a
// floor like this, `table-layout: fixed` + a table pinned to 100% of its
// container squeezes every unsized column down to fit, sometimes to just
// a few px each once there are a dozen+ columns — and since header cells
// use whitespace-nowrap, that overflow visually overlaps the next
// column's header instead of wrapping or clipping.
const DEFAULT_RESIZABLE_COL_WIDTH = 160;

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyMessage = 'No data to display.',
  onRowClick,
  className = '',
  bare = false,
  rowClassName,
  resizable = false,
  minColWidth = MIN_COL_WIDTH_DEFAULT,
  paginated = false,
  pageSizeOptions = PAGE_SIZE_OPTIONS_DEFAULT,
  defaultPageSize = 25,
  serverPagination,
  renderExpandedRow,
  isRowExpanded,
}: DataTableProps<T>) {
  const isPaginated = paginated || !!serverPagination;
  // bare=true: no card chrome, no overflow wrapper (caller's scroll container handles it)
  const wrapper = bare
    ? className
    : `bg-white dark:bg-[var(--bg-surface)] rounded-2xl border border-slate-200 dark:border-[var(--border)] shadow-sm overflow-hidden ${className}`;

  // Column widths (px), keyed by column key — only populated once a column
  // has actually been resized or (for resizable tables) on first render, so
  // non-resizable tables never pay for this state at all.
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const resizeState = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  const [internalPageSize, setInternalPageSize] = useState(defaultPageSize);
  const [internalPage, setInternalPage] = useState(1);

  const page = serverPagination ? serverPagination.page : internalPage;
  const pageSize = serverPagination ? serverPagination.pageSize : internalPageSize;
  const setPage = serverPagination ? serverPagination.onPageChange : setInternalPage;
  const setPageSize = serverPagination ? serverPagination.onPageSizeChange : setInternalPageSize;
  // Server mode already gives us just the current page's rows and the
  // true total; local mode slices the full in-memory array itself.
  const totalRowCount = serverPagination ? serverPagination.total : rows.length;

  const totalPages = isPaginated ? Math.max(1, Math.ceil(totalRowCount / pageSize)) : 1;

  // Clamp back onto a valid page whenever the row count or page size shrinks
  // out from under the current page (filtering, page-size change, etc.).
  // Server-driven pages manage their own clamping (the caller decides what
  // happens when a page goes out of range after a refetch).
  useEffect(() => {
    if (!serverPagination && internalPage > totalPages) setInternalPage(totalPages);
  }, [serverPagination, totalPages, internalPage]);

  const visibleRows = serverPagination ? rows : (paginated ? rows.slice((page - 1) * pageSize, page * pageSize) : rows);
  const rangeStart = totalRowCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalRowCount);

  const parseWidth = (w?: string): number | undefined => {
    if (!w) return undefined;
    const n = parseFloat(w);
    return Number.isFinite(n) && w.trim().endsWith('px') ? n : undefined;
  };

  // The CSS width actually applied to a column's <th>/<td> — resized
  // (always px) first, then whatever the caller declared verbatim (so a
  // percentage width like "35%" still works, not just px), then the
  // floor default. Kept as a CSS string since callers can pass any valid
  // width value, not just pixels.
  const columnCssWidth = (col: Column<T>): string => {
    const resized = colWidths[col.key];
    if (resized) return `${resized}px`;
    if (col.width) return col.width;
    return `${DEFAULT_RESIZABLE_COL_WIDTH}px`;
  };
  // A numeric px ESTIMATE of the same, used only to size the whole table
  // (see `minTableWidth` below) so it can naturally exceed its container
  // and scroll instead of `w-full` squeezing an unbounded number of
  // columns into a fixed width — a percentage-width column can't
  // contribute an exact px figure here, so it falls back to the default
  // floor for this sum only; its actual rendered width still honors the
  // percentage via columnCssWidth above.
  const columnWidthEstimate = (col: Column<T>): number =>
    colWidths[col.key] ?? parseWidth(col.width) ?? DEFAULT_RESIZABLE_COL_WIDTH;
  const minTableWidth = resizable ? columns.reduce((sum, c) => sum + columnWidthEstimate(c), 0) : undefined;

  const startResize = (e: React.MouseEvent, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.currentTarget as HTMLElement).closest('th');
    const startWidth = colWidths[colKey] ?? parseWidth(columns.find(c => c.key === colKey)?.width) ?? th?.getBoundingClientRect().width ?? 120;
    resizeState.current = { key: colKey, startX: e.clientX, startWidth };

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!resizeState.current) return;
      const delta = moveEvent.clientX - resizeState.current.startX;
      const next = Math.max(minColWidth, resizeState.current.startWidth + delta);
      setColWidths(prev => ({ ...prev, [resizeState.current!.key]: next }));
    };
    const onMouseUp = () => {
      resizeState.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div className={`${wrapper} ${isPaginated ? 'flex flex-col flex-1 min-h-0' : ''}`}>
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : (
        <div className={isPaginated ? 'flex-1 overflow-auto min-h-0' : undefined}>
        <table
          ref={tableRef}
          className={resizable ? 'text-sm' : 'w-full text-sm'}
          style={resizable ? { tableLayout: 'fixed', width: minTableWidth, minWidth: '100%' } : undefined}
        >
          <thead className="sticky top-0 z-10" style={{ background: 'var(--bg-surface)' }}>
            <tr className="border-b border-slate-100 dark:border-[var(--border)]">
              {columns.map(col => {
                const width = resizable ? columnCssWidth(col) : col.width;
                return (
                  <th
                    key={col.key}
                    title={typeof col.header === 'string' ? col.header : undefined}
                    className={`relative px-5 py-3 text-[10px] font-bold text-slate-400 dark:text-[var(--text-muted)] uppercase tracking-widest whitespace-nowrap ${resizable ? 'overflow-hidden text-ellipsis' : ''} ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                    style={width ? { width } : undefined}
                  >
                    {col.header}
                    {resizable && (
                      <span
                        onMouseDown={(e) => startResize(e, col.key)}
                        className="group absolute top-0 right-0 h-full w-3 flex items-center justify-center cursor-col-resize select-none hover:bg-blue-500/10 active:bg-blue-500/20"
                        title="Drag to resize column"
                      >
                        <span className="w-px h-3.5 rounded-full bg-slate-300 dark:bg-[var(--border)] group-hover:bg-blue-500 group-hover:h-full group-hover:w-0.5 transition-all" />
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-12 text-center text-sm text-slate-400 dark:text-[var(--text-muted)]">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              visibleRows.map((row, i) => {
                const expanded = isRowExpanded?.(row) ?? false;
                return (
                  <React.Fragment key={rowKey(row)}>
                    <tr
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={`border-b border-slate-50 dark:border-[var(--border-subtle)] last:border-0 transition-colors duration-100 ${onRowClick ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-[var(--bg-subtle)]' : ''} ${expanded ? 'border-b-0' : ''} ${rowClassName ? rowClassName(row, i) : ''}`}
                    >
                      {columns.map(col => (
                        <td
                          key={col.key}
                          className={`px-5 py-3 text-slate-700 dark:text-[var(--text-secondary)] ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''} ${resizable ? 'overflow-hidden truncate' : ''}`}
                        >
                          {col.cell(row, i)}
                        </td>
                      ))}
                    </tr>
                    {expanded && renderExpandedRow && (
                      <tr className="border-b border-slate-50 dark:border-[var(--border-subtle)] last:border-0">
                        <td colSpan={columns.length} className="px-0 py-0">
                          {renderExpandedRow(row, i)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      )}

      {isPaginated && !loading && totalRowCount > 0 && (
        <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 dark:border-[var(--border)] bg-white dark:bg-[var(--bg-surface)]">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-[var(--text-muted)]">
            <span>Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="rounded-lg px-2 py-1 text-xs bg-white dark:bg-[var(--bg-subtle)] border border-slate-200 dark:border-[var(--border)] text-slate-700 dark:text-[var(--text-primary)] focus:outline-none"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-[var(--text-muted)]">
            <span>{rangeStart}–{rangeEnd} of {totalRowCount}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-[var(--border)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-[var(--bg-subtle)] cursor-pointer"
                title="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="px-1.5 font-medium text-slate-700 dark:text-[var(--text-primary)]">{page} / {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-[var(--border)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-[var(--bg-subtle)] cursor-pointer"
                title="Next page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
