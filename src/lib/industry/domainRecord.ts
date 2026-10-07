export interface DomainRecord {
  id: string;
  objectKey: string;
  stageKey?: string | null;
  values: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

/** Canonical identity fields shared by contact-like records. */
export interface DomainRecordIdentity {
  name: string;
  phone?: string;
  email?: string;
}

/** A normalized view of a record used by generic list/search experiences. */
export interface DomainRecordSummary extends DomainRecord {
  identity: DomainRecordIdentity;
}

/**
 * Reads a canonical identity from arbitrary industry fields without making
 * the UI aware of a specific industry's schema.
 */
export function getDomainRecordIdentity(record: DomainRecord): DomainRecordIdentity {
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

  return {
    name: firstString('name', 'customerName', 'studentName', 'contactName') || 'Unnamed Contact',
    phone: firstString('phone', 'parentPhone') || undefined,
    email: firstString('email') || undefined,
  };
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
): import('../../types').Lead {
  const values = record.values;
  const identity = getDomainRecordIdentity(record);

  const numeric = (...keys: string[]) => {
    for (const key of keys) {
      const value = Number(values[key]);
      if (Number.isFinite(value) && value !== 0) return value;
    }
    return 0;
  };

  return {
    id: record.id,
    name: identity.name,
    phone: identity.phone || '',
    email: identity.email || '',
    gender: (() => {
      const value = values.gender ?? values.sex;
      return value !== undefined && value !== null ? String(value) : undefined;
    })(),
    amountRequested: numeric('budget', 'orderValue'),
    score: 0,
    source: (() => {
      const value = values.source ?? values.channel;
      return value !== undefined && value !== null ? String(value) : '';
    })(),
    status: (stageLabel || 'New') as import('../../types').Lead['status'],
    tags: Array.isArray(values.tags) ? values.tags as string[] : [],
    createdAt: record.createdAt || new Date().toISOString(),
    notes: (() => {
      const value = values.notes ?? values.condition;
      return value !== undefined && value !== null ? String(value) : '';
    })(),
  };
}
