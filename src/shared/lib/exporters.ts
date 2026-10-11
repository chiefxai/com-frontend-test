import { buildCSV } from './csvSafe';

/**
 * Shared document export utilities.
 *
 * CSV  — RFC 4180 compliant: fields with commas, quotes, or newlines are
 *         quoted; internal double-quotes are escaped as "".
 * PDF  — Captures a DOM element with html2canvas, then embeds the canvas
 *         into a jsPDF document. Results look identical to the on-screen UI.
 */

// ── CSV ──────────────────────────────────────────────────────────────────────

export function downloadCSV(filename: string, headers: string[], rows: unknown[][]): void {
  const csv = buildCSV(headers, rows);
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel UTF-8
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── PDF ──────────────────────────────────────────────────────────────────────

export async function downloadPDF(
  elementId: string,
  filename: string,
  onProgress?: (pct: number) => void
): Promise<void> {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const el = document.getElementById(elementId);
  if (!el) throw new Error(`Element #${elementId} not found`);

  onProgress?.(10);

  const canvas = await html2canvas(el, {
    scale: 2,           // 2× for sharp text on retina
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: el.scrollWidth,
    windowHeight: el.scrollHeight,
  });

  onProgress?.(70);

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const usableW = pageW - margin * 2;
  const imgH = (canvas.height / canvas.width) * usableW;

  // Paginate: if content is taller than one A4 page, split across pages.
  let yOffset = 0;
  while (yOffset < imgH) {
    if (yOffset > 0) pdf.addPage();
    pdf.addImage(imgData, 'PNG', margin, margin - yOffset, usableW, imgH);
    yOffset += pageH - margin * 2;
  }

  onProgress?.(95);
  pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
  onProgress?.(100);
}
