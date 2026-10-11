export interface Stats {
  totalOrganizations: number;
  totalUsers: number;
  totalCalls: number;
  // Platform-wide cost, summed from each org's own accrued/locked-in
  // figures (never recomputed against today's rate) — see the Cost page
  // and platform/admin.js's getStats.
  totalPhoneChargesInr: number;
  totalAiTokenCostInr: number;
  // Orgs excluded from totalPhoneChargesInr because they connected their
  // own call-provider account (e.g. their own Vobiz) — the platform
  // never paid for those calls.
  selfManagedCallOrgCount: number;
  activeCostProviderCount: number;
  archivedOrgCount: number;
}

export interface TimeSeries {
  signupsByDay: { date: string; count: number }[];
  callsByDay: { date: string; count: number }[];
  planDistribution: { plan: string; count: number }[];
  industryDistribution: { industry: string; count: number }[];
}

export interface OrgRow {
  id: string;
  name: string;
  workspaceName: string;
  industry: string;
  subscriptionPlan: string;
  status?: 'Active' | 'Suspended';
  aiMinutesUsed: number;
  totalCostInr: number;
  billingPeriodEnd?: string;
  memberCount: number;
  leadCount: number;
  createdAt: string;
  billingMethod?: 'pay_as_you_go' | 'recharge_based';
  chargeScope?: 'ai_only' | 'ai_and_call_provider';
  rechargeBalanceInr?: number;
  rechargeReservedInr?: number;
  rechargeAvailableInr?: number;
}

export interface OrgDetail {
  id: string;
  name: string;
  workspaceName: string;
  industry: string;
  subscriptionPlan: string;
  status?: 'Active' | 'Suspended';
  aiMinutesLimit?: number | null;
  aiMinutesUsed: number;
  totalCostInr: number;
  billingPeriodEnd: string | null;
  createdAt: string;
  settings: Record<string, unknown>;
  // A successful but partially populated backend response may omit counts.
  // Missing values are unavailable, not zero. The UI displays "—".
  counts?: {
    leads?: number;
    workflows?: number;
    campaigns?: number;
    members?: number;
    workspaces?: number;
    agents?: number;
  };
  members: { id: string; name: string; email: string; role: string; status: string; hasAccount: boolean; createdAt: string }[];
  recentCalls: { id: string; callerNumber: string; agentName: string; durationSeconds: number; sentiment: string | null; recordingUrl: string | null; createdAt: string }[];
  recentActivity: { id: string; actorEmail: string | null; action: string; metadata: Record<string, unknown>; createdAt: string }[];
  billingMethod?: 'pay_as_you_go' | 'recharge_based';
  chargeScope?: 'ai_only' | 'ai_and_call_provider';
  rechargeBalanceInr?: number;
  rechargeReservedInr?: number;
  rechargeAvailableInr?: number;
}

export interface UserRow {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  orgId: string | null;
  orgName: string | null;
  role: string | null;
}


export interface AuditRow {
  id: string;
  orgId: string;
  orgName: string;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}
