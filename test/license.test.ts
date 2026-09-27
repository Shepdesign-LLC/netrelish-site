import { describe, it, expect } from 'vitest';
import { hmacLicenser, LICENSE_KEY } from '../src/lib/license';

describe('hmacLicenser', () => {
  it('derives a stable, well-formed key from the subject', async () => {
    const issue = hmacLicenser('s3cret');
    const a = await issue('cus_1:sub_1');
    expect(a).toMatch(LICENSE_KEY);
    expect(a).toMatch(/^NR-/);
    expect(await issue('cus_1:sub_1')).toBe(a);
  });

  it('changes with the subject, the secret, and the prefix', async () => {
    const a = await hmacLicenser('s3cret')('cus_1:sub_1');
    expect(await hmacLicenser('s3cret')('cus_1:sub_2')).not.toBe(a);
    expect(await hmacLicenser('other')('cus_1:sub_1')).not.toBe(a);
    expect(await hmacLicenser('s3cret', 'HOF')('cus_1:sub_1')).toMatch(/^HOF-/);
  });

  it('refuses an empty secret', () => {
    expect(() => hmacLicenser('')).toThrow(/LICENSE_SECRET/);
  });
});
