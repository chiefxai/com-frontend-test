// userFlagsStore.ts
// Plain module (no React) that fetches and caches the logged-in user's
// personal feature-flag grants from /api/settings/me.
//
// Usage:
//   import { fetchUserFlags, getGrantedFlags, hasRestriction } from './userFlagsStore';
//
//   // Call once after auth is confirmed (e.g. in App.tsx after kcUser is set):
//   await fetchUserFlags();
//
//   // Read anywhere:
//   hasRestriction()   → true if the user has a limited flag set
//   getGrantedFlags()  → string[] of allowed flag keys

import { apiFetch } from '../../lib/api';

let _granted: string[] = [];
let _orgFlags: string[] = [];
let _role: string = '';
let _loaded = false;
let _generation = 0;
let _inFlight: Promise<string[]> | null = null;

// Subscribers — FeatureFlagContext registers one to react to the fetch result.
// Passes (granted, loaded, role, orgFlags) so context can use the DB role for admin checks.
type Listener = (granted: string[], loaded: boolean, role: string, orgFlags: string[]) => void;
const _listeners: Set<Listener> = new Set();

export function subscribe(fn: Listener) {
  _listeners.add(fn);
  // If flags are already loaded, fire immediately so late subscribers sync up.
  if (_loaded) fn(_granted, _loaded, _role, _orgFlags);
  return () => _listeners.delete(fn);
}

function notify() {
  _listeners.forEach(fn => fn(_granted, _loaded, _role, _orgFlags));
}

export async function fetchUserFlags(): Promise<string[]> {
  if (_loaded) return _granted;
  if (_inFlight) return _inFlight;
  const generation = _generation;
  _inFlight = (async () => {
    try {
      const res = await apiFetch('/api/settings/me');
      if (res.ok) {
        const data = await res.json();
        if (generation !== _generation) return [];
        _granted = Array.isArray(data?.featureFlags) ? data.featureFlags : [];
        _orgFlags = Array.isArray(data?.orgFeatureFlags) ? data.orgFeatureFlags : _granted;
        _role = data?.role ?? '';
      }
      // Non-ok (403 for platform admins, etc.) — no grants, but still mark loaded
      // so the sidebar knows it can apply the "no restriction" state.
    } catch {
      // Network error — treat as no restriction
    }
    if (generation !== _generation) return [];
    _loaded = true;
    _inFlight = null;
    notify();
    return _granted;
  })();
  return _inFlight;
}

export function isLoaded(): boolean { return _loaded; }

export function getGrantedFlags(): string[] { return _granted; }
export function getOrgFlags(): string[] { return _orgFlags; }
export function hasRestriction(): boolean { return _loaded && _granted.length > 0; }

export function getMembershipRole(): string { return _role; }

// Reset — useful for logout / user switch. Notifies subscribers so they
// revert to the loading (all-disabled) state immediately.
export function resetUserFlags() {
  _generation += 1;
  _granted = [];
  _orgFlags = [];
  _role = '';
  _loaded = false;
  _inFlight = null;
  notify();
}
