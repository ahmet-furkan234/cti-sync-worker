import { InvalidValueError } from '../../common/invalid-value.error.js';
import { attempt, ValueObject } from '../../common/value-object.js';

/** A number in [0, 1] — used for EPSS scores and percentiles. */
export class Probability extends ValueObject<number> {
  static from(raw: number): Probability {
    if (!Number.isFinite(raw) || raw < 0 || raw > 1) throw new InvalidValueError('probability', `${raw} is outside 0–1`);
    return new Probability(raw);
  }

  static tryFrom(raw: number): Probability | null {
    return attempt(() => Probability.from(raw));
  }
}
