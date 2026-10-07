import type pg from 'pg';
import type { ILogger } from '../../application/ports/ports.js';
import { SQL } from './sql.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The backend owns migrations: wait (bounded) until its tables exist instead of crashing on first boot. */
export async function waitForSchema(pool: pg.Pool, logger: ILogger, attempts = 30, delayMs = 2_000): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await pool.query(SQL.probeCveTable);
      await pool.query(SQL.probeSyncStateTable);
      return;
    } catch (err) {
      if (i >= attempts) throw new Error(`Database schema not ready (run cti-backend migrations first): ${String(err)}`);
      logger.warn({ attempt: i }, 'schema not ready yet (cve / sync_state) — is cti-backend migrated?');
      await sleep(delayMs);
    }
  }
}
