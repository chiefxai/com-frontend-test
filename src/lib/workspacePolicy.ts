export type WorkspaceMode = 'single' | 'same_industry' | 'mixed_industry';
export interface WorkspacePolicyDraft {
  mode: WorkspaceMode;
  pricing: { baseMonthlyInr: number | null; includedWorkspaces: number; extraWorkspaceMonthlyInr: number | null; additionalIndustryMonthlyInr: number | null };
}
export const emptyWorkspacePolicy: WorkspacePolicyDraft = { mode: 'single', pricing: { baseMonthlyInr: null, includedWorkspaces: 1, extraWorkspaceMonthlyInr: null, additionalIndustryMonthlyInr: null } };
export const workspaceModes: {value: WorkspaceMode; label: string; description: string}[] = [
  { value:'single', label:'Single workspace', description:'One branch initially. The organization admin can add same-industry branches after accepting the configured price.' },
  { value:'same_industry', label:'Multiple branches · same industry', description:'Organization admins can create branches using the primary industry.' },
  { value:'mixed_industry', label:'Multiple workspaces · different industries', description:'Platform admins can add different industries. Organization admins can add branches in the primary industry only.' },
];
export function serializedPolicy(draft: WorkspacePolicyDraft) {
  const pricing = { ...draft.pricing, additionalIndustryMonthlyInr: draft.mode === 'mixed_industry' ? draft.pricing.additionalIndustryMonthlyInr : 0 };
  if (Object.values(pricing).some(value => value === null || !Number.isFinite(value) || value < 0)) throw new Error('Set the monthly prices, entering 0 for any included service.');
  return { mode:draft.mode, pricing };
}
export function monthlyPreview(draft: WorkspacePolicyDraft, primaryIndustry: string, workspaces: {industry:string}[]) {
  const p = draft.pricing;
  if (p.baseMonthlyInr === null || p.extraWorkspaceMonthlyInr === null || (draft.mode === 'mixed_industry' && p.additionalIndustryMonthlyInr === null)) return null;
  return p.baseMonthlyInr + Math.max(0,workspaces.length-p.includedWorkspaces)*p.extraWorkspaceMonthlyInr
    + new Set(workspaces.map(w=>w.industry).filter(i=>i!==primaryIndustry)).size*(p.additionalIndustryMonthlyInr || 0);
}
