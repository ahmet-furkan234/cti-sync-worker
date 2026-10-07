import { InvalidValueError } from '../../common/invalid-value.error.js';
import { attempt, ValueObject } from '../../common/value-object.js';
import type { SeverityLevel } from '../cve-ingest.repository.interface.js';

/** CVSS base score 0.0–10.0. 0 stands for "not scored yet" (CVEs awaiting NVD analysis). */
export class CvssScore extends ValueObject<number> {
  static readonly UNSCORED = new CvssScore(0);

  static from(raw: number): CvssScore {
    if (!Number.isFinite(raw) || raw < 0 || raw > 10) throw new InvalidValueError('cvssScore', `${raw} is outside 0–10`);
    // Scores carry one decimal; normalising avoids 7.500000001 style noise.
    return new CvssScore(Math.round(raw * 10) / 10);
  }

  static tryFrom(raw: number): CvssScore | null {
    return attempt(() => CvssScore.from(raw));
  }

  /** NVD severity bands: none < 0.1 ≤ low < 4 ≤ medium < 7 ≤ high < 9 ≤ critical. */
  get severity(): SeverityLevel {
    const s = this.value;
    return s >= 9 ? 4 : s >= 7 ? 3 : s >= 4 ? 2 : s > 0 ? 1 : 0;
  }

  get isScored(): boolean {
    return this.value > 0;
  }
}
