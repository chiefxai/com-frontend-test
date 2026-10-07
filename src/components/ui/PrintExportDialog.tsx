import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileText, Printer, X } from 'lucide-react';
import chiefVoiceLogo from '../../assets/chiefvoice-logo.webp';
import html2canvas from 'html2canvas-pro';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';

export type ExportFormat = 'pdf' | 'doc';
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
      'align-items:stretch',
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
    const pageBreak = '<p class="chiefvoice-word-page-break" style="page-break-before:always;mso-break-type:page-break;mso-pagination:widow-orphan;margin:0 0 1px 0;padding:0;font-size:1pt;line-height:1pt">&nbsp;</p>';
    const cover = `
      <section class="chiefvoice-export-page chiefvoice-export-cover">
        <div class="chiefvoice-export-cover-inner">
          <img src="${chiefVoiceLogo}" alt="ChiefVoice">
          <h1>${title}</h1>
          <p>Filter applied: ${formatRange(fromDate, toDate)}</p>
          ${filters ? `<p>Additional filters: ${filters}</p>` : ''}
        </div>
      </section>`;
    const content = pages.map(page => `
      ${pageBreak}
      <section class="chiefvoice-export-page" style="page-break-before:always;mso-break-type:page-break">
        <table role="presentation" style="width:100%;table-layout:fixed;border-collapse:collapse">
          <tbody>${buildWordRows(page.rows)}</tbody>
        </table>
      </section>
    `).join('');
    return cover + content;
  };

  const withGridSpan = (html: string, span: number) => {
    const safeSpan = Math.max(1, Math.min(12, span));
    const gridStyle = `grid-column:span ${safeSpan} / span ${safeSpan};width:100%;min-width:0;max-width:100%;height:auto;min-height:0;max-height:none;overflow:visible;box-sizing:border-box;break-inside:avoid;page-break-inside:avoid;`;
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
    const source = contentRef.current;
    if (!source) return;

    const paper = PAPER[settings.paperSize];
    const pdfPageW = settings.orientation === 'landscape' ? paper.width : paper.height;
    const pdfPageH = settings.orientation === 'landscape' ? paper.height : paper.width;

    // Capture an off-screen copy so the requested export theme never flashes
    // across the visible dashboard while html2canvas renders it.
    const scrollParent = source.parentElement;
    const captureHost = document.createElement('div');
    captureHost.className = settings.theme === 'dark' ? 'dark' : '';
    captureHost.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;';
    const captureSource = source.cloneNode(true) as HTMLElement;
    captureSource.removeAttribute('data-chiefvoice-export-root');
    captureSource.style.width = `${Math.max(1, source.getBoundingClientRect().width)}px`;
    captureSource.style.height = 'auto';
    captureSource.style.minHeight = '0';
    captureSource.style.maxHeight = 'none';
    captureSource.style.overflow = 'visible';
    captureSource.style.alignContent = 'start';
    // Keep any theme marker that lives on an app shell from overriding the
    // selected export theme through ancestor selectors.
    captureHost.setAttribute('data-theme', settings.theme);
    captureHost.appendChild(captureSource);
    document.body.appendChild(captureHost);

    try {
      await document.fonts.ready;

      captureSource.style.height = 'auto';
      captureSource.style.minHeight = '0';
      captureSource.style.maxHeight = 'none';
      captureSource.style.overflow = 'visible';
      captureSource.style.alignContent = 'start';

      // Expand widget-local scroll areas without changing their visual
      // styling. Their normal header/body/card CSS remains untouched.
      captureSource.querySelectorAll<HTMLElement>('[data-widget-scroll]').forEach(element => {
        element.style.maxHeight = 'none';
        element.style.height = 'auto';
        element.style.overflow = 'visible';
      });

      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

      const rect = captureSource.getBoundingClientRect();
      const cssWidth = Math.max(1, Math.round(rect.width));
      const cssHeight = Math.max(1, Math.ceil(captureSource.scrollHeight));
      const pageCssHeight = Math.max(1, Math.floor(cssWidth * (pdfPageH / pdfPageW)));

      const children = Array.from(captureSource.children)
        .filter(element => getComputedStyle(element as HTMLElement).display !== 'none') as HTMLElement[];

      const rowsMap = new Map<number, HTMLElement[]>();
      children.forEach(element => {
        const top = Math.round(element.offsetTop);
        const row = rowsMap.get(top) ?? [];
        row.push(element);
        rowsMap.set(top, row);
      });

      const rows = Array.from(rowsMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([top, elements]) => ({
          top,
          bottom: Math.max(...elements.map(element => element.offsetTop + element.offsetHeight)),
          height: Math.max(...elements.map(element => element.offsetHeight)),
        }));

      const groups: { start: number; end: number }[] = [];
      let current: typeof rows = [];
      let used = 0;

      for (const row of rows) {
        const gap = current.length ? 24 : 0;
        const needed = gap + row.height;
        if (current.length && used + needed > pageCssHeight) {
          groups.push({
            start: current[0].top,
            end: current[current.length - 1].bottom,
          });
          current = [];
          used = 0;
        }
        current.push(row);
        used += needed;
      }

      if (current.length) {
        groups.push({
          start: current[0].top,
          end: current[current.length - 1].bottom,
        });
      }

      if (!groups.length) {
        groups.push({ start: 0, end: cssHeight });
      }

      const exportKey = `chiefvoice-export-${Date.now()}`;
      captureSource.setAttribute('data-chiefvoice-export-root', exportKey);

      const inlineComputedStyles = (doc: Document) => {
        doc.documentElement.classList.toggle('dark', settings.theme === 'dark');
        doc.documentElement.setAttribute('data-theme', settings.theme);
        doc.body.classList.toggle('dark', settings.theme === 'dark');
        const clonedRoot = doc.querySelector(`[data-chiefvoice-export-root="${exportKey}"]`) as HTMLElement | null;
        if (!clonedRoot) return;

        const copy = (from: Element, to: Element) => {
          const computed = doc.defaultView?.getComputedStyle(to) ?? window.getComputedStyle(from);
          const target = to as HTMLElement;

          // Copy the complete resolved computed style, not a hand-picked list.
          // This resolves Tailwind v4 utilities, CSS variables, inherited values,
          // gradients, shadows, typography, borders, transforms and layout rules
          // before html2canvas parses the clone.
          for (let i = 0; i < computed.length; i++) {
            const property = computed.item(i);
            const value = computed.getPropertyValue(property);
            if (value) {
              target.style.setProperty(property, value, 'important');
            }
          }

          // Explicitly preserve custom properties too. They are used extensively
          // by the ChiefVoice theme and can otherwise disappear in a cloned DOM.
          for (let i = 0; i < computed.length; i++) {
            const property = computed.item(i);
            if (property.startsWith('--')) {
              target.style.setProperty(property, computed.getPropertyValue(property), 'important');
            }
          }

          const fromChildren = Array.from(from.children);
          const toChildren = Array.from(to.children);
          for (let i = 0; i < Math.min(fromChildren.length, toChildren.length); i++) {
            copy(fromChildren[i], toChildren[i]);
          }
        };

        copy(captureSource, clonedRoot);

        // Materialize pseudo-element content that is visually meaningful.
        const copyPseudo = (from: Element, to: Element, pseudo: '::before' | '::after') => {
          const style = doc.defaultView?.getComputedStyle(to, pseudo) ?? window.getComputedStyle(from, pseudo);
          const content = style.content;
          if (!content || content === 'none' || content === 'normal') return;

          const marker = doc.createElement('span');
          marker.textContent = content.replace(/^["']|["']$/g, '');
          marker.style.cssText =
            'display:inline-block!important;' +
            'box-sizing:border-box!important;' +
            'font:inherit!important;' +
            'color:inherit!important;' +
            'background:inherit!important;' +
            'border:inherit!important;' +
            'position:static!important;';
          if (pseudo === '::before') to.insertBefore(marker, to.firstChild);
          else to.appendChild(marker);
        };

        const walk = (from: Element, to: Element) => {
          copyPseudo(from, to, '::before');
          copyPseudo(from, to, '::after');
          const fromChildren = Array.from(from.children);
          const toChildren = Array.from(to.children);
          for (let i = 0; i < Math.min(fromChildren.length, toChildren.length); i++) {
            walk(fromChildren[i], toChildren[i]);
          }
        };

        walk(captureSource, clonedRoot);
      };

      const fullCanvas = await html2canvas(captureSource, {
        backgroundColor: '#ffffff',
        scale: 1.5,
        useCORS: true,
        allowTaint: false,
        logging: false,
        width: cssWidth,
        height: cssHeight,
        windowWidth: Math.max(window.innerWidth, cssWidth),
        windowHeight: Math.max(window.innerHeight, cssHeight),
        scrollX: 0,
        scrollY: 0,
        imageSmoothing: true,
        imageSmoothingQuality: 'high',
        foreignObjectRendering: false,
        onclone: inlineComputedStyles,
      });

      const mmToPx = 96 / 25.4;
      const pageCanvasW = Math.ceil(pdfPageW * mmToPx * 1.5);
      const pageCanvasH = Math.ceil(pdfPageH * mmToPx * 1.5);
      const canvasScale = fullCanvas.width / cssWidth;

      const images: { data: string; width: number; height: number }[] = [];

      // Generate the cover as its own page.
      const coverHost = document.createElement('div');
      coverHost.style.cssText = [
        'position:absolute',
        'left:-100000px',
        'top:0',
        `width:${Math.ceil(pdfPageW * mmToPx)}px`,
        `height:${Math.ceil(pdfPageH * mmToPx)}px`,
        'background:#fff',
      ].join(';');
      coverHost.innerHTML = `
        <section style="width:${pdfPageW}mm;height:${pdfPageH}mm;box-sizing:border-box;padding:10mm;background:#fff;display:flex;align-items:center;justify-content:center;text-align:center;">
          <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
            <img src="${chiefVoiceLogo}" alt="ChiefVoice" style="width:110px;height:110px;object-fit:contain;margin:0 0 28px 0;">
            <h1 style="font-size:30px;line-height:1.2;margin:0 0 10px 0;font-weight:700;color:#101A3A;">${title}</h1>
            <p style="font-size:14px;line-height:1.5;margin:0;color:#475569;">Filter applied: ${formatRange(fromDate, toDate)}</p>
          </div>
        </section>`;
      document.body.appendChild(coverHost);
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const coverCanvas = await html2canvas(coverHost.firstElementChild as HTMLElement, {
        backgroundColor: '#ffffff',
        scale: 1.5,
        useCORS: true,
        allowTaint: false,
        logging: false,
        width: Math.ceil(pdfPageW * mmToPx),
        height: Math.ceil(pdfPageH * mmToPx),
        windowWidth: Math.ceil(pdfPageW * mmToPx),
        windowHeight: Math.ceil(pdfPageH * mmToPx),
      });
      coverHost.remove();

      images.push({
        data: coverCanvas.toDataURL('image/jpeg', 0.94),
        width: coverCanvas.width,
        height: coverCanvas.height,
      });

      // Crop the exact mounted dashboard canvas. No widget HTML is rebuilt,
      // so visual styles remain identical to the live dashboard.
      for (const group of groups) {
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = pageCanvasW;
        sliceCanvas.height = pageCanvasH;
        const ctx = sliceCanvas.getContext('2d');
        if (!ctx) continue;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pageCanvasW, pageCanvasH);

        const sourceY = Math.max(0, Math.round(group.start * canvasScale));
        const sourceH = Math.max(1, Math.min(
          fullCanvas.height - sourceY,
          Math.round((group.end - group.start) * canvasScale),
        ));

        const destinationH = Math.min(
          pageCanvasH,
          Math.round(sourceH * (pageCanvasW / fullCanvas.width)),
        );

        ctx.drawImage(
          fullCanvas,
          0, sourceY, fullCanvas.width, sourceH,
          0, 0, pageCanvasW, destinationH,
        );

        images.push({
          data: sliceCanvas.toDataURL('image/jpeg', 0.94),
          width: sliceCanvas.width,
          height: sliceCanvas.height,
        });
      }

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
        contentIds.push(addObject(
          '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream'
        ));
        pageIds.push(addObject(
          '<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 ' +
          pageWidthPt + ' ' + pageHeightPt +
          '] /Resources << /XObject << /Im' + (i + 1) + ' ' + imageIds[i] +
          ' 0 R >> >> /Contents ' + contentIds[i] + ' 0 R >>'
        ));
      }

      objects[catalogId - 1] = '<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>';
      objects[pagesId - 1] = '<< /Type /Pages /Count ' + pageIds.length +
        ' /Kids [' + pageIds.map(id => id + ' 0 R').join(' ') + '] >>';

      let pdf = '%PDF-1.4\n%\xFF\xFF\xFF\xFF\n';
      const offsets = [0];
      objects.forEach((obj, index) => {
        offsets[index + 1] = pdf.length;
        pdf += (index + 1) + ' 0 obj\n' + obj + '\nendobj\n';
      });

      const xref = pdf.length;
      pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
      for (let i = 1; i <= objects.length; i++) {
        pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
      }
      pdf += 'trailer\n<< /Size ' + (objects.length + 1) +
        ' /Root ' + catalogId + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF';

      const pdfBytes = new Uint8Array(pdf.length);
      for (let i = 0; i < pdf.length; i++) pdfBytes[i] = pdf.charCodeAt(i) & 255;

      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = title.split(' ').join('_') + '.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      captureSource.removeAttribute('data-chiefvoice-export-root');
      captureHost.remove();
    }
  };

  const downloadDoc = () => {
    if (!pages.length) return;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
      <style>
        ${collectStyles()}
        @page { size:${paper.css} ${settings.orientation}; margin:0; }
        html,body{margin:0;padding:0;background:#fff;color:#111827}
        .chiefvoice-export-page{width:${pageW}mm;height:${pageH}mm;box-sizing:border-box;padding:10mm;margin:0;overflow:hidden;page-break-inside:avoid;mso-break-inside:avoid}
        .chiefvoice-export-cover{page-break-after:always;mso-break-type:page-break}
        .chiefvoice-word-page-break{page-break-before:always;mso-break-type:page-break}
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

            {settings.format === 'pdf' && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">PDF theme</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['light', 'dark'] as ExportTheme[]).map(theme => (
                    <button key={theme} onClick={() => setSettings(s => ({ ...s, theme }))}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold capitalize transition ${settings.theme === theme ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-[var(--border)] text-[var(--text-secondary)]'}`}>
                      {theme}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-xs text-[var(--text-muted)] leading-relaxed">
              Each export page is laid out independently. Width always follows the dashboard's 12-column grid; whole rows move to the next page when the available paper height is exhausted.
            </div>

            <button onClick={() => settings.format === 'pdf' ? void downloadPdf() : downloadDoc()}
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
