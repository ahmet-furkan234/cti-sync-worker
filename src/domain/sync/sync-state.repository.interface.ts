export type SyncSource = 'nvd' | 'kev' | 'epss';
export const SYNC_SOURCES: SyncSource[] = ['nvd', 'kev', 'epss'];

export type SyncStatus = 'idle' | 'running' | 'error';

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
