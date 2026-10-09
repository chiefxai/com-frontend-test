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
