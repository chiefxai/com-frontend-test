import { describe, expect, it } from 'vitest';
import { getIndustryProfile, INDUSTRY_PROFILES } from '../registry';
import { validateIndustryProfile } from '../validate';
import { domainRecordToLegacyLead } from '../domainRecord';

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

  it('adapts generic records to the legacy Lead boundary without industry knowledge', () => {
    const lead = domainRecordToLegacyLead({
      id: 'customer-1',
      objectKey: 'contact',
      stageKey: 'qualified',
      values: {
        customerName: 'Arun',
        phone: '+919999999999',
        email: 'arun@example.com',
        source: 'Website',
        tags: ['vip'],
      },
    }, 'Qualified');

    expect(lead.id).toBe('customer-1');
    expect(lead.name).toBe('Arun');
    expect(lead.phone).toBe('+919999999999');
    expect(lead.status).toBe('Qualified');
    expect(lead.tags).toEqual(['vip']);
  });
});
