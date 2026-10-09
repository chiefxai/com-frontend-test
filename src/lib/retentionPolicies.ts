/** Retention + backup policy catalog shared by platform admin screens. */
export type RetentionKey =
  | 'call_recordings' | 'transcripts' | 'ai_summaries' | 'call_logs'
  | 'campaign_history' | 'audit_logs' | 'documents' | 'contacts';
export type RetentionPeriods = Record<RetentionKey, number | null>;
export type BackupFrequency = 'daily' | 'weekly' | 'monthly';
export type RetentionBackup = {
  enabled: boolean;
  frequency: BackupFrequency;
  retentionDays: number;
};
export interface RetentionTemplate {
  id: string;
  name: string;
  description: string;
  retention: RetentionPeriods;
  backup: RetentionBackup;
}
export interface RetentionPolicyCatalog {
  version: number;
  defaultPolicyId: string;
  policies: RetentionTemplate[];
}
export const RETENTION_FIELDS: { key: RetentionKey; label: string }[] = [
  { key: 'call_recordings', label: 'Call recordings' },
  { key: 'transcripts', label: 'Transcripts' },
  { key: 'ai_summaries', label: 'AI summaries' },
  { key: 'call_logs', label: 'Call logs' },
  { key: 'campaign_history', label: 'Campaign history' },
  { key: 'audit_logs', label: 'Audit logs' },
  { key: 'documents', label: 'Documents' },
  { key: 'contacts', label: 'Contacts' },
];
export const RETENTION_DAY_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Never delete' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '180 days' },
  { value: 365, label: '1 year' },
  { value: 730, label: '2 years' },
  { value: 1095, label: '3 years' },
  { value: 1825, label: '5 years' },
  { value: 3650, label: '10 years' },
];
export const BACKUP_DAY_OPTIONS = RETENTION_DAY_OPTIONS.filter(
  (option): option is { value: number; label: string } => option.value !== null,
);
export const DEFAULT_RETENTION: RetentionPeriods = {
  call_recordings: 365, transcripts: 365, ai_summaries: 730,
  call_logs: 730, campaign_history: 365, audit_logs: 730,
  documents: 365, contacts: 365,
};
export const DEFAULT_BACKUP: RetentionBackup = {
  enabled: false, frequency: 'monthly', retentionDays: 365,
};
export function readableRetention(days: number | null | undefined): string {
  return RETENTION_DAY_OPTIONS.find(option => option.value === days)?.label
    || (days == null ? 'Never delete' : String(days) + ' days');
}
export function readableBackup(policy: RetentionTemplate): string {
  if (!policy.backup.enabled) return 'Backups disabled';
  return policy.backup.frequency[0].toUpperCase()
    + policy.backup.frequency.slice(1)
    + ' backup · kept ' + readableRetention(policy.backup.retentionDays).toLowerCase();
}
