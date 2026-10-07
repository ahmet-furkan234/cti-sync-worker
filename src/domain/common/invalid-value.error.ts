/** A value failed its invariant. Ingestion code turns this into "skip the row"; nothing here maps to HTTP. */
export class InvalidValueError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(`${field}: ${message}`);
    this.name = 'InvalidValueError';
  }
}
