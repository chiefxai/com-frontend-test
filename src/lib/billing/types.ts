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

export interface BillingMutationOptions {
  /** Keep the same key when retrying the same user action. */
  idempotencyKey: string;
  expectedVersion?: number;
}
