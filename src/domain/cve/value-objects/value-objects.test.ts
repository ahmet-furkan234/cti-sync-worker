import { describe, expect, it } from 'vitest';
import { InvalidValueError } from '../../common/invalid-value.error.js';
import { CpeName, CveId, CvssScore, Probability } from './index.js';

describe('CveId', () => {
  it('uppercases, trims and exposes the year', () => {
    const id = CveId.from(' cve-2023-38408 ');
    expect([id.value, id.year]).toEqual(['CVE-2023-38408', 2023]);
  });
  it.each(['', 'CVE-23-1', 'CVE-2023-12', 'cve_2023_1234', 'CVE-2023-abcd'])('rejects %j', (bad) => {
    expect(() => CveId.from(bad)).toThrow(InvalidValueError);
    expect(CveId.tryFrom(bad)).toBeNull();
  });
  it('compares by value', () => {
    expect(CveId.from('cve-2024-0001').equals(CveId.from('CVE-2024-0001'))).toBe(true);
  });
});

describe('CvssScore', () => {
  it('maps to NVD severity bands at the boundaries', () => {
    const sev = [0, 0.1, 3.9, 4, 6.9, 7, 8.9, 9, 10].map((n) => CvssScore.from(n).severity);
    expect(sev).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
  it('rejects out-of-range and non-finite scores', () => {
    for (const bad of [-0.1, 10.1, NaN, Infinity]) expect(CvssScore.tryFrom(bad)).toBeNull();
  });
  it('normalises float noise and reports scored-ness', () => {
    expect(CvssScore.from(7.500000001).value).toBe(7.5);
    expect(CvssScore.UNSCORED.isScored).toBe(false);
    expect(CvssScore.from(0.1).isScored).toBe(true);
  });
});

describe('Probability', () => {
  it('accepts 0..1 only', () => {
    expect(Probability.from(0).value).toBe(0);
    expect(Probability.from(1).value).toBe(1);
    for (const bad of [-0.01, 1.01, NaN]) expect(Probability.tryFrom(bad)).toBeNull();
  });
});

describe('CpeName', () => {
  it('parses part, vendor, product, version and lowercases vendor/product', () => {
    const c = CpeName.from('cpe:2.3:a:OpenBSD:OpenSSH:8.9p1:*:*:*:*:*:*:*');
    expect([c.part, c.vendor, c.product, c.version, c.productKey]).toEqual(['a', 'openbsd', 'openssh', '8.9p1', 'openbsd:openssh']);
  });
  it('treats * and - as "not specified"', () => {
    const c = CpeName.from('cpe:2.3:o:linux:linux_kernel:-:*:*:*:*:*:*:*');
    expect(c.version).toBeNull();
    const any = CpeName.from('cpe:2.3:a:*:*:*:*:*:*:*:*:*:*');
    expect(any.productKey).toBeNull();
  });
  it('honours escaped colons inside a component', () => {
    const c = CpeName.from('cpe:2.3:a:vendor:prod\\:uct:1.0:*:*:*:*:*:*:*');
    expect(c.product).toBe('prod:uct');
  });
  it.each(['', 'cpe:/a:vendor:product', 'cpe:2.3:x:v:p:1:*:*:*:*:*:*:*', 'cpe:2.3:a:v:p'])('rejects %j', (bad) => {
    expect(CpeName.tryFrom(bad)).toBeNull();
  });
});
