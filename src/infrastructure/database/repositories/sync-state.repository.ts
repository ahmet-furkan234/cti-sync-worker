import { eq, sql } from 'drizzle-orm';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../../shared/tokens.js';
import {
  SYNC_SOURCES, type ISyncStateRepository, type SyncSource, type SyncState,
} from '../../../domain/sync/sync-state.repository.interface.js';
import type { Database } from '../client.js';
import { syncState } from '../schema/index.js';

const toState = (r: typeof syncState.$inferSelect): SyncState => ({ ...r, source: r.source as SyncSource });

@injectable()
export class SyncStateRepository implements ISyncStateRepository {
  constructor(@inject(TYPES.DrizzleDatabase) private readonly db: Database) {}

  private async ensure(): Promise<void> {
    await this.db.insert(syncState).values(SYNC_SOURCES.map((source) => ({ source }))).onConflictDoNothing();
  }

  async get(source: SyncSource) {
    await this.ensure();
    const [r] = await this.db.select().from(syncState).where(eq(syncState.source, source));
    return toState(r!);
  }

  async all() {
    await this.ensure();
    const rows = await this.db.select().from(syncState);
    return SYNC_SOURCES.map((s) => toState(rows.find((r) => r.source === s)!));
  }

  async update(source: SyncSource, patch: Partial<Omit<SyncState, 'source'>>) {
    await this.db.update(syncState).set(patch).where(eq(syncState.source, source));
  }

  async tryStart(source: SyncSource) {
    await this.ensure();
    const res = await this.db
      .update(syncState)
      .set({ status: 'running', lastStartedAt: new Date(), lastError: null, progress: null })
      .where(sql`${syncState.source} = ${source} and ${syncState.status} <> 'running'`)
      .returning({ source: syncState.source });
    return res.length > 0;
  }

  async requestRun(source: SyncSource) {
    await this.ensure();
    await this.db.update(syncState).set({ runRequestedAt: new Date() }).where(eq(syncState.source, source));
  }

  async recoverStale(olderThanMs: number) {
    await this.db
      .update(syncState)
      .set({ status: 'error', lastError: 'Run interrupted (worker crashed or restarted)' })
      .where(sql`${syncState.status} = 'running' and ${syncState.lastStartedAt} < now() - (${olderThanMs} * interval '1 millisecond')`);
  }
}
