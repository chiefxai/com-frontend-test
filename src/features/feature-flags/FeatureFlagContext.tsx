// FeatureFlagContext.tsx
// Provides feature flag state to the component tree.
// The actual fetch lives in userFlagsStore.ts — this context just subscribes.

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { FeatureFlag, FeatureFlagKey, DEFAULT_FLAGS } from './types';
import { loadFromStorage, saveToStorage } from '../../lib/storage';
import { subscribe } from './userFlagsStore';
import { can } from '../../lib/authorization';
import { useAuth } from '../auth/AuthProvider';

// Only platform-level super admins bypass org feature flag restrictions.
// Org admins are subject to the org's granted features set by the super admin.
function isAdminRole(role: string): boolean {
  return role === 'Super Admin';
}

interface FeatureFlagContextValue {
  flags: FeatureFlag[];
  orgFlags: string[];
  isEnabled: (key: FeatureFlagKey) => boolean;
  setFlag: (key: FeatureFlagKey, enabled: boolean) => void;
}

const FeatureFlagContext = createContext<FeatureFlagContextValue | null>(null);

// granted: feature keys the user is allowed to see (for org admins = org-level flags; for others = personal grants intersected with org flags)
// isAdminUser: true only for platform-level super admins who bypass all org restrictions
function buildFlags(granted: string[], loaded: boolean, isAdminUser: boolean): FeatureFlag[] {
  if (!loaded) {
    return DEFAULT_FLAGS.map(f => ({ ...f, enabled: false }));
  }
  if (isAdminUser) {
    // Platform super admins: see everything, respect local prefs
    const stored = loadFromStorage<Partial<Record<FeatureFlagKey, boolean>>>('chiefx_feature_flags', {});
    return DEFAULT_FLAGS.map(f => ({
      ...f,
      enabled: stored[f.key] !== undefined ? stored[f.key]! : f.enabled,
    }));
  }
  // All org users (including org admins): show only what the org-level grants allow
  return DEFAULT_FLAGS.map(f => ({ ...f, enabled: granted.includes(f.key) }));
}

export function FeatureFlagProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  // JWT role is used only as the initial optimistic guess while /api/settings/me is in-flight.
  // Once the store resolves, the DB membership role takes over as the authoritative source.
  const jwtIsAdmin = isAdminRole(user?.role ?? '');

  const [flags, setFlags] = useState<FeatureFlag[]>(() => buildFlags([], false, jwtIsAdmin));
  const [orgFlags, setOrgFlags] = useState<string[]>([]);

  // Re-build whenever JWT role changes (e.g. user switch) — reset to loading state.
  useEffect(() => {
    setFlags(buildFlags([], false, jwtIsAdmin));
  }, [jwtIsAdmin]);

  useEffect(() => {
    const unsub = subscribe((granted, loaded, dbRole, org) => {
      const adminByDb = can('platform.manage');
      setFlags(buildFlags(granted, loaded, adminByDb));
      setOrgFlags(org);
    });
    return unsub;
  }, []);

  const isEnabled = useCallback(
    (key: FeatureFlagKey) => flags.find(f => f.key === key)?.enabled ?? false,
    [flags]
  );

  const setFlag = useCallback((key: FeatureFlagKey, enabled: boolean) => {
    setFlags(prev => {
      const updated = prev.map(f => (f.key === key ? { ...f, enabled } : f));
      const stored = Object.fromEntries(updated.map(f => [f.key, f.enabled]));
      saveToStorage('chiefx_feature_flags', stored);
      return updated;
    });
  }, []);

  return (
    <FeatureFlagContext.Provider value={{ flags, orgFlags, isEnabled, setFlag }}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

export function useFeatureFlags() {
  const ctx = useContext(FeatureFlagContext);
  if (!ctx) throw new Error('useFeatureFlags must be used inside FeatureFlagProvider');
  return ctx;
}
