export type WorkspaceMode = 'single' | 'same_industry' | 'mixed_industry';
export interface WorkspacePlan {
  id: string;
  name: string;
  active: boolean;
  defaultMode: WorkspaceMode;
  /** Combined retention + backup template assigned to this subscription plan. */
  retentionPolicyId?: string | null;
  pricing: { baseMonthlyInr: number | null; includedWorkspaces: number; additionalIndustryMonthlyInr: number | null; monthlySubscriptionCreditsInr?: number };
}
export interface WorkspacePlanCatalog { version: number; plans: WorkspacePlan[] }
export interface WorkspacePolicyDraft {
  mode: WorkspaceMode;
  pricing: { baseMonthlyInr: number | null; includedWorkspaces: number; additionalIndustryMonthlyInr: number | null };
}
export const emptyWorkspacePolicy: WorkspacePolicyDraft = { mode: 'single', pricing: { baseMonthlyInr: null, includedWorkspaces: 1, additionalIndustryMonthlyInr: null } };
export const workspaceModes: {value: WorkspaceMode; label: string; description: string}[] = [
  { value:'single', label:'Single workspace', description:'The subscription includes one workspace.' },
  { value:'same_industry', label:'Multiple branches · same industry', description:'The subscription includes the configured number of workspaces in the primary industry.' },
  { value:'mixed_industry', label:'Multiple workspaces · different industries', description:'The subscription includes the configured number of workspaces. Additional industries may have a separate charge.' },
];
export function serializedPolicy(draft: WorkspacePolicyDraft) {
  const pricing = { ...draft.pricing, includedWorkspaces: draft.mode === 'single' ? 1 : draft.pricing.includedWorkspaces,
    additionalIndustryMonthlyInr: draft.mode === 'mixed_industry' ? draft.pricing.additionalIndustryMonthlyInr : 0 };
  if (Object.values(pricing).some(value => value === null || !Number.isFinite(value) || value < 0)) throw new Error('Set the monthly prices, entering 0 for any included service.');
  return { mode:draft.mode, pricing };
}
export function monthlyPreview(draft: WorkspacePolicyDraft, primaryIndustry: string, workspaces: {industry:string}[]) {
  const p = draft.pricing;
  if (p.baseMonthlyInr === null || (draft.mode === 'mixed_industry' && p.additionalIndustryMonthlyInr === null)) return null;
  return p.baseMonthlyInr + new Set(workspaces.map(w=>w.industry).filter(i=>i!==primaryIndustry)).size*(p.additionalIndustryMonthlyInr || 0);
}
