import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Printer, X } from 'lucide-react';
import chiefVoiceLogo from '../../assets/chiefvoice-logo.webp';

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
  onExportPdf: (settings: ExportSettings) => void;
}

const PAPER: Record<PaperSize, { width: number; height: number; css: string }> = {
  A4: { width: 297, height: 210, css: 'A4' },
  A3: { width: 420, height: 297, css: 'A3' },
  Letter: { width: 279.4, height: 215.9, css: 'Letter' },
  Legal: { width: 355.6, height: 215.9, css: 'Legal' },
};

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
  const usableWidth = pageWidth - 20;
  const scale = usableWidth / 297;
  const desktopWidth = 1440;
  const zoom = scale * 0.727034;

  return `
    @page { size: ${p.css} ${settings.orientation}; margin: 10mm !important; }
    html, body {
      width: auto !important; height: auto !important; min-height: 0 !important;
      margin: 0 !important; padding: 0 !important; overflow: visible !important;
      background: #fff !important;
    }
    body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .chiefvoice-print-content {
      display: grid !important; grid-template-columns: repeat(12,minmax(0,1fr)) !important;
      grid-auto-flow: row !important; grid-auto-rows: max-content !important; align-items: start !important;
      gap: 24px !important; width: ${desktopWidth}px !important; max-width: ${desktopWidth}px !important;
      min-width: ${desktopWidth}px !important; height: auto !important; min-height: 0 !important;
      max-height: none !important; overflow: visible !important; margin: 0 !important; padding: 0 !important;
      box-sizing: border-box !important; zoom: ${zoom} !important; background: #fff !important;
    }
    .chiefvoice-print-filter { display:none !important; }
    .chiefvoice-print-header {
      display:flex !important; flex-direction:column !important; align-items:center !important;
      justify-content:flex-start !important; width:${desktopWidth}px !important;
      height:${pageHeight - 20}mm !important; min-height:${pageHeight - 20}mm !important;
      box-sizing:border-box !important; padding-top:20mm !important; text-align:center !important;
      break-after:avoid !important; page-break-after:avoid !important; background:#f8faff !important;
    }
    .chiefvoice-print-header > div { width:100% !important; display:flex !important; flex-direction:column !important; align-items:center !important; }
    .chiefvoice-print-header img { width:110px !important; height:110px !important; margin:0 0 28px 0 !important; object-fit:contain !important; }
    .chiefvoice-print-header > div > div:first-child { font-size:30px !important; line-height:1.2 !important; margin-bottom:10px !important; }
    .chiefvoice-print-header > div > div:last-child { font-size:14px !important; line-height:1.5 !important; }
    .chiefvoice-print-page-break {
      display:block !important; grid-column:1 / -1 !important; width:${desktopWidth}px !important; height:1px !important;
      margin:0 !important; padding:0 !important; break-before:page !important; page-break-before:always !important;
    }
    .chiefvoice-print-content > [class*="lg\\:col-span-1"] { grid-column:span 1 / span 1 !important; }
    .chiefvoice-print-content > [class*="lg\\:col-span-2"] { grid-column:span 2 / span 2 !important; }
    .chiefvoice-print-content > [class*="lg\\:col-span-3"] { grid-column:span 3 / span 3 !important; }
    .chiefvoice-print-content > [class*="lg\\:col-span-4"] { grid-column:span 4 / span 4 !important; }
    .chiefvoice-print-content > [class*="lg\\:col-span-5"] { grid-column:span 5 / span 5 !important; }
    .chiefvoice-print-content > [class*="md\\:col-span-6"],
    .chiefvoice-print-content > [class*="lg\\:col-span-6"],
    .chiefvoice-print-content > .col-span-6 { grid-column:span 6 / span 6 !important; }
    .chiefvoice-print-content > [class*="lg\\:col-span-7"] { grid-column:span 7 / span 7 !important; }
    .chiefvoice-print-content > [class*="lg\\:col-span-8"] { grid-column:span 8 / span 8 !important; }
    .chiefvoice-print-content > [class*="lg\\:col-span-9"] { grid-column:span 9 / span 9 !important; }
    .chiefvoice-print-content > [class*="lg\\:col-span-10"] { grid-column:span 10 / span 10 !important; }
    .chiefvoice-print-content > [class*="lg\\:col-span-11"] { grid-column:span 11 / span 11 !important; }
    .chiefvoice-print-content > .col-span-12 { grid-column:span 12 / span 12 !important; }
    .chiefvoice-print-content > :not(.chiefvoice-print-header):not(.chiefvoice-print-filter):not(.chiefvoice-print-page-break) {
      box-sizing:border-box !important; min-width:0 !important; max-width:100% !important;
      break-inside:avoid-page !important; page-break-inside:avoid !important;
    }
    .chiefvoice-print-content .recharts-responsive-container,
    .chiefvoice-print-content .recharts-wrapper { min-width:0 !important; max-width:100% !important; }
    .chiefvoice-print-content .recharts-surface { max-width:100% !important; }
    .chiefvoice-print-content table { max-width:100% !important; }
  `;
}

function collectStyles() {
  let css = '';
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      css += Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n');
    } catch {
      // Ignore cross-origin stylesheets.
    }
  }
  return css;
}

export default function PrintExportDialog({
  open, onClose, title, fromDate, toDate, contentRef, onExportPdf,
}: PrintExportDialogProps) {
  const [settings, setSettings] = useState<ExportSettings>({
    format: 'pdf', paperSize: 'A4', orientation: 'landscape',
  });
  const [snapshot, setSnapshot] = useState('');

  useEffect(() => {
    if (!open || !contentRef.current) return;
    const clone = contentRef.current.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.chiefvoice-print-header, .chiefvoice-print-filter, .chiefvoice-print-page-break')
      .forEach(node => node.remove());
    clone.removeAttribute('id');
    clone.style.cssText = [
      'display:grid',
      'grid-template-columns:repeat(12,minmax(0,1fr))',
      'gap:24px',
      'width:1440px',
      'min-width:1440px',
      'max-width:1440px',
      'height:auto',
      'overflow:visible',
      'background:#fff',
      'box-sizing:border-box',
    ].join(';');
    setSnapshot(clone.outerHTML);
  }, [open, contentRef]);

  const paper = PAPER[settings.paperSize];
  const pageW = settings.orientation === 'landscape' ? paper.width : paper.height;
  const pageH = settings.orientation === 'landscape' ? paper.height : paper.width;
  const previewScale = Math.min(1, 920 / (pageW * 3.7795));
  const previewWidth = pageW * 3.7795 * previewScale;
  const previewHeight = pageH * 3.7795 * previewScale;

  const downloadDoc = () => {
    if (!snapshot) return;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
      <style>
        ${collectStyles()}
        @page { size:${paper.css} ${settings.orientation}; margin:10mm; }
        body{margin:0;background:#fff;color:#111827}
        .chiefvoice-print-content{width:1440px!important;min-width:1440px!important;display:grid!important;grid-template-columns:repeat(12,minmax(0,1fr))!important;gap:24px!important}
      </style></head><body>
      <div style="text-align:center;font-family:Arial,sans-serif;padding:32px 0 24px">
        <img src="${chiefVoiceLogo}" style="width:72px;height:72px;object-fit:contain">
        <h1 style="font-size:24px;margin:12px 0 6px">${title}</h1>
        <p style="color:#4b5563;margin:0">Filter applied: ${formatRange(fromDate,toDate)}</p>
      </div>
      ${snapshot}
      </body></html>`;
    const blob = new Blob([html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\\s+/g, '_')}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[2000] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-7xl h-[94vh] bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)] shadow-2xl overflow-hidden flex flex-col">
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
              The preview keeps the dashboard on its desktop 12-column layout. Widgets are kept intact for printing and move to the next page when they do not fit.
            </div>

            <button onClick={() => settings.format === 'pdf' ? onExportPdf(settings) : downloadDoc()}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white px-4 py-3 text-sm font-semibold hover:bg-indigo-700">
              <Download className="h-4 w-4" />
              Export {settings.format === 'pdf' ? 'PDF' : 'Word'}
            </button>
          </aside>

          <main className="flex-1 overflow-auto bg-slate-100 p-8">
            <div className="mx-auto" style={{ width: previewWidth }}>
              <div className="text-xs text-slate-500 mb-2">{settings.paperSize} · {settings.orientation} · {Math.round(previewScale * 100)}% preview</div>
              <section className="bg-white shadow-xl overflow-hidden" style={{ width: previewWidth, height: previewHeight }}>
                <div style={{ width: pageW * 3.7795, height: pageH * 3.7795, transform: `scale(${previewScale})`, transformOrigin: 'top left', background: '#f8faff', boxSizing: 'border-box', paddingTop: 76 }}>
                  <img src={chiefVoiceLogo} alt="ChiefVoice" style={{ display:'block', width:88, height:88, objectFit:'contain', margin:'0 auto 24px' }} />
                  <h1 style={{ textAlign:'center', fontSize:28, margin:'0 0 10px', color:'#111827' }}>{title}</h1>
                  <p style={{ textAlign:'center', fontSize:14, color:'#4b5563', margin:0 }}>Filter applied: {formatRange(fromDate,toDate)}</p>
                </div>
              </section>

              <div className="h-8" />

              <section className="bg-white shadow-xl overflow-hidden" style={{ width: previewWidth, minHeight: previewHeight }}>
                <div
                  className="origin-top-left"
                  style={{ width: pageW * 3.7795, minHeight: pageH * 3.7795, transform: `scale(${previewScale})`, transformOrigin:'top left', padding:38, boxSizing:'border-box' }}
                  dangerouslySetInnerHTML={{ __html: snapshot }}
                />
              </section>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
