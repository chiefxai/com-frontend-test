import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

/** Whole-collection syncs only succeed after the API acknowledges the write. */
export async function postWorkspaceSync(url: string, data: unknown): Promise<void> {
  const response = await apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body?.error === 'string' && body.error
      ? body.error : `Save failed (${response.status})`);
  }
}

/** Debounce repeated state changes and surface a retryable, user-visible error. */
export function useDebouncedSync(url: string, data: unknown, enabled: boolean, delay = 800) {
  const [error, setError] = useState<string | null>(null);
  const [retrySequence, setRetrySequence] = useState(0);
  const retry = useCallback(() => setRetrySequence(value => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    const timer = window.setTimeout(() => {
      void postWorkspaceSync(url, data).then(() => {
        if (current) setError(null);
      }).catch(reason => {
        if (!current) return;
        const message = reason instanceof Error ? reason.message : 'Unable to save changes.';
        console.error(`Workspace sync failed at ${url}:`, reason);
        setError(message);
      });
    }, delay);
    return () => { current = false; window.clearTimeout(timer); };
  }, [data, delay, enabled, retrySequence, url]);

  return { error, retry };
}
