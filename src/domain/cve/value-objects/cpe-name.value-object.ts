import { InvalidValueError } from '../../common/invalid-value.error.js';
import { attempt, ValueObject } from '../../common/value-object.js';

export type CpePart = 'a' | 'o' | 'h';

/** Splits on `:` that is not escaped with a backslash (CPE 2.3 formatted string). */
const SPLIT = /(?<!\\):/;
const unescape = (s: string) => s.replace(/\\(.)/g, '$1');

/**
 * A CPE 2.3 name: `cpe:2.3:<part>:<vendor>:<product>:<version>:…` (11 components after the prefix).
 * Vendor/product are lowercased; `*` (any) and `-` (n/a) are treated as "not specified".
 */
export class CpeName extends ValueObject<string> {
  private constructor(
    raw: string,
    readonly part: CpePart,
    readonly vendor: string | null,
    readonly product: string | null,
    readonly version: string | null,
  ) {
    super(raw);
  }

  static from(raw: string): CpeName {
    const c = raw.trim().split(SPLIT);
    if (c.length !== 13 || c[0] !== 'cpe' || c[1] !== '2.3' || !['a', 'o', 'h'].includes(c[2]!)) {
      throw new InvalidValueError('cpe', `"${raw}" is not a CPE 2.3 formatted string`);
    }
    const field = (i: number) => {
      const v = c[i]!;
      return v === '*' || v === '-' || v === '' ? null : unescape(v);
    };
    return new CpeName(raw.trim(), c[2] as CpePart, field(3)?.toLowerCase() ?? null, field(4)?.toLowerCase() ?? null, field(5));
  }

  static tryFrom(raw: string): CpeName | null {
    return attempt(() => CpeName.from(raw));
  }

  /** `vendor:product` when both are concrete (the key CVE search indexes), otherwise null. */
  get productKey(): string | null {
    return this.vendor && this.product ? `${this.vendor}:${this.product}` : null;
  }
}
