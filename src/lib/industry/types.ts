export type IndustryKey = string;
export type BusinessTypeKey = string;

export type IndustryLabelKey =
  | 'workspace' | 'lead' | 'contact' | 'campaign' | 'pipeline'
  | 'appointment' | 'agent' | 'enquiry' | 'deal';

export interface IndustryLabel { singular: string; plural: string; }

export interface IndustryModuleDefinition {
  key: string;
  label: string;
  description?: string;
  route: string;
  tabId?: string;
  iconKey?: string;
  featureFlag?: string;
  domainSpecific?: boolean;
}

export interface IndustryPipelineStage {
  key: string;
  label: string;
  order: number;
  terminal?: 'won' | 'lost';
}

export interface IndustryProfile {
  key: IndustryKey;
  label: string;
  tagline: string;
  businessTypes: Record<BusinessTypeKey, { label: string }>;
  labels: Record<IndustryLabelKey, IndustryLabel>;
  modules: IndustryModuleDefinition[];
  pipeline: { key: string; label: string; stages: IndustryPipelineStage[] };
  domainModel?: import('./domain').IndustryDomainModel;
  metadata?: Record<string, unknown>;
}

export interface ResolvedIndustryContext {
  industry: IndustryKey;
  businessType?: BusinessTypeKey;
  profile: IndustryProfile;
  labels: IndustryProfile['labels'];
}
