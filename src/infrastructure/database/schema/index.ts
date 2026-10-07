/**
 * Read/write mapping of the tables this service touches. The tables themselves are owned by
 * cti-backend (drizzle migrations live there) — change them THERE first, then mirror the change here.
 */
export * from './cve.table.js';
export * from './sync-state.table.js';
