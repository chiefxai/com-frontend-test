import { apiFetch } from '../api';
import type { BillingAmount, BillingMutationOptions } from './types';
import { BillingApiError } from './client';

export type PaymentDecision = 'approve' | 'reject' | 'request_clarification';

export interface PlatformPaymentDecisionInput {
  decision: PaymentDecision;
  expectedVersion: number;
  reason?: string;
  receivedAmount?: BillingAmount;
}

export interface PlatformPaymentDecisionResult {
  paymentRequestId: string;
  status: string;
  decision: Record<string, unknown>;
  funding: Record<string, unknown> | null;
  eventId: string;
}

/** Platform operators only; this is NOT an organization billing write. */
export async function decidePlatformPayment(
  orgId: string,
  paymentRequestId: string,
  input: PlatformPaymentDecisionInput,
  options: BillingMutationOptions,
): Promise<PlatformPaymentDecisionResult> {
  if (!options.idempotencyKey.trim()) throw new TypeError('A stable idempotency key is required.');
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new TypeError('A valid expected payment version is required.');
  }
  const headers = new Headers({ 'Idempotency-Key': options.idempotencyKey });
  const response = await apiFetch(
    `/api/platform/billing/organizations/${encodeURIComponent(orgId)}/payments/${encodeURIComponent(paymentRequestId)}/decision`,
    { method: 'POST', headers, body: JSON.stringify(input) },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new BillingApiError(payload?.error || `Payment decision failed (${response.status}).`, {
      code: payload?.code, status: response.status, details: payload?.details,
    });
  }
  return payload as PlatformPaymentDecisionResult;
}


export interface PlatformPaymentReview {
  id: string;
  orgId: string;
  purpose: 'subscription' | 'topup' | 'invoice';
  status: string;
  version: number;
  expectedAmount: BillingAmount;
  receivedAmount: BillingAmount | null;
  paymentReference: string | null;
  proofAvailable: boolean;
  submittedAt: string;
  reviewedAt: string | null;
  workspaceAddon?: {name:string;invoiceId:string};
  /** Immutable adjustment quote details for an upgrade payment, when available from the review API. */
  subscriptionUpgrade?: {
    currentPlan: { id: string; version: number };
    targetPlan: { id: string; version: number };
    prorationAmount: BillingAmount;
    incrementalIncludedCredits: BillingAmount;
    renewalAnchorAt: string;
  };
}

export async function listPlatformPaymentReviews(
  cursor?: string | null,
  status: 'pending_verification' | 'needs_clarification' | 'approved' | 'rejected' | 'all' = 'pending_verification',
): Promise<{ rows: PlatformPaymentReview[]; nextCursor: string | null }> {
  const params = new URLSearchParams({ status, limit: '30' });
  if (cursor) params.set('cursor', cursor);
  const response = await apiFetch(`/api/platform/billing/payment-reviews?${params}`);
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new BillingApiError(result?.error || 'Could not load payment review queue.', {
    code: result?.code, status: response.status,
  });
  return result;
}

export async function platformPaymentReceipt(
  orgId: string,
  paymentRequestId: string,
): Promise<{ url: string; expiresIn: number }> {
  const response = await apiFetch(
    `/api/platform/billing/organizations/${encodeURIComponent(orgId)}/payments/${encodeURIComponent(paymentRequestId)}/proof`,
  );
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new BillingApiError(result?.error || 'Could not load receipt.', {
    code: result?.code, status: response.status,
  });
  return result;
}

export interface PlatformSubscriptionGraceRequest {
  id: string;
  orgId: string;
  organizationName: string | null;
  periodId: string;
  periodStartsAt: string;
  periodEndsAt: string;
  requestedUntil: string;
  justification: string;
  requestedBy: string;
  status: 'requested' | 'approved' | 'denied' | 'revoked' | string;
  grantedUntil: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  decisions?: { decision: string; reason: string; decidedBy: string; decidedAt: string; grantedUntil: string | null }[];
}

export type PlatformGraceDecision = 'approve' | 'deny';

export async function listPlatformSubscriptionGraceRequests(status: 'requested' | 'all' = 'requested'):
  Promise<{ items: PlatformSubscriptionGraceRequest[] }> {
  const response = await apiFetch(`/api/platform/billing/subscription-grace-requests?status=${status}`);
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new BillingApiError(result?.error || 'Could not load subscription grace requests.', {
    code: result?.code, status: response.status,
  });
  return result;
}

export async function decidePlatformSubscriptionGraceRequest(
  request: PlatformSubscriptionGraceRequest,
  input: { decision: PlatformGraceDecision; reason: string; expectedVersion: number; grantedUntil?: string },
  options: { idempotencyKey: string },
): Promise<PlatformSubscriptionGraceRequest> {
  if (!options.idempotencyKey.trim()) throw new TypeError('A stable idempotency key is required.');
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new TypeError('A valid expected grace request version is required.');
  }
  if (!input.reason.trim()) throw new TypeError('A decision reason is required.');
  const response = await apiFetch(
    `/api/platform/billing/organizations/${encodeURIComponent(request.orgId)}/subscription-grace-requests/${encodeURIComponent(request.id)}/decision`,
    { method: 'POST', headers: new Headers({ 'Idempotency-Key': options.idempotencyKey }), body: JSON.stringify(input) },
  );
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new BillingApiError(result?.error || 'Could not record the grace decision.', {
    code: result?.code, status: response.status,
  });
  return result as PlatformSubscriptionGraceRequest;
}
