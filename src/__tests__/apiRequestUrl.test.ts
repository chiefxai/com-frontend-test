import { describe, expect, it } from 'vitest';
import { resolveApiRequestUrl } from '../lib/apiRequestUrl';

describe('authenticated API URL origin validation', () => {
  const api = 'https://api.example.test';
  const app = 'https://crm.example.test';
  it('allows the configured API origin for relative and absolute URLs', () => {
    expect(resolveApiRequestUrl('/api/settings/me', api, app)).toBe(api + '/api/settings/me');
    expect(resolveApiRequestUrl(api + '/api/settings/me', api, app)).toBe(api + '/api/settings/me');
  });
  it('allows same-origin development requests without a configured base', () => {
    expect(resolveApiRequestUrl('/api/settings/me', '', app)).toBe('/api/settings/me');
  });
  it('rejects untrusted absolute URLs before a bearer token can be sent', () => {
    expect(() => resolveApiRequestUrl('https://attacker.example.test/collect', api, app)).toThrow(/unapproved API origin/);
    expect(() => resolveApiRequestUrl(app + '/api/settings/me', api, app)).toThrow(/unapproved API origin/);
  });
  it('blocks scheme-relative cross-origin requests when the base is empty', () => {
    expect(() => resolveApiRequestUrl('//attacker.example.test/collect', '', app)).toThrow(/unapproved API origin/);
  });
  it('rejects a mismatched protocol even when the hostname is the same', () => {
    expect(() => resolveApiRequestUrl('http://api.example.test/api', api, app)).toThrow(/unapproved API origin/);
  });
});
