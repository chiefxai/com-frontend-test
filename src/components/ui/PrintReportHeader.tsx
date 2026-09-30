import React from 'react';
import chiefVoiceLogo from '../../assets/chiefvoice-logo.webp';

export const PRINT_PAGE_STYLE = `
  @page { size: A4 portrait; margin: 12mm; }
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

  .chiefvoice-print-filter {
    display: none !important;
  }

  .chiefvoice-print-header,
  .chiefvoice-print-page-break {
    display: none !important;
  }

  @media print {
    .chiefvoice-print-header {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: flex-start !important;
      width: 100% !important;
      height: 273mm !important;
      min-height: 273mm !important;
      max-height: 273mm !important;
      box-sizing: border-box !important;
      padding-top: 28mm !important;
      text-align: center !important;
      break-after: avoid !important;
      page-break-after: avoid !important;
    }

    .chiefvoice-print-header > div {
      width: 100% !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: flex-start !important;
      border-bottom: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    .chiefvoice-print-header img {
      width: 110px !important;
      height: 110px !important;
      margin: 0 0 28px 0 !important;
      object-fit: contain !important;
      order: -1 !important;
    }

    .chiefvoice-print-header > div > div {
      text-align: center !important;
    }

    .chiefvoice-print-header > div > div:first-child {
      font-size: 30px !important;
      line-height: 1.2 !important;
      margin-bottom: 10px !important;
    }

    .chiefvoice-print-header > div > div:last-child {
      font-size: 14px !important;
      line-height: 1.5 !important;
    }

    .chiefvoice-print-page-break {
      display: block !important;
      height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      break-before: page !important;
      page-break-before: always !important;
    }

    .chiefvoice-print-content {
      display: grid !important;
      grid-template-columns: repeat(12, minmax(0, 1fr)) !important;
      align-items: start !important;
      gap: 16px !important;
    }

    .chiefvoice-print-content > :not(.chiefvoice-print-header):not(.chiefvoice-print-filter):not(.chiefvoice-print-page-break) {
      width: auto !important;
      max-width: none !important;
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      overflow: visible !important;
      align-self: start !important;
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }

    .chiefvoice-print-content > :not(.chiefvoice-print-header):not(.chiefvoice-print-filter):not(.chiefvoice-print-page-break) * {
      max-height: none !important;
      overflow: visible !important;
    }

    .chiefvoice-print-content [data-widget-scroll] {
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
    }

    .chiefvoice-print-content table {
      width: 100% !important;
      max-width: 100% !important;
      table-layout: auto !important;
    }
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
    <>
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
      </div>
      <div className="chiefvoice-print-page-break" aria-hidden="true" />
    </>
  );
}
