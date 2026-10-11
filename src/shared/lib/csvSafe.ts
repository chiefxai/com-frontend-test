/** Protect CSV text opened by spreadsheet applications from formula execution. */
export function escapeCSVField(value: unknown): string {
  const str = value == null ? '' : String(value);
  const safe = typeof value === 'string' && /^[\u0000-\u0020]*[=+\-@]/.test(str) ? `'${str}` : str;
  if (safe.includes(',') || safe.includes('"') || safe.includes('\n') || safe.includes('\r')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function buildCSV(headers: unknown[], rows: unknown[][]): string {
  return [headers.map(escapeCSVField).join(','), ...rows.map(row => row.map(escapeCSVField).join(','))].join('\r\n');
}
