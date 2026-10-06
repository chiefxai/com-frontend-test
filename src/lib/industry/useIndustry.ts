import { useMemo } from 'react';
import { resolveIndustryContext } from './resolve';
import type { OrganizationSettings } from '../../types';

export function useIndustry(
  settings?: Pick<OrganizationSettings, 'industry' | 'businessType'> | null,
) {
  return useMemo(
    () => resolveIndustryContext(settings),
    [settings?.industry, settings?.businessType],
  );
}
