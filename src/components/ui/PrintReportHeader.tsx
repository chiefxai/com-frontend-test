import React from 'react';
import chiefVoiceLogo from '../../assets/chiefvoice-logo.webp';

export const PRINT_PAGE_STYLE = `
  @page { size: auto; margin: 10mm; }
  html, body { height: auto !important; overflow: visible !important; }
  .chiefvoice-print-content {
    display: block !important;
    width: 100% !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }
  .chiefvoice-print-filter { display: none !important; }
  .chiefvoice-print-header { display: none !important; }
  @media print {
    .chiefvoice-print-header {
      display: block !important;
      break-after: page !important;
      page-break-after: always !important;
    }
  }
  .chiefvoice-print-content > * {
    display: flex !important;
    width: 100% !important;
    max-width: none !important;
    grid-column: auto !important;
    grid-row: auto !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
    margin: 0 0 12px 0 !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }
  .chiefvoice-print-content [data-widget-scroll] {
    max-height: none !important;
    height: auto !important;
    overflow: visible !important;
  }
`;

export function formatPrintDateRange(from: string, to: string): string {
  const format = (value: string) =>
    new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  return `${format(from)} – ${format(to)}`;
}

interface PrintReportHeaderProps {
  title: string;
  fromDate: string;
  toDate: string;
  filters?: React.ReactNode;
}

export default function PrintReportHeader({
  title,
  fromDate,
  toDate,
  filters,
}: PrintReportHeaderProps) {
  return (
    <div className="chiefvoice-print-header col-span-12" aria-hidden="true" style={{ display: 'none' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 0 18px 0',
          marginBottom: 18,
          borderBottom: '1px solid #d1d5db',
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 5 }}>
            {title}
          </div>
          <div style={{ fontSize: 12, color: '#4b5563' }}>
            Filter applied: {formatPrintDateRange(fromDate, toDate)}
            {filters ? <> · {filters}</> : null}
          </div>
        </div>
        <img
          src={chiefVoiceLogo}
          alt="ChiefVoice"
          style={{ height: 34, width: 'auto', objectFit: 'contain' }}
        />
      </div>
    </div>
  );
}
