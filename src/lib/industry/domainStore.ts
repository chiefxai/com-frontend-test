import type { DomainRecord, DomainRecordIdentity } from './domainRecord';
import { getDomainRecordIdentity } from './domainRecord';

export interface DomainRecordCollection {
  objectKey: string;
  records: DomainRecord[];
}

export function summarizeDomainRecords(records: DomainRecord[]): Array<DomainRecord & { identity: DomainRecordIdentity }> {
  return records.map((record) => ({
    ...record,
    identity: getDomainRecordIdentity(record),
  }));
}

export function upsertDomainRecord(records: DomainRecord[], next: DomainRecord): DomainRecord[] {
  const index = records.findIndex((record) => record.id === next.id);
  if (index < 0) return [...records, next];

  const copy = records.slice();
  copy[index] = next;
  return copy;
}

export function patchDomainRecord(
  records: DomainRecord[],
  id: string,
  patch: Partial<Pick<DomainRecord, 'stageKey' | 'values' | 'updatedAt'>>,
): DomainRecord[] {
  return records.map((record) => (
    record.id === id
      ? { ...record, ...patch, values: patch.values ? { ...record.values, ...patch.values } : record.values }
      : record
  ));
}

export function removeDomainRecord(records: DomainRecord[], id: string): DomainRecord[] {
  return records.filter((record) => record.id !== id);
}


export interface DomainRecordMutation {
  stageKey?: string | null;
  values?: Record<string, unknown>;
}

export function updateDomainRecordStage(
  records: DomainRecord[],
  id: string,
  stageKey: string | null,
  values: Record<string, unknown> = {},
): DomainRecord[] {
  return patchDomainRecord(records, id, { stageKey, values, updatedAt: new Date().toISOString() });
}

export function updateDomainRecordValues(
  records: DomainRecord[],
  id: string,
  values: Record<string, unknown>,
): DomainRecord[] {
  return patchDomainRecord(records, id, { values, updatedAt: new Date().toISOString() });
}

export function createDomainRecord(
  records: DomainRecord[],
  record: DomainRecord,
): DomainRecord[] {
  return upsertDomainRecord(records, record);
}
