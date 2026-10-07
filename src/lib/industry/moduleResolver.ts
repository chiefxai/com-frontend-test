import type { IndustryModuleDefinition } from './types';
import type { IndustryProfile } from './types';

export interface ResolvedModule extends IndustryModuleDefinition {
  enabled: boolean;
}

export function resolveIndustryModules(
  profile: IndustryProfile,
  enabledFlags: Set<string> = new Set(),
): ResolvedModule[] {
  return profile.modules.map(module => ({
    ...module,
    enabled: !module.featureFlag || enabledFlags.has(module.featureFlag),
  }));
}
