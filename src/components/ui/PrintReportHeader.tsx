import React from 'react';
import chiefVoiceLogo from '../../assets/chiefvoice-logo.webp';

export const PRINT_PAGE_STYLE = \`
  @page {
    size: 297mm 210mm;
    margin: 10mm !important;
  }

  html,
  body {
    width: auto !important;
    height: auto !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
    background: #fff !important;
  }

  body {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .chiefvoice-print-content {
    display: grid !important;
    grid-template-columns: repeat(12, minmax(0, 1fr)) !important;
    grid-auto-flow: row !important;
    grid-auto-rows: max-content !important;
    align-items: start !important;
    gap: 24px !important;
    width: 1440px !important;
    max-width: 1440px !important;
    min-width: 1440px !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
    margin: 0 !important;
    padding: 0 !important;
    box-sizing: border-box !important;
    zoom: 0.727034 !important;
    background: #fff !important;
  }

  .chiefvoice-print-filter,
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
      width: 1440px !important;
      height: 261.35mm !important;
      min-height: 261.35mm !important;
      max-height: 261.35mm !important;
      box-sizing: border-box !important;
      padding-top: 20mm !important;
      text-align: center !important;
      break-after: avoid !important;
      page-break-after: avoid !important;
      background: #f8faff !important;
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
      width: 1440px !important;
      height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      break-before: page !important;
      page-break-before: always !important;
    }

    .chiefvoice-print-content > [class*="lg\\:col-span-1"] {
      grid-column: span 1 / span 1 !important;
    }
    .chiefvoice-print-content > [class*="lg\\:col-span-2"] {
      grid-column: span 2 / span 2 !important;
    }
    .chiefvoice-print-content > [class*="lg\\:col-span-3"] {
      grid-column: span 3 / span 3 !important;
    }
    .chiefvoice-print-content > [class*="lg\\:col-span-4"] {
      grid-column: span 4 / span 4 !important;
    }
    .chiefvoice-print-content > [class*="lg\\:col-span-5"] {
      grid-column: span 5 / span 5 !important;
    }
    .chiefvoice-print-content > [class*="md\\:col-span-6"],
    .chiefvoice-print-content > [class*="lg\\:col-span-6"],
    .chiefvoice-print-content > .col-span-6 {
      grid-column: span 6 / span 6 !important;
    }
    .chiefvoice-print-content > [class*="lg\\:col-span-7"] {
      grid-column: span 7 / span 7 !important;
    }
    .chiefvoice-print-content > [class*="lg\\:col-span-8"] {
      grid-column: span 8 / span 8 !important;
    }
    .chiefvoice-print-content > [class*="lg\\:col-span-9"] {
      grid-column: span 9 / span 9 !important;
    }
    .chiefvoice-print-content > [class*="lg\\:col-span-10"] {
      grid-column: span 10 / span 10 !important;
    }
    .chiefvoice-print-content > [class*="lg\\:col-span-11"] {
      grid-column: span 11 / span 11 !important;
    }
    .chiefvoice-print-content > .col-span-12 {
      grid-column: span 12 / span 12 !important;
    }

    .chiefvoice-print-content > :not(.chiefvoice-print-header):not(.chiefvoice-print-filter):not(.chiefvoice-print-page-break) {
      box-sizing: border-box !important;
      min-width: 0 !important;
      max-width: 100% !important;
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }

    .chiefvoice-print-content .recharts-responsive-container,
    .chiefvoice-print-content .recharts-wrapper {
      min-width: 0 !important;
      max-width: 100% !important;
    }

    .chiefvoice-print-content .recharts-surface {
      max-width: 100% !important;
    }

    .chiefvoice-print-content [data-widget-scroll] {
      overflow: hidden !important;
    }

    .chiefvoice-print-content table {
      max-width: 100% !important;
    }

    .chiefvoice-print-content select {
      appearance: auto !important;
    }
  }
\`;

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
      <div
        className="chiefvoice-print-header col-span-12"
        aria-hidden="true"
        style={{ display: 'none' }}
      >
        <div>
          <img
            src={chiefVoiceLogo}
            alt="ChiefVoice"
            style={{
              width: 110,
              height: 110,
              objectFit: 'contain',
              marginBottom: 28,
            }}
          />

          <div>
            <div
              style={{
                fontSize: 30,
                fontWeight: 700,
                lineHeight: 1.2,
                color: '#111827',
                marginBottom: 10,
              }}
            >
              {title}
            </div>

            <div style={{ fontSize: 14, lineHeight: 1.5, color: '#4b5563' }}>
              Filter applied: {formatPrintDateRange(fromDate, toDate)}
              {filters ? <> · {filters}</> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="chiefvoice-print-page-break" aria-hidden="true" />
    </>
  );
}
