import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileText, Printer, X } from 'lucide-react';
import chiefVoiceLogo from '../../assets/chiefvoice-logo.webp';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';

export type ExportFormat = 'pdf' | 'doc';
export type PaperSize = 'A4' | 'A3' | 'Letter' | 'Legal';
export type Orientation = 'landscape' | 'portrait';

export interface ExportSettings {
  format: ExportFormat;
  paperSize: PaperSize;
  orientation: Orientation;
}

interface PrintExportDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  fromDate: string;
  toDate: string;
  contentRef: React.RefObject<HTMLDivElement | null>;
  onExportPdf: (settings: ExportSettings, printableMarkup: string) => void;
}

const PAPER: Record<PaperSize, { width: number; height: number; css: string }> = {
  A4: { width: 297, height: 210, css: 'A4' },
  A3: { width: 420, height: 297, css: 'A3' },
  Letter: { width: 279.4, height: 215.9, css: 'Letter' },
  Legal: { width: 355.6, height: 215.9, css: 'Legal' },
};

interface ExportRowItem { html: string; span: number; }
interface ExportPage { rows: ExportRowItem[][]; }

function formatRange(from: string, to: string) {
  const f = (v: string) => new Date(v + 'T00:00:00').toLocaleDateString(undefined, {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  return `${f(from)} – ${f(to)}`;
}

export function buildExportPageStyle(settings: ExportSettings): string {
  const p = PAPER[settings.paperSize];
  const pageWidth = settings.orientation === 'landscape' ? p.width : p.height;
  const pageHeight = settings.orientation === 'landscape' ? p.height : p.width;

  return `
    @page { size: ${p.css} ${settings.orientation}; margin: 0 !important; }
    html, body {
      width: 100% !important; height: 100% !important; margin: 0 !important; padding: 0 !important;
      overflow: visible !important; background: #fff !important;
    }
    body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .chiefvoice-export-print-root {
      position: static !important; left: auto !important; top: auto !important;
      width: 100% !important; height: auto !important; margin: 0 !important; padding: 0 !important;
      overflow: visible !important; background: #fff !important;
    }
    .chiefvoice-export-page {
      width: ${pageWidth}mm !important;
      height: ${pageHeight}mm !important;
      min-height: ${pageHeight}mm !important;
      max-height: ${pageHeight}mm !important;
      box-sizing: border-box !important;
      padding: 10mm !important;
      margin: 0 !important;
      overflow: hidden !important;
      background: #fff !important;
      break-after: page !important;
      page-break-after: always !important;
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
    .chiefvoice-export-page:last-child { break-after: auto !important; page-break-after: auto !important; }
    .chiefvoice-export-cover { display:flex !important; align-items:center !important; justify-content:center !important; text-align:center !important; }
    .chiefvoice-export-cover-inner { width:100% !important; height:100% !important; display:flex !important; flex-direction:column !important; align-items:center !important; justify-content:center !important; text-align:center !important; }
    .chiefvoice-export-cover img { width:110px !important; height:110px !important; object-fit:contain !important; margin:0 0 28px 0 !important; }
    .chiefvoice-export-cover h1 { font-size:30px !important; line-height:1.2 !important; margin:0 0 10px 0 !important; }
    .chiefvoice-export-cover p { font-size:14px !important; line-height:1.5 !important; margin:0 !important; color:#4b5563 !important; }
    .chiefvoice-export-grid {
      display: grid !important;
      grid-template-columns: repeat(12, minmax(0, 1fr)) !important;
      grid-auto-flow: row !important;
      grid-auto-rows: max-content !important;
      align-items: start !important;
      gap: 6mm !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: none !important;
      height: auto !important;
      overflow: visible !important;
      box-sizing: border-box !important;
    }
    .chiefvoice-export-grid > * {
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
      break-inside: avoid-page !important;
      page-break-inside: avoid !important;
    }
    .chiefvoice-export-grid > [data-grid-span-lg="1"] { grid-column:span 1 / span 1 !important; }
    .chiefvoice-export-grid > [data-grid-span-lg="2"] { grid-column:span 2 / span 2 !important; }
    .chiefvoice-export-grid > [data-grid-span-lg="3"] { grid-column:span 3 / span 3 !important; }
    .chiefvoice-export-grid > [data-grid-span-lg="4"] { grid-column:span 4 / span 4 !important; }
    .chiefvoice-export-grid > [data-grid-span-lg="5"] { grid-column:span 5 / span 5 !important; }
    .chiefvoice-export-grid > [data-grid-span-lg="6"] { grid-column:span 6 / span 6 !important; }
    .chiefvoice-export-grid > [data-grid-span-lg="7"] { grid-column:span 7 / span 7 !important; }
    .chiefvoice-export-grid > [data-grid-span-lg="8"] { grid-column:span 8 / span 8 !important; }
    .chiefvoice-export-grid > [data-grid-span-lg="9"] { grid-column:span 9 / span 9 !important; }
    .chiefvoice-export-grid > [data-grid-span-lg="10"] { grid-column:span 10 / span 10 !important; }
    .chiefvoice-export-grid > [data-grid-span-lg="11"] { grid-column:span 11 / span 11 !important; }
    .chiefvoice-export-grid > [data-grid-span-lg="12"] { grid-column:span 12 / span 12 !important; }
    .chiefvoice-export-grid .recharts-responsive-container,
    .chiefvoice-export-grid .recharts-wrapper {
      min-width: 0 !important; max-width: 100% !important;
    }
    .chiefvoice-export-grid .recharts-surface { max-width: 100% !important; }
    .chiefvoice-export-grid table { max-width: 100% !important; }
  `;
}
function collectStyles() {
  let css = '';
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      css += Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n');
    } catch {
      // Cross-origin stylesheets cannot be read; inline export CSS still applies.
    }
  }
  return css;
}

export function PrintExportDialog({
  open,
  onClose,
  title,
  fromDate,
  toDate,
  contentRef,
  onExportPdf,
}: PrintExportDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const handleOutsideClick = useCallback(() => {
    if (open) onClose();
  }, [open, onClose]);

  useOnClickOutside(dialogRef, handleOutsideClick, open);


  const [settings, setSettings] = useState<ExportSettings>({
    format: 'pdf',
    paperSize: 'A4',
    orientation: 'landscape',
  });
  const [pages, setPages] = useState<ExportPage[]>([]);

  useEffect(() => {
    if (!open || !contentRef.current) {
      setPages([]);
      return;
    }

    const clone = contentRef.current.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.chiefvoice-print-header, .chiefvoice-print-filter, .chiefvoice-print-page-break')
      .forEach(node => node.remove());
    clone.removeAttribute('id');
    clone.style.cssText = [
      'display:grid',
      'grid-template-columns:repeat(12,minmax(0,1fr))',
      'grid-auto-flow:row',
      'grid-auto-rows:max-content',
      'align-items:start',
      'gap:22.6771653546px',
      'width:1440px',
      'min-width:1440px',
      'max-width:1440px',
      'height:auto',
      'min-height:0',
      'max-height:none',
      'overflow:visible',
      'background:#fff',
      'box-sizing:border-box',
      'padding:38px',
    ].join(';');

    clone.querySelectorAll(':scope > *').forEach((node) => {
      const element = node as HTMLElement;
      element.style.width = '100%';
      element.style.minWidth = '0';
      element.style.maxWidth = '100%';
      element.style.height = 'auto';
      element.style.minHeight = '0';
      element.style.maxHeight = 'none';
      element.style.overflow = 'visible';
      const lgSpan = Number(element.dataset.gridSpanLg || element.dataset.gridSpan || 12);
      element.style.gridColumn = `span ${lgSpan} / span ${lgSpan}`;
      element.dataset.exportSpan = String(lgSpan);
      element.style.breakInside = 'avoid';
      element.style.pageBreakInside = 'avoid';
    });

    const measurementHost = document.createElement('div');
    measurementHost.style.cssText = [
      'position:absolute',
      'left:-100000px',
      'top:0',
      'width:1440px',
      'height:auto',
      'visibility:hidden',
      'pointer-events:none',
      'overflow:visible',
    ].join(';');
    measurementHost.appendChild(clone);
    document.body.appendChild(measurementHost);

    const run = () => {
      const children = Array.from(clone.children) as HTMLElement[];
      const rowsMap = new Map<number, HTMLElement[]>();
      children.forEach((element) => {
        const top = Math.round(element.offsetTop);
        const row = rowsMap.get(top) ?? [];
        row.push(element);
        rowsMap.set(top, row);
      });

      const rows = Array.from(rowsMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, elements]) => ({
          height: Math.max(...elements.map(el => el.offsetHeight)),
          items: elements
            .sort((a, b) => a.offsetLeft - b.offsetLeft)
            .map(element => ({
              html: element.outerHTML,
              span: Math.max(1, Math.min(12, Number(element.dataset.exportSpan || 12))),
            })),
        }));

      // The measurement canvas is 1440px wide with 38px padding. The print
      // page has 10mm padding. Convert the physical paper's usable height into
      // that same desktop coordinate system so pagination is deterministic.
      const paper = PAPER[settings.paperSize];
      const pageW = settings.orientation === 'landscape' ? paper.width : paper.height;
      const pageH = settings.orientation === 'landscape' ? paper.height : paper.width;
      const usableW = pageW - 20;
      const usableH = pageH - 20;
      const desktopGridW = 1440 - (2 * 37.795275591);
      const desktopUsableH = (usableH / usableW) * desktopGridW;
      const rowGap = 22.6771653546;

      const result: ExportPage[] = [];
      let current: ExportRowItem[][] = [];
      let used = 0;

      for (const row of rows) {
        const rowHeight = row.height;
        const needed = current.length === 0 ? rowHeight : rowGap + rowHeight;

        // Never split a dashboard row. If the next row cannot fit, start a
        // completely new physical page.
        if (current.length > 0 && used + needed > desktopUsableH) {
          result.push({ rows: current });
          current = [];
          used = 0;
        }

        current.push(row.items);
        used += current.length === 1 ? rowHeight : rowGap + rowHeight;
      }

      if (current.length > 0) result.push({ rows: current });
      setPages(result);
      measurementHost.remove();
    };

    const frame = window.requestAnimationFrame(run);
    return () => {
      window.cancelAnimationFrame(frame);
      measurementHost.remove();
    };
  }, [open, contentRef, settings.paperSize, settings.orientation]);

  const paper = PAPER[settings.paperSize];
  const pageW = settings.orientation === 'landscape' ? paper.width : paper.height;
  const pageH = settings.orientation === 'landscape' ? paper.height : paper.width;
  const mmToPx = 3.7795275591;
  const previewScale = Math.min(1, 920 / (pageW * mmToPx));
  const previewWidth = pageW * mmToPx * previewScale;
  const previewHeight = pageH * mmToPx * previewScale;
  const desktopWidth = 1440;
  const desktopGridWidth = desktopWidth - (2 * 37.795275591);
  const usableWidthPx = (pageW - 20) * mmToPx;
  const gridScale = usableWidthPx / desktopGridWidth;
  const renderScale = gridScale * previewScale;
  const desktopPageHeight = ((pageH - 20) / (pageW - 20)) * desktopGridWidth + (2 * 37.795275591);
  const previewPaperStyle = {
    width: `${previewWidth}px`,
    height: `${previewHeight}px`,
    aspectRatio: `${pageW} / ${pageH}`,
  } as const;

  const buildWordRows = (rows: ExportRowItem[][]) => rows.map(row => {
    const cells = row.map(item =>
      `<td colspan="${item.span}" style="width:${(item.span / 12) * 100}%;vertical-align:top;padding:0 6px 14px 6px">${item.html}</td>`
    ).join('');
    const used = row.reduce((sum, item) => sum + item.span, 0);
    const filler = used < 12 ? `<td colspan="${12 - used}" style="width:${((12 - used) / 12) * 100}%"></td>` : '';
    return `<tr style="page-break-inside:avoid">${cells}${filler}</tr>`;
  }).join('');

  const buildWordPages = () => {
    const cover = `
      <section class="chiefvoice-export-page chiefvoice-export-cover" style="page-break-after:always">
        <div class="chiefvoice-export-cover-inner">
          <img src="${chiefVoiceLogo}" alt="ChiefVoice">
          <h1>${title}</h1>
          <p>Filter applied: ${formatRange(fromDate, toDate)}</p>
        </div>
      </section>`;
    const content = pages.map((page, index) => `
      <section class="chiefvoice-export-page" style="page-break-after:${index === pages.length - 1 ? 'auto' : 'always'}">
        <table role="presentation" style="width:100%;table-layout:fixed;border-collapse:collapse">
          <tbody>${buildWordRows(page.rows)}</tbody>
        </table>
      </section>
    `).join('');
    return cover + content;
  };

  const buildPrintMarkup = () => `
    <div class="chiefvoice-export-print-root">
      <section class="chiefvoice-export-page chiefvoice-export-cover">
        <div class="chiefvoice-export-cover-inner">
          <img src="${chiefVoiceLogo}" alt="ChiefVoice">
          <h1>${title}</h1>
          <p>Filter applied: ${formatRange(fromDate, toDate)}</p>
        </div>
      </section>
      ${pages.map((page, index) => `
        <section class="chiefvoice-export-page">
          <div class="chiefvoice-export-grid">
            ${page.rows.flat().map(item => item.html).join('')}
          </div>
        </section>
      `).join('')}
    </div>
  `;

  const downloadDoc = () => {
    if (!pages.length) return;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
      <style>
        ${collectStyles()}
        @page { size:${paper.css} ${settings.orientation}; margin:0; }
        html,body{margin:0;padding:0;background:#fff;color:#111827}
        .chiefvoice-export-page{width:${pageW}mm;height:${pageH}mm;box-sizing:border-box;padding:10mm;margin:0;page-break-after:always;break-after:page;overflow:hidden}
        .chiefvoice-export-page:last-child{page-break-after:auto;break-after:auto}
        .chiefvoice-export-page table{width:100%;table-layout:fixed;border-collapse:collapse}
        .chiefvoice-export-page tr,.chiefvoice-export-page td{page-break-inside:avoid;break-inside:avoid}
        .chiefvoice-export-page > *{max-width:100%}
        .chiefvoice-export-cover{text-align:center;font-family:Arial,sans-serif}
        .chiefvoice-export-cover-inner{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center}
        .chiefvoice-export-cover img{width:72px;height:72px;object-fit:contain}
        .chiefvoice-export-cover h1{font-size:24px;margin:12px 0 6px}
        .chiefvoice-export-cover p{color:#4b5563;margin:0}
      </style></head><body>
      ${buildWordPages()}
      </body></html>`;
    const blob = new Blob([html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\s+/g, '_')}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[2000] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div ref={dialogRef} className="w-full max-w-7xl h-[94vh] bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)] shadow-2xl overflow-hidden flex flex-col">
        <div className="h-16 shrink-0 px-5 flex items-center justify-between border-b border-[var(--border)]">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Export {title}</h2>
            <p className="text-xs text-[var(--text-muted)]">Preview the document before exporting.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-muted)]" aria-label="Close export preview">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex overflow-hidden">
          <aside className="w-72 shrink-0 border-r border-[var(--border)] p-5 space-y-5 overflow-y-auto">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">Format</p>
              <div className="grid grid-cols-2 gap-2">
                {(['pdf','doc'] as ExportFormat[]).map(format => (
                  <button key={format} onClick={() => setSettings(s => ({ ...s, format }))}
                    className={`rounded-xl border p-3 text-left transition ${settings.format === format ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-[var(--border)] text-[var(--text-secondary)]'}`}>
                    {format === 'pdf' ? <Printer className="h-4 w-4 mb-2" /> : <FileText className="h-4 w-4 mb-2" />}
                    <span className="block text-xs font-semibold">{format === 'pdf' ? 'PDF' : 'Word (.doc)'}</span>
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Paper size</span>
              <select value={settings.paperSize} onChange={e => setSettings(s => ({ ...s, paperSize: e.target.value as PaperSize }))}
                className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm">
                {Object.keys(PAPER).map(size => <option key={size}>{size}</option>)}
              </select>
            </label>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">Orientation</p>
              <div className="grid grid-cols-2 gap-2">
                {(['landscape','portrait'] as Orientation[]).map(orientation => (
                  <button key={orientation} onClick={() => setSettings(s => ({ ...s, orientation }))}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold capitalize ${settings.orientation === orientation ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-[var(--border)] text-[var(--text-secondary)]'}`}>
                    {orientation}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-xs text-[var(--text-muted)] leading-relaxed">
              Each export page is laid out independently. Width always follows the dashboard's 12-column grid; whole rows move to the next page when the available paper height is exhausted.
            </div>

            <button onClick={() => settings.format === 'pdf' ? onExportPdf(settings, buildPrintMarkup()) : downloadDoc()}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white px-4 py-3 text-sm font-semibold hover:bg-indigo-700">
              <Download className="h-4 w-4" />
              Export {settings.format === 'pdf' ? 'PDF' : 'Word'}
            </button>
          </aside>

          <main className="flex-1 overflow-auto bg-slate-100 p-8">
            <div className="mx-auto" style={{ width: previewWidth }}>
              <div className="text-xs text-slate-500 mb-2">
                {settings.paperSize} · {settings.orientation} · {pages.length + 1} page{pages.length === 0 ? '' : 's'} · 12-column grid
              </div>

              <section className="bg-white shadow-xl overflow-hidden" style={previewPaperStyle}>
                <div style={{ width: pageW * mmToPx, height: pageH * mmToPx, transform: `scale(${previewScale})`, transformOrigin: 'top left', background: '#f8faff', boxSizing: 'border-box', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:40 }}>
                  <img src={chiefVoiceLogo} alt="ChiefVoice" style={{ display:'block', width:88, height:88, objectFit:'contain', margin:'0 auto 24px' }} />
                  <h1 style={{ textAlign:'center', fontSize:28, margin:'0 0 10px', color:'#111827' }}>{title}</h1>
                  <p style={{ textAlign:'center', fontSize:14, color:'#4b5563', margin:0 }}>Filter applied: {formatRange(fromDate,toDate)}</p>
                </div>
              </section>

              {pages.map((page, pageIndex) => {
                const pageHtml = page.rows.flat().map(item => item.html).join('');
                return (
                  <React.Fragment key={pageIndex}>
                    <div className="h-8" />
                    <section className="bg-white shadow-xl overflow-hidden" style={previewPaperStyle}>
                      <div
                        style={{
                          width: desktopWidth,
                          height: desktopPageHeight,
                          padding: 37.795275591,
                          boxSizing: 'border-box',
                          display: 'grid',
                          gridTemplateColumns: 'repeat(12,minmax(0,1fr))',
                          gridAutoFlow: 'row',
                          gridAutoRows: 'max-content',
                          alignItems: 'start',
                          gap: 22.6771653546,
                          transform: `scale(${renderScale})`,
                          transformOrigin: 'top left',
                          background: '#fff',
                        }}
                        dangerouslySetInnerHTML={{ __html: pageHtml }}
                      />
                    </section>
                  </React.Fragment>
                );
              })}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default PrintExportDialog;
