import type { SyncSource } from './sync-state.repository.interface.js';

/**
 * Contract with cti-backend: the API enqueues these jobs, this service consumes them.
 * Keep `SYNC_QUEUE_NAME` and the payload shape in sync with cti-backend/src/domain/sync/sync-job.ts.
 */
export const SYNC_QUEUE_NAME = 'cti-sync';
export const SYNC_JOB_NAME = 'sync';

export type SyncTrigger = 'manual' | 'schedule' | 'bootstrap';

export interface SyncJobData {
  source: SyncSource;
  trigger: SyncTrigger;
  /** Set for manual requests */
  requestId?: string;
  requestedBy?: { id: string; email: string } | null;
  requestedAt?: string;
}
