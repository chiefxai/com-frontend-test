// Generic client-side CSV export — builds a CSV string from whatever rows
// + field getters the caller passes and triggers a browser download. No
// backend involved; used by ExportCsvModal (the field picker UI) so a
// page just needs to describe its own exportable fields once.

export interface CsvField<T> {
  key: string;
  label: string;
  getValue: (row: T) => string | number | null | undefined;
}

function escapeCsvCell(value: string, protectFormula = true): string {
  // Spreadsheet programs can evaluate a CSV cell as a formula even when the
  // field is correctly quoted. Prefix untrusted text with an apostrophe when
  // it begins with a formula operator (possibly after control/space chars).
  // Callers pass actual numbers as numbers so legitimate negative amounts
  // remain numeric rather than being rewritten as text.
  const safe = protectFormula && /^[\u0000-\u0020]*[=+\-@]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

export function serializeCsv<T>(rows: T[], fields: CsvField<T>[]): string {
  const header = fields.map((f) => escapeCsvCell(f.label)).join(',');
  const lines = rows.map((row) =>
    fields.map((f) => {
      const value = f.getValue(row);
      return escapeCsvCell(String(value ?? ''), typeof value !== 'number');
    }).join(',')
  );
  return [header, ...lines].join('\n');
}

export function exportToCsv<T>(filename: string, rows: T[], fields: CsvField<T>[]): void {
  const csv = serializeCsv(rows, fields);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
