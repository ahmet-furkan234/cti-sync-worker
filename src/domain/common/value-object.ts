/**
 * Base for value objects: immutable, compared by value, no identity. Subclasses keep a private constructor
 * and validating `from()` / `tryFrom()` factories, so an instance is proof that the value is valid.
 */
export abstract class ValueObject<T> {
  protected constructor(public readonly value: T) {}

  equals(other: ValueObject<T> | null | undefined): boolean {
    return !!other && other.constructor === this.constructor && other.value === this.value;
  }

  toString(): string {
    return String(this.value);
  }

  toJSON(): T {
    return this.value;
  }
}

/** Turns a throwing factory into a nullable one. */
export function attempt<T>(factory: () => T): T | null {
  try {
    return factory();
  } catch {
    return null;
  }
}
