import { apiFetch } from '../api';
import type {
  AllocationRule, BillingContact, BillingMutationOptions, BillingOverview, BillingNotification,
  CursorPage, PaymentRequest, WorkspaceBillingOverview,
} from './types';

export class BillingApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;
  readonly refreshRequired: boolean;

  constructor(message: string, options: { code?: string; status: number; details?: unknown }) {
    super(message);
    this.name = 'BillingApiError';
    this.code = options.code || 'BILLING_REQUEST_FAILED';
    this.status = options.status;
    this.details = options.details;
    this.refreshRequired = options.status === 409 || options.status === 412 || this.code === 'VERSION_CONFLICT';
  }
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new BillingApiError(payload?.error || payload?.message || `Billing request failed (${response.status}).`, {
      code: payload?.code, status: response.status, details: payload?.details,
    });
  }
  return payload as T;
}

function queryPath(path: string, cursor?: string | null, limit?: number): string {
  const query = new URLSearchParams();
  if (cursor) query.set('cursor', cursor);
  if (limit !== undefined) query.set('limit', String(limit));
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

function mutationHeaders(options: BillingMutationOptions): HeadersInit {
  if (!options.idempotencyKey.trim()) throw new TypeError('A stable idempotency key is required for billing mutations.');
  const headers: Record<string, string> = { 'Idempotency-Key': options.idempotencyKey };
  if (options.expectedVersion !== undefined) headers['If-Match'] = String(options.expectedVersion);
  return headers;
}

export function newBillingIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `billing-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Keep one key with a user action and call execute() again only to retry that same action. */
export function createBillingMutation<T>(send: (options: BillingMutationOptions) => Promise<T>, expectedVersion?: number) {
  const options = Object.freeze({ idempotencyKey: newBillingIdempotencyKey(), expectedVersion });
  return Object.freeze({ idempotencyKey: options.idempotencyKey, execute: () => send(options) });
}

export const billingClient = Object.freeze({
  organizationOverview: () => jsonRequest<BillingOverview>('/api/billing/overview'),
  workspaceOverview: (workspaceId: string) => jsonRequest<WorkspaceBillingOverview>(`/api/billing/workspaces/${encodeURIComponent(workspaceId)}/overview`),
  payments: (cursor?: string | null, limit = 25) => jsonRequest<CursorPage<PaymentRequest>>(queryPath('/api/billing/payments', cursor, limit)),
  invoices: <T = unknown>(cursor?: string | null, limit = 25) => jsonRequest<CursorPage<T>>(queryPath('/api/billing/invoices', cursor, limit)),
  contacts: () => jsonRequest<BillingContact[]>('/api/billing/contacts'),
  notifications: (cursor?: string | null, limit = 25) => jsonRequest<CursorPage<BillingNotification>>(queryPath('/api/notifications', cursor, limit)),

  submitPayment: (input: Record<string, unknown>, options: BillingMutationOptions) => jsonRequest<PaymentRequest>('/api/billing/payments', {
    method: 'POST', headers: mutationHeaders(options), body: JSON.stringify(input),
  }),
  /** Upload a private receipt using the backend's multipart payment contract.
   *  The same mutation key must be reused when retrying the same submission.
   *  Available only after the backend payment-submission rollout flag is enabled.
   */
  submitPaymentWithProof: (input: Record<string, unknown>, proof: File, options: BillingMutationOptions) => {
    const form = new FormData();
    form.append('command', JSON.stringify(input));
    form.append('proof', proof, proof.name);
    return jsonRequest<PaymentRequest>('/api/billing/payments', {
      method: 'POST', headers: mutationHeaders(options), body: form,
    });
  },
  previewAllocation: <T = unknown>(input: Record<string, unknown>) => jsonRequest<T>('/api/billing/allocations/preview', {
    method: 'POST', body: JSON.stringify(input),
  }),
  transferCredits: <T = unknown>(input: Record<string, unknown>, options: BillingMutationOptions) => jsonRequest<T>('/api/billing/transfers', {
    method: 'POST', headers: mutationHeaders(options), body: JSON.stringify(input),
  }),
  allocationRules: (kind: 'subscription' | 'topup') => jsonRequest<{ version: number; rules: AllocationRule[] }>(`/api/billing/allocation-rules/${kind}`),
  saveAllocationRules: (kind: 'subscription' | 'topup', input: Record<string, unknown>, options: BillingMutationOptions) => jsonRequest<{ version: number; rules: AllocationRule[] }>(`/api/billing/allocation-rules/${kind}`, {
    method: 'PUT', headers: mutationHeaders(options), body: JSON.stringify(input),
  }),
  markNotificationRead: (notificationId: string, options: BillingMutationOptions) => jsonRequest<{ readAt: string }>(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'POST', headers: mutationHeaders(options), body: JSON.stringify({}),
  }),
  markAllNotificationsRead: (options: BillingMutationOptions) => jsonRequest<{ updated: number }>('/api/notifications/read-all', {
    method: 'POST', headers: mutationHeaders(options), body: JSON.stringify({}),
  }),
});
