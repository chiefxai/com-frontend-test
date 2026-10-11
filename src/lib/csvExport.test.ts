import { describe, expect, it } from 'vitest';
import { buildCSV } from '../shared/lib/csvSafe';
import { serializeCsv, type CsvField } from './csvExport';

describe('spreadsheet-safe CSV text', () => {
  it('neutralizes formula prefixes while preserving real numeric values', () => {
    const fields: CsvField<{ name: string; amount: number }>[] = [
      { key: 'name', label: 'Name', getValue: row => row.name },
      { key: 'amount', label: 'Amount', getValue: row => row.amount },
    ];
    expect(serializeCsv([{ name: '=1+1', amount: -2 }], fields)).toBe("Name,Amount\n'=1+1,-2");
    expect(buildCSV(['Name'], [['\t=cmd']])).toBe("Name\r\n'\t=cmd");
  });
});
