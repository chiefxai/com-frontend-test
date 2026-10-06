import { DEFAULT_INDUSTRY_KEY, getIndustryProfile } from './registry';
import type { OrganizationSettings } from '../../types';
import type { ResolvedIndustryContext } from './types';

export function resolveIndustryContext(
  settings?: Pick<OrganizationSettings, 'industry' | 'businessType'> | null,
): ResolvedIndustryContext {
  const industry = settings?.industry || DEFAULT_INDUSTRY_KEY;
  const profile = getIndustryProfile(industry);
  const businessType = settings?.businessType || Object.keys(profile.businessTypes)[0];

  return { industry: profile.key, businessType, profile, labels: profile.labels };
}
