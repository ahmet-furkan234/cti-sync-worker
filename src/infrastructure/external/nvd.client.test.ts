import { describe, expect, it } from 'vitest';
import { parseNvdCve } from './nvd.client.js';

describe('parseNvdCve', () => {
  const item = {
    id: 'CVE-2024-0001',
    published: '2024-03-29T00:15:08.000',
    lastModified: '2024-04-01T10:00:00.000',
    vulnStatus: 'Analyzed',
    descriptions: [{ lang: 'es', value: 'hola' }, { lang: 'en', value: 'A flaw in Foo' }],
    metrics: {
      cvssMetricV2: [{ baseSeverity: 'MEDIUM', cvssData: { baseScore: 5, vectorString: 'AV:N', version: '2.0' } }],
      cvssMetricV31: [
        { type: 'Secondary', cvssData: { baseScore: 5.5, baseSeverity: 'MEDIUM', vectorString: 'CVSS:3.1/x', version: '3.1' } },
        { type: 'Primary', cvssData: { baseScore: 9.8, baseSeverity: 'CRITICAL', vectorString: 'CVSS:3.1/y', version: '3.1' } },
      ],
    },
    weaknesses: [{ description: [{ value: 'CWE-79' }, { value: 'CWE-79' }] }],
    configurations: [{
      nodes: [{
        cpeMatch: [
          { vulnerable: true, criteria: 'cpe:2.3:a:Acme:Widget:*:*:*:*:*:*:*:*', versionStartIncluding: '1.0', versionEndExcluding: '1.5' },
          { vulnerable: false, criteria: 'cpe:2.3:o:linux:linux_kernel:-:*:*:*:*:*:*:*' },
        ],
      }],
    }],
    references: [{ url: 'https://example.com/a', tags: ['Patch'] }],
  };

  it('prefers the newest CVSS version and its Primary metric', () => {
    const c = parseNvdCve(item);
    expect(c.cvssScore).toBe(9.8);
    expect(c.cvssSeverity).toBe(4);
    expect(c.cvssVersion).toBe('3.1');
    expect(c.description).toBe('A flaw in Foo');
  });

  it('treats NVD timestamps as UTC and de-duplicates CWEs', () => {
    const c = parseNvdCve(item);
    expect(c.published.toISOString()).toBe('2024-03-29T00:15:08.000Z');
    expect(c.cwe).toEqual(['CWE-79']);
  });

  it('extracts vendor/product and version ranges from vulnerable CPE matches only', () => {
    const c = parseNvdCve(item);
    expect(c.affected).toEqual(['acme:widget']);
    expect(c.vendors).toEqual(['acme']);
    expect(c.cpeMatches).toEqual([{ c: 'cpe:2.3:a:Acme:Widget:*:*:*:*:*:*:*:*', vsi: '1.0', vee: '1.5' }]);
  });

  it('stores unscored CVEs as score 0 / severity 0', () => {
    const c = parseNvdCve({ id: 'CVE-2024-0002', published: '2024-01-01T00:00:00.000', lastModified: '2024-01-01T00:00:00.000' });
    expect(c.cvssScore).toBe(0);
    expect(c.cvssSeverity).toBe(0);
    expect(c.description).toBe('');
  });
});
