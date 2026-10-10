export type WorkspaceMode = 'single' | 'same_industry' | 'mixed_industry';
export interface WorkspacePlan {
  id: string;
  name: string;
  active: boolean;
  defaultMode: WorkspaceMode;
  /** Combined retention + backup template assigned to this subscription plan. */
  retentionPolicyId?: string | null;
  pricing: { baseMonthlyInr: number | null; includedWorkspaces: number; maxWorkspaces: number | null; extraWorkspaceMonthlyInr: number | null; includedSeats: number; maxSeats: number | null; extraSeatMonthlyInr: number | null; additionalIndustryMonthlyInr: number | null; monthlySubscriptionCreditsInr?: number };
  industryModules: Record<string, string[]>;
}
export interface WorkspacePlanCatalog { version: number; plans: WorkspacePlan[] }
export interface WorkspacePolicyDraft {
  mode: WorkspaceMode;
  pricing: { baseMonthlyInr: number | null; includedWorkspaces: number; maxWorkspaces: number | null; extraWorkspaceMonthlyInr: number | null; includedSeats: number; maxSeats: number | null; extraSeatMonthlyInr: number | null; additionalIndustryMonthlyInr: number | null };
}
