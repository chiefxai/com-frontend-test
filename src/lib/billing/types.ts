/** Billing amounts stay as integer units; never convert these values to Number. */
export interface BillingAmount {
  asset: string;
  units: string;
  scale: number;
}

export interface CursorPage<T> {
  rows: T[];
  nextCursor: string | null;
}

export type BillingPeriodStatus = 'scheduled' | 'active' | 'ended' | 'cancelled';
export type PaymentStatus = 'pending_verification' | 'needs_information' | 'approved' | 'rejected' | 'cancelled';
export type GrantKind = 'subscription' | 'topup';
/** Server-side payment history filter (applied before cursor pagination). */
export type PaymentHistoryType = 'all' | 'topup' | 'workspace' | 'subscription' | 'invoice';

export interface BillingPeriod {
  id: string;
  startsAt: string;
  endsAt: string;
  status: BillingPeriodStatus;
  termsVersion: number | null;
}

export interface CreditBalance {
  kind: GrantKind;
  available: BillingAmount;
  held: BillingAmount;
  expiresAt: string | null;
}

export interface PaymentRequest {
  id: string;
  purpose: 'subscription' | 'topup' | 'invoice';
  /** Workspace name is populated only when an invoice belongs to an add-on purchase. */
  workspaceAddonName?: string | null;
  invoiceId?: string | null;
  status: PaymentStatus;
  expectedAmount: BillingAmount;
  receivedAmount: BillingAmount | null;
  submittedAt: string;
  reviewedAt: string | null;
  informationRequest: string | null;
}

export interface BillingInvoice {
  id: string;
  status: string;
  total: BillingAmount;
  paid: BillingAmount;
  dueAt: string | null;
  issuedAt: string;
}

export interface BillingOverview {
  orgId: string;
  billingMethod: 'recharge_based' | 'pay_as_you_go';
  monthlySubscriptionCredits: BillingAmount;
  activePeriod: BillingPeriod | null;
  nextPeriod: BillingPeriod | null;
  balances: CreditBalance[];
  recentPayments: PaymentRequest[];
  outstandingInvoices: BillingInvoice[];
  subscriptionTerms: Record<string, unknown> | null;
}

export interface WorkspaceBillingOverview {
  orgId: string;
  workspaceId: string;
  workspaceName: string;
  balances: CreditBalance[];
  overallCap: BillingAmount | null;
  postpaidUsed: BillingAmount;
  postpaidLimit: BillingAmount | null;
  periodEndsAt: string | null;
  status: 'active' | 'held' | 'expired' | 'suspended';
}

export interface BillingNotification {
  id: string;
  notificationKey: string;
  eventKey: string;
  scopeType: 'organization' | 'workspace';
  scopeOwnerId: string;
  title: string;
  message: string;
  payload: Record<string, unknown>;
  occurredAt: string;
  readAt: string | null;
}

export interface BillingContact {
  id: string;
  email: string;
  displayName: string | null;
  status: 'pending_verification' | 'verified' | 'disabled';
  verifiedAt: string | null;
  preferences: Record<string, unknown>;
}

export interface AllocationRule {
  workspaceId: string;
  kind: 'fixed' | 'percentage';
  amount?: BillingAmount;
  basisPoints?: number;
}

/** Manual allocations are grant-specific: never combine currencies or expiries. */
/** Configured plan allowance and real ledger issuance are deliberately distinct. */
export interface SubscriptionCreditStatus {
  planName: string | null;
  planId: string | null;
  configuredMonthlyCredits: BillingAmount | null;
  entitlementSource: 'organization_plan_snapshot' | 'matching_platform_plan_version' | 'unverified_legacy_plan';
  issuedThisPeriod: BillingAmount | null;
  currentPeriod: { id: string; status: string; startsAt: string; endsAt: string } | null;
  state: 'unverified_plan' | 'no_included_credits' | 'awaiting_approved_subscription'
    | 'awaiting_period_activation' | 'activation_incomplete' | 'issued_to_organization_pool';
}

export interface ManualAllocationBalance {
  ownerType: 'organization' | 'workspace';
  ownerId: string;
  kind: GrantKind;
  available: BillingAmount;
  held: BillingAmount;
}
export interface ManualAllocationGrant {
  id: string;
  kind: GrantKind;
  expiresAt: string | null;
  available: BillingAmount;
  held: BillingAmount;
  positionVersion: number;
}
export interface ManualAllocationHistory {
  id: string;
  grantId: string;
  workspaceId: string;
  workspaceName: string;
  amount: BillingAmount;
  createdAt: string;
  actorId: string | null;
}
export interface ManualAllocationOverview {
  uninitialized: boolean;
  writable?: boolean;
  transfersEnabled: boolean;
  workspaces: { id: string; name: string; status: string }[];
  balances: ManualAllocationBalance[];
  grants: ManualAllocationGrant[];
  history: ManualAllocationHistory[];
}
export interface ManualAllocationPreview {
  grantId: string;
  workspaceId: string;
  workspaceName: string;
  kind: GrantKind;
  amount: BillingAmount;
  remaining: BillingAmount;
  expiresAt: string | null;
  expectedPositionVersion: number;
  transfersEnabled: boolean;
}

export interface BillingMutationOptions {
  /** Keep the same key when retrying the same user action. */
  idempotencyKey: string;
  expectedVersion?: number;
}
