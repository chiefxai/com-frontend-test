// Bridges the generic industry-objects engine (services/objectsEngine.js —
// real_estate/healthcare/education/ecommerce/automotive/field_services
// records) into the Lead shape that lending-era components (DialerSimulator
// chief among them) were built around. Non-lending orgs have no `leads`
// table rows at all, so without this their Voice Simulator has nothing
// real to dial — this maps their actual Industry Objects records into
// that shape instead of leaving it empty or fabricating anything.
//
// Field names vary per pack (industryPacks.js), so name/phone/email/budget
// are resolved from whichever of that pack's actual field keys exist,
// rather than assuming one fixed schema.

import { Lead } from '../types';
import { domainRecordToLegacyLead } from './industry/domainRecord';

interface ObjectRecord {
  id: string;
  stageId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

interface ObjectStage {
  id: string;
  key: string;
  label: string;
}

interface ObjectField {
  id: string;
  key: string;
  label: string;
  type: string;
  required?: boolean;
}

export function recordToLead(record: ObjectRecord, stages: ObjectStage[], objectKey = 'primary'): Lead {
  const stage = stages.find((s) => s.id === record.stageId);
  return domainRecordToLegacyLead(
    {
      id: record.id,
      objectKey,
      stageKey: stage?.key,
      values: record,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    },
    stage?.label,
  );
}

// What DialerSimulator actually mutates on a lead (tags, notes, status via
// handleHangupCall/handleSkipLead/handleSendUtterance) — translated back
// into an object_records patch. `status` only carries through if it
// matches one of this object's real stage labels; otherwise it's dropped
// rather than guessed (same rule as workflowEngine.js's lending-pack
// bridge on the backend).
export function leadToRecordPatch(lead: Lead, stages: ObjectStage[]): { stageKey?: string; notes?: string; tags?: string[]; gender?: string } {
  const patch: { stageKey?: string; notes?: string; tags?: string[]; gender?: string } = {
    notes: lead.notes,
    tags: lead.tags,
  };
  if (lead.gender) patch.gender = lead.gender;
  const stage = stages.find((s) => s.label.toLowerCase() === lead.status.toLowerCase());
  if (stage) patch.stageKey = stage.key;
  return patch;
}

// Builds the POST body for a brand-new contact added via LeadManagementView
// or CSV bulk import. Field keys vary per industry pack (e.g. "contactName"
// vs "customerName"), so — same approach as recordToLead's firstDefined —
// this resolves the right field to write into by TYPE (phone/email/
// currency) rather than assuming one fixed key name. Without this, new
// contacts for any non-lending org were only ever added to local/localStorage
// state (leadToRecordPatch has no way to create a record, only update
// tags/notes/stage on one that already exists) — they never actually
// reached the database at all.
export function leadToRecordCreate(lead: Lead, fields: ObjectField[]): Record<string, any> {
  const data: Record<string, any> = { tags: lead.tags || [], notes: lead.notes || '' };

  const nameField = fields.find((f) => f.type === 'text' && f.required) || fields.find((f) => f.type === 'text');
  const phoneField = fields.find((f) => f.type === 'phone') || fields.find((f) => f.key === 'phone');
  const emailField = fields.find((f) => f.type === 'email') || fields.find((f) => f.key === 'email');
  const genderField = fields.find((f) => f.key === 'gender' || f.key === 'sex') || fields.find((f) => f.label?.toLowerCase() === 'gender' || f.label?.toLowerCase() === 'sex');
  const amountField = fields.find((f) => f.type === 'currency' || f.type === 'number');

  if (nameField) data[nameField.key] = lead.name;
  if (phoneField) data[phoneField.key] = lead.phone;
  if (emailField && lead.email) data[emailField.key] = lead.email;
  if (genderField && lead.gender) data[genderField.key] = lead.gender;
  if (amountField && lead.amountRequested) data[amountField.key] = lead.amountRequested;

  return data;
}


/**
 * Compatibility projection for list/pipeline views.
 * The input remains canonical DomainRecord data; Lead is only the view contract
 * until those views complete their mutation migration.
 */
export function domainRecordsToLeads(
  records: import('./industry/domainRecord').DomainRecord[],
  stages: ObjectStage[],
): Lead[] {
  return records.map((record) => recordToLead(
    {
      ...record.values,
      id: record.id,
      stageId: stages.find((stage) => stage.key === record.stageKey)?.id,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    },
    stages,
    record.objectKey,
  ));
}
