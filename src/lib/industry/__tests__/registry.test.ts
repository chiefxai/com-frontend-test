import { describe, expect, it } from 'vitest';
import { getIndustryProfile, INDUSTRY_PROFILES } from '../registry';
import { validateIndustryProfile } from '../validate';

describe('industry registry', () => {
  it('contains valid built-in profiles', () => {
    for (const profile of Object.values(INDUSTRY_PROFILES)) {
      expect(validateIndustryProfile(profile)).toEqual([]);
    }
  });

  it('resolves unknown industries safely to the default profile', () => {
    expect(getIndustryProfile('future_unknown_industry').key).toBe('lending');
  });

  it('models automotive domain objects independently of CRM core objects', () => {
    const automotive = getIndustryProfile('automotive');
    const keys = automotive.domainModel?.objects.map(object => object.key) ?? [];
    expect(keys).toContain('contact');
    expect(keys).toContain('vehicle');
    expect(keys).toContain('test_drive');
    expect(keys).toContain('vehicle_sale');
  });
});
