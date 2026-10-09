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
