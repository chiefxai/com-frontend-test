import type { Lead } from '../../types';

export interface DomainRecord {
  id: string;
  objectKey: string;
  stageKey?: string | null;
  values: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Compatibility boundary between the generic domain-record model and the
 * legacy Lead-shaped UI APIs. New industry features should consume
 * DomainRecord directly; the adapter exists only while lending-era views
 * still require Lead.
 */
export function domainRecordToLegacyLead(
  record: DomainRecord,
  stageLabel?: string,
): Lead {
  const values = record.values;

  const firstString = (...keys: string[]) => {
    for (const key of keys) {
      const value = values[key];
      if (value !== undefined && value !== null && String(value).trim()) {
        return String(value);
      }
    }
    return '';
  };

  const numeric = (...keys: string[]) => {
    for (const key of keys) {
      const value = Number(values[key]);
      if (Number.isFinite(value) && value !== 0) return value;
    }
    return 0;
  };

  return {
    id: record.id,
    name: firstString('name', 'customerName', 'studentName', 'contactName') || 'Unnamed Contact',
    phone: firstString('phone', 'parentPhone'),
    email: firstString('email'),
    gender: firstString('gender', 'sex'),
    amountRequested: numeric('budget', 'orderValue'),
    score: 0,
    source: firstString('source', 'channel'),
    status: (stageLabel || 'New') as Lead['status'],
    tags: Array.isArray(values.tags) ? values.tags as string[] : [],
    createdAt: record.createdAt || new Date().toISOString(),
    notes: firstString('notes', 'condition'),
  };
}
