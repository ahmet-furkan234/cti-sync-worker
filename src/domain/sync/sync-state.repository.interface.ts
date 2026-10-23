export type SyncSource = 'nvd' | 'kev' | 'epss';
export const SYNC_SOURCES: SyncSource[] = ['nvd', 'kev', 'epss'];

export type SyncStatus = 'idle' | 'running' | 'error';

/** Live progress of a running sync; `total` is null when it cannot be known (indeterminate). */
export interface SyncProgress {
  phase: 'full' | 'incremental' | 'download' | 'apply';
  done: number;
  total: number | null;
  /** `done` at the start of this phase (a resumed full load starts above 0): the ETA rate is measured from it. */
  baseDone: number;
  startedAt: string;
  updatedAt: string;
}

export interface SyncState {
  source: SyncSource;
  status: SyncStatus;
  lastSuccessAt: Date | null;
  lastStartedAt: Date | null;
  lastFinishedAt: Date | null;
  lastError: string | null;
  recordsProcessed: number;
  cursor: Record<string, unknown>;
  runRequestedAt: Date | null;
  progress: SyncProgress | null;
}

export interface ISyncStateRepository {
  get(source: SyncSource): Promise<SyncState>;
  all(): Promise<SyncState[]>;
  update(source: SyncSource, patch: Partial<Omit<SyncState, 'source'>>): Promise<void>;
  /** Atomically flips idle/error → running; false if another run holds it. */
  tryStart(source: SyncSource): Promise<boolean>;
  requestRun(source: SyncSource): Promise<void>;
  /** Marks runs stuck in `running` (crashed worker) as error. */
  recoverStale(olderThanMs: number): Promise<void>;
}
