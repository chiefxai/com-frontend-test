import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Printer, X } from 'lucide-react';
import chiefVoiceLogo from '../../assets/chiefvoice-logo.webp';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';
import ProgressBar from './ProgressBar';

const EXPORT_FORMATS = [
  { id: 'pdf', label: 'PDF', Icon: Printer },
] as const;

export type ExportFormat = typeof EXPORT_FORMATS[number]['id'];
export type PaperSize = 'A4' | 'A3' | 'Letter' | 'Legal';
export type Orientation = 'landscape' | 'portrait';
export type ExportTheme = 'light' | 'dark';

export interface ExportSettings {
  format: ExportFormat;
  paperSize: PaperSize;
  orientation: Orientation;
  theme: ExportTheme;
}

interface PrintExportDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  fromDate: string;
  toDate: string;
  filters?: string;
  contentRef: React.RefObject<HTMLDivElement | null>;
}

const PAPER: Record<PaperSize, { width: number; height: number; css: string }> = {
  A4: { width: 297, height: 210, css: 'A4' },
  A3: { width: 420, height: 297, css: 'A3' },
  Letter: { width: 279.4, height: 215.9, css: 'Letter' },
  Legal: { width: 355.6, height: 215.9, css: 'Legal' },
};

const EXPORT_THEME_VARS: Record<ExportTheme, React.CSSProperties> = {
  light: {
    '--bg-base': '#F7F9FC', '--bg-surface': '#FFFFFF', '--bg-subtle': '#F1F4F9',
    '--border': '#E2E7F0', '--border-subtle': '#F1F4F9', '--text-primary': '#101A3A',
    '--text-secondary': '#475569', '--text-muted': '#64748B', '--panel-bg': '#FFFFFF',
    '--panel-surface': '#F1F4F9', '--panel-border': '#E2E7F0', '--panel-text': '#101A3A',
    '--panel-muted': '#475569', colorScheme: 'light',
  } as React.CSSProperties,
  dark: {
    '--bg-base': '#080D1C', '--bg-surface': '#10172A', '--bg-subtle': '#151E32',
    '--border': '#263149', '--border-subtle': '#151E32', '--text-primary': '#F7F9FC',
    '--text-secondary': '#A7B0C2', '--text-muted': '#71809B', '--panel-bg': '#080D1C',
    '--panel-surface': '#10172A', '--panel-border': '#263149', '--panel-text': '#F7F9FC',
    '--panel-muted': '#71809B', colorScheme: 'dark',
  } as React.CSSProperties,
};

interface ExportRowItem { html: string; span: number; }
interface ExportPage { rows: ExportRowItem[][]; }
interface MeasuredExportRow { height: number; items: ExportRowItem[]; }

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
      align-items: stretch !important;
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
export function PrintExportDialog({
  open,
  onClose,
  title,
  fromDate,
  toDate,
  filters,
  contentRef,
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
    theme: 'light',
  });
  const [measuredRows, setMeasuredRows] = useState<MeasuredExportRow[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!open || !contentRef.current) {
      setMeasuredRows([]);
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    const source = contentRef.current;
    let frame = 0;
    let refreshTimer = 0;
    let disposed = false;

    const measure = () => {
      if (disposed || !contentRef.current) return;
      const liveSource = contentRef.current;
      const clone = liveSource.cloneNode(true) as HTMLElement;
      const sourceScrollables = liveSource.querySelectorAll<HTMLElement>('[data-widget-scroll]');
      const clonedScrollables = clone.querySelectorAll<HTMLElement>('[data-widget-scroll]');
      sourceScrollables.forEach((sourceElement, index) => {
        const clonedElement = clonedScrollables[index];
        if (!clonedElement) return;
        clonedElement.scrollTop = sourceElement.scrollTop;
        clonedElement.scrollLeft = sourceElement.scrollLeft;
      });
      clone.querySelectorAll('.chiefvoice-print-header, .chiefvoice-print-filter, .chiefvoice-print-page-break')
        .forEach(node => node.remove());
      clone.removeAttribute('id');
      clone.classList.remove('chiefvoice-print-content');
      clone.classList.toggle('dark', settings.theme === 'dark');
      clone.setAttribute('data-theme', settings.theme);
      clone.style.cssText = [
        'display:grid', 'grid-template-columns:repeat(12,minmax(0,1fr))', 'grid-auto-flow:row',
        'grid-auto-rows:max-content', 'align-items:stretch', 'gap:22.6771653546px',
        'width:1440px', 'min-width:1440px', 'max-width:1440px', 'height:auto',
        'min-height:0', 'max-height:none', 'overflow:visible',
        `background:${settings.theme === 'dark' ? '#080D1C' : '#F7F9FC'}`,
        'box-sizing:border-box', 'padding:38px',
      ].join(';');
      Object.assign(clone.style, EXPORT_THEME_VARS[settings.theme]);
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
      measurementHost.classList.toggle('dark', settings.theme === 'dark');
      Object.assign(measurementHost.style, EXPORT_THEME_VARS[settings.theme]);
      measurementHost.style.cssText = 'position:absolute;left:-100000px;top:0;width:1440px;height:auto;visibility:hidden;pointer-events:none;overflow:visible;';
      Object.assign(measurementHost.style, EXPORT_THEME_VARS[settings.theme]);
      measurementHost.appendChild(clone);
      document.body.appendChild(measurementHost);

      frame = window.requestAnimationFrame(() => {
        try {
          clone.querySelectorAll<HTMLElement>('[data-widget-scroll]').forEach(scrollViewport => {
            const bounds = scrollViewport.getBoundingClientRect();
            scrollViewport.querySelectorAll<HTMLElement>('tr').forEach(row => {
              const rowBounds = row.getBoundingClientRect();
              if (rowBounds.bottom <= bounds.top || rowBounds.top >= bounds.bottom) row.remove();
            });
          });

          const rowsMap = new Map<number, HTMLElement[]>();
          Array.from(clone.children).forEach((node) => {
            const element = node as HTMLElement;
            const top = Math.round(element.offsetTop);
            const row = rowsMap.get(top) ?? [];
            row.push(element);
            rowsMap.set(top, row);
          });
          const rows = Array.from(rowsMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([, elements]) => ({
              height: Math.max(...elements.map(el => el.offsetHeight)),
              items: elements.sort((a, b) => a.offsetLeft - b.offsetLeft).map(element => ({
                html: element.outerHTML,
                span: Math.max(1, Math.min(12, Number(element.dataset.exportSpan || 12))),
              })),
            }));

          if (!disposed) {
            setMeasuredRows(rows);
            setPreviewLoading(false);
          }
        } finally {
          measurementHost.remove();
        }
      });
    };

    const scheduleRefresh = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(measure, 120);
    };
    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(source, { subtree: true, childList: true, characterData: true });
    frame = window.requestAnimationFrame(measure);
    return () => {
      disposed = true;
      observer.disconnect();
      if (refreshTimer) window.clearTimeout(refreshTimer);
      window.cancelAnimationFrame(frame);
    };
  }, [open, contentRef]);

  const paper = PAPER[settings.paperSize];
  const pageW = settings.orientation === 'landscape' ? paper.width : paper.height;
  const pageH = settings.orientation === 'landscape' ? paper.height : paper.width;
  const mmToPx = 3.7795275591;
  const previewScale = Math.min(1, 920 / (pageW * mmToPx));
  const previewWidth = pageW * mmToPx * previewScale;
  const previewHeight = pageH * mmToPx * previewScale;
  const desktopWidth = 1440;
  const usableWidthPx = (pageW - 20) * mmToPx;
  // The PDF raster scales the full 1440px canvas into the page's printable
  // width. Use that same ratio here so preview dimensions match the download.
  const gridScale = usableWidthPx / desktopWidth;
  const renderScale = gridScale * previewScale;
  const previewPaperStyle = {
    width: `${previewWidth}px`,
    height: `${previewHeight}px`,
    aspectRatio: `${pageW} / ${pageH}`,
  } as const;

  const pages = React.useMemo(() => {
    const pageH = settings.orientation === 'landscape' ? paper.height : paper.width;
    const pageW = settings.orientation === 'landscape' ? paper.width : paper.height;
    const desktopUsableH = ((pageH - 20) / (pageW - 20)) * desktopWidth;
    const rowGap = 22.6771653546;
    const result: ExportPage[] = [];
    let current: ExportRowItem[][] = [];
    let used = 0;

    for (const row of measuredRows) {
      const needed = current.length === 0 ? row.height : rowGap + row.height;
      if (current.length > 0 && used + needed > desktopUsableH) {
        result.push({ rows: current });
        current = [];
        used = 0;
      }
      current.push(row.items);
      used += current.length === 1 ? row.height : rowGap + row.height;
    }
    if (current.length > 0) result.push({ rows: current });
    return result;
  }, [measuredRows, paper, settings.orientation]);

  const previewTheme: ExportTheme = settings.theme;

  const withGridSpan = (html: string, span: number, removeShadow = false) => {
    const safeSpan = Math.max(1, Math.min(12, span));
    const gridStyle = `grid-column:span ${safeSpan} / span ${safeSpan};width:100%;min-width:0;max-width:100%;height:auto;min-height:0;max-height:none;overflow:visible;box-sizing:border-box;break-inside:avoid;page-break-inside:avoid;${removeShadow ? 'box-shadow:none!important;' : ''}`;
    return html.replace(/^<([a-zA-Z][^>]*)>/, (match, attrs) => {
      const styleMatch = attrs.match(/style="([^"]*)"/);
      if (styleMatch) {
        const merged = styleMatch[1] + ';' + gridStyle;
        return match.replace(styleMatch[0], 'style="' + merged + '"');
      }
      return '<' + attrs + ' style="' + gridStyle + '">';
    });
  };

  const buildPrintMarkup = () => `
    <div class="chiefvoice-export-print-root" style="width:100%;margin:0;padding:0;background:#fff;">
      <section class="chiefvoice-export-page chiefvoice-export-cover" style="width:${pageW}mm;height:${pageH}mm;min-height:${pageH}mm;max-height:${pageH}mm;box-sizing:border-box;padding:10mm;margin:0;overflow:hidden;background:#fff;break-after:page;page-break-after:always;">
        <div class="chiefvoice-export-cover-inner">
          <img src="${chiefVoiceLogo}" alt="ChiefVoice">
          <h1>${title}</h1>
          <p>Filter applied: ${formatRange(fromDate, toDate)}</p>
        </div>
      </section>
      ${pages.map(page => `
        <section class="chiefvoice-export-page" style="width:${pageW}mm;height:${pageH}mm;min-height:${pageH}mm;max-height:${pageH}mm;box-sizing:border-box;padding:10mm;margin:0;overflow:hidden;background:#fff;break-after:page;page-break-after:always;">
          <div class="chiefvoice-export-grid" style="display:grid;grid-template-columns:repeat(12,minmax(0,1fr));grid-auto-flow:row;grid-auto-rows:max-content;align-items:stretch;gap:6mm;width:100%;min-width:0;box-sizing:border-box;overflow:visible;">
            ${page.rows.flat().map(item => withGridSpan(item.html, item.span)).join('')}
          </div>
        </section>
      `).join('')}
    </div>
  `;

  const downloadPdf = async () => {
    const preview = dialogRef.current;
    if (!preview) return;

    const paper = PAPER[settings.paperSize];
    const pdfPageW = settings.orientation === 'landscape' ? paper.width : paper.height;
    const pdfPageH = settings.orientation === 'landscape' ? paper.height : paper.width;
    const previewPages = Array.from(preview.querySelectorAll<HTMLElement>('[data-export-preview-page]'));
    if (!previewPages.length) return;

    await document.fonts.ready;
    const mmToPx = 96 / 25.4;
    const pageCanvasW = Math.ceil(pdfPageW * mmToPx * 1.5);
    const pageCanvasH = Math.ceil(pdfPageH * mmToPx * 1.5);
    const captureScale = 1.5 / previewScale;
    const background = settings.theme === 'dark' ? '#080D1C' : '#F7F9FC';
    const images: { data: string; width: number; height: number }[] = [];
    // Load the SVG/foreignObject renderer only when PDF export is requested.
    // It snapshots browser-resolved DOM styles instead of re-laying out the
    // dashboard through html2canvas's CSS parser.
    const { domToCanvas } = await import('modern-screenshot');

    // Capture the very same page nodes shown in the PDF preview. The previous
    // path rebuilt a second off-screen dashboard, so its CSS/theme resolution
    // could diverge from the preview. The progress overlay is a sibling and is
    // not part of these page nodes.
    for (const page of previewPages) {
      const rendered = await domToCanvas(page, {
        backgroundColor: background,
        scale: captureScale,
        width: page.clientWidth,
        height: page.clientHeight,
        timeout: 15000,
      });
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = pageCanvasW;
      pageCanvas.height = pageCanvasH;
      const context = pageCanvas.getContext('2d');
      if (!context) continue;
      context.fillStyle = background;
      context.fillRect(0, 0, pageCanvasW, pageCanvasH);
      context.drawImage(rendered, 0, 0, rendered.width, rendered.height, 0, 0, pageCanvasW, pageCanvasH);
      images.push({ data: pageCanvas.toDataURL('image/jpeg', 0.94), width: pageCanvas.width, height: pageCanvas.height });
    }

    if (!images.length) return;
    const objects: string[] = [];
    const addObject = (body: string) => { objects.push(body); return objects.length; };
    const bytesToBinary = (bytes: Uint8Array) => {
      let result = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        result += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
      }
      return result;
    };
    const decodeBase64 = (dataUrl: string) => {
      const raw = atob(dataUrl.split(',')[1]);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      return bytes;
    };

    const catalogId = addObject('');
    const pagesId = addObject('');
    const pageIds: number[] = [];
    const contentIds: number[] = [];
    const imageIds: number[] = [];
    for (const image of images) {
      const jpeg = decodeBase64(image.data);
      imageIds.push(addObject(
        '<< /Type /XObject /Subtype /Image /Width ' + image.width +
        ' /Height ' + image.height +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
        jpeg.length + ' >>\nstream\n' + bytesToBinary(jpeg) + '\nendstream'
      ));
    }

    const pageWidthPt = pdfPageW * 72 / 25.4;
    const pageHeightPt = pdfPageH * 72 / 25.4;
    for (let i = 0; i < images.length; i++) {
      const content = 'q\n' + pageWidthPt + ' 0 0 ' + pageHeightPt + ' 0 0 cm\n/Im' + (i + 1) + ' Do\nQ';
      contentIds.push(addObject('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream'));
      pageIds.push(addObject(
        '<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 ' + pageWidthPt + ' ' + pageHeightPt +
        '] /Resources << /XObject << /Im' + (i + 1) + ' ' + imageIds[i] +
        ' 0 R >> >> /Contents ' + contentIds[i] + ' 0 R >>'
      ));
    }

    objects[catalogId - 1] = '<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>';
    objects[pagesId - 1] = '<< /Type /Pages /Count ' + pageIds.length + ' /Kids [' + pageIds.map(id => id + ' 0 R').join(' ') + '] >>';
    let pdf = '%PDF-1.4\n%\xFF\xFF\xFF\xFF\n';
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets[index + 1] = pdf.length;
      pdf += (index + 1) + ' 0 obj\n' + object + '\nendobj\n';
    });
    const xref = pdf.length;
    pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
    for (let i = 1; i <= objects.length; i++) pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root ' + catalogId + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF';

    const pdfBytes = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i++) pdfBytes[i] = pdf.charCodeAt(i) & 255;
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = title.split(' ').join('_') + '.pdf';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const exportHandlers: Record<ExportFormat, () => Promise<void>> = { pdf: downloadPdf };
  const selectedFormat = EXPORT_FORMATS.find(format => format.id === settings.format) ?? EXPORT_FORMATS[0];

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    // Let React paint the overlay before rendering or ZIP generation starts.
    await new Promise<void>(resolve => requestAnimationFrame(() => window.setTimeout(resolve, 40)));
    try {
      await exportHandlers[settings.format]();
    } finally {
      setExporting(false);
    }
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
              <div className="grid grid-cols-1 gap-2">
                {EXPORT_FORMATS.map(({ id, label, Icon }) => (
                  <button key={id} onClick={() => setSettings(s => ({ ...s, format: id }))}
                    className={`rounded-xl border p-3 text-left transition ${settings.format === id ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-[var(--border)] text-[var(--text-secondary)]'}`}>
                    <Icon className="h-4 w-4 mb-2" />
                    <span className="block text-xs font-semibold">{label}</span>
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

              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">Theme</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['light', 'dark'] as ExportTheme[]).map(theme => (
                    <button key={theme} onClick={() => setSettings(s => ({ ...s, theme }))}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold capitalize transition ${settings.theme === theme ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-[var(--border)] text-[var(--text-secondary)]'}`}>
                      {theme}
                    </button>
                  ))}
                </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-xs text-[var(--text-muted)] leading-relaxed">
              Preview and export include the rows visible in each widget at its current scroll position.
            </div>

            <button disabled={exporting} onClick={handleExport}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white px-4 py-3 text-sm font-semibold hover:bg-indigo-700">
              <Download className="h-4 w-4" />
              {exporting ? 'Preparing export…' : `Export ${selectedFormat.label}`}
            </button>
          </aside>

          <main className="flex-1 overflow-auto bg-slate-100 p-8">
            <div className="mx-auto" style={{ width: previewWidth }}>
              <div className="text-xs text-slate-500 mb-2">
                {`${settings.paperSize} · ${settings.orientation} · ${pages.length + 1} page${pages.length === 0 ? '' : 's'} · 12-column grid`}
              </div>

      {previewLoading ? (
        <section
          className="flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]"
          style={{ width: previewWidth, minHeight: Math.min(previewHeight, 520), ...EXPORT_THEME_VARS[previewTheme], color: 'var(--text-primary)' }}
          role="status"
          aria-live="polite"
        >
          <div className="w-full max-w-sm px-8">
            <p className="mb-4 text-sm font-semibold">Preparing preview…</p>
            <ProgressBar value={null} label="Rendering dashboard preview" />
          </div>
        </section>
      ) : <>
      <section data-export-preview-page className={`${previewTheme === 'dark' ? 'dark' : ''} overflow-hidden`} style={{ ...previewPaperStyle, ...EXPORT_THEME_VARS[previewTheme], backgroundColor: 'var(--bg-base)' }}>
                <div style={{ width: pageW * mmToPx, height: pageH * mmToPx, transform: `scale(${previewScale})`, transformOrigin: 'top left', background: 'var(--bg-surface)', boxSizing: 'border-box', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:40, color:'var(--text-primary)' }}>
                  <img src={chiefVoiceLogo} alt="ChiefVoice" style={{ display:'block', width:88, height:88, objectFit:'contain', margin:'0 auto 24px' }} />
                  <h1 style={{ textAlign:'center', fontSize:28, margin:'0 0 10px', color:'var(--text-primary)' }}>{title}</h1>
                  <p style={{ textAlign:'center', fontSize:14, color:'var(--text-secondary)', margin:0 }}>Filter applied: {formatRange(fromDate,toDate)}</p>
                </div>
              </section>

              {pages.map((page, pageIndex) => {
                const pageHtml = page.rows.flat()
                  .map(item => withGridSpan(item.html, item.span, previewTheme === 'light'))
                  .join('');
                return (
                  <React.Fragment key={pageIndex}>
                    <div className="h-8" />
                    <section data-export-preview-page className={`${previewTheme === 'dark' ? 'dark' : ''} overflow-hidden`} style={{ ...previewPaperStyle, ...EXPORT_THEME_VARS[previewTheme], backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', position: 'relative' }}>
                      <div
                        style={{
                          position: 'absolute',
                          left: 10 * mmToPx * previewScale,
                          top: 10 * mmToPx * previewScale,
                          width: desktopWidth,
                          height: 'auto',
                          padding: 0,
                          boxSizing: 'border-box',
                          display: 'grid',
                          gridTemplateColumns: 'repeat(12,minmax(0,1fr))',
                          gridAutoFlow: 'row',
                          gridAutoRows: 'max-content',
                          alignItems: 'stretch',
                          gap: 22.6771653546,
                          transform: `scale(${renderScale})`,
                          transformOrigin: 'top left',
                          background: 'var(--bg-base)',
                          color: 'var(--text-primary)',
                        }}
                        dangerouslySetInnerHTML={{ __html: pageHtml }}
                      />
                    </section>
                  </React.Fragment>
                );
              })}
      </>}
            </div>
          </main>
        </div>
      </div>
      {exporting && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm" role="status" aria-live="polite">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-2xl">
            <p className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Preparing your {selectedFormat.label} export</p>
            <ProgressBar value={null} label="Rendering dashboard" />
          </div>
        </div>
      )}
    </div>
  );
}

export default PrintExportDialog;
