import { describe, expect, it } from 'vitest';
import { patchDomainRecord, removeDomainRecord, summarizeDomainRecords, upsertDomainRecord } from '../domainStore';
import type { DomainRecord } from '../domainRecord';

const record: DomainRecord = {
  id: 'vehicle-1',
  objectKey: 'vehicle',
  stageKey: 'available',
  values: { name: 'City Hybrid', customerName: 'Arun', phone: '+919999999999' },
};

describe('domain record collection utilities', () => {
  it('summarizes arbitrary identity fields without knowing the industry', () => {
    expect(summarizeDomainRecords([record])[0].identity).toEqual({
      name: 'Arun',
      phone: '+919999999999',
    });
  });

  it('upserts and patches records immutably', () => {
    const added = upsertDomainRecord([], record);
    const patched = patchDomainRecord(added, record.id, {
      stageKey: 'sold',
      values: { salePrice: 1250000 },
    });

    expect(patched[0].stageKey).toBe('sold');
    expect(patched[0].values).toMatchObject({
      name: 'City Hybrid',
      salePrice: 1250000,
    });
    expect(added[0].values.salePrice).toBeUndefined();
  });

  it('removes records by stable id', () => {
    expect(removeDomainRecord([record], record.id)).toEqual([]);
  });
});
