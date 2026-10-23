import { inject, injectable } from 'inversify';
import { TYPES } from '../../../shared/tokens.js';
import type { ICveIngestRepository } from '../../../domain/cve/cve-ingest.repository.interface.js';
import type { ISyncStateRepository, SyncProgress } from '../../../domain/sync/sync-state.repository.interface.js';
import type { ILogger, INvdClient } from '../../ports/ports.js';

const MAX_WINDOW_MS = 119 * 86_400_000; // NVD allows at most 120 days per lastMod range
const OVERLAP_MS = 5 * 60_000;
const progress = (phase: SyncProgress['phase'], done: number, total: number, baseDone: number, startedAt: string): SyncProgress => ({
  phase, done, total, baseDone, startedAt, updatedAt: new Date().toISOString(),
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * First run: full download resumable through `cursor.startIndex`.
 * Later runs: incremental by lastModified since the last successful sync.
 */
@injectable()
export class SyncNvdUseCase {
  constructor(
    @inject(TYPES.INvdClient) private readonly nvd: INvdClient,
    @inject(TYPES.ICveIngestRepository) private readonly cves: ICveIngestRepository,
    @inject(TYPES.ISyncStateRepository) private readonly state: ISyncStateRepository,
    @inject(TYPES.ILogger) private readonly logger: ILogger,
  ) {}

  async execute(): Promise<number> {
    const state = await this.state.get('nvd');
    const syncStart = new Date();
    let processed = 0;
    let fullStart: Date | null = null;

    if (!state.lastSuccessAt) {
      let startIndex = Number(state.cursor['startIndex'] ?? 0);
      processed = Number(state.cursor['processed'] ?? 0);
      // Resumed loads keep the ORIGINAL start time: CVEs modified after that moment may
      // already have been skipped, and the first incremental run must cover them.
      fullStart = new Date(String(state.cursor['fullStart'] ?? syncStart.toISOString()));
      const fs = fullStart.toISOString();
      this.logger.info({ startIndex }, 'nvd: full load');
      const baseDone = startIndex;
      const phaseStart = new Date().toISOString();
      startIndex = await this.pages({ startIndex }, async (next, count, total) => {
        processed += count;
        await this.state.update('nvd', {
          cursor: { startIndex: next, processed, fullStart: fs },
          recordsProcessed: processed,
          progress: progress('full', Math.min(next, total), total, baseDone, phaseStart),
        });
      });
    } else {
      let from = new Date(state.lastSuccessAt.getTime() - OVERLAP_MS);
      while (from < syncStart) {
        const to = new Date(Math.min(from.getTime() + MAX_WINDOW_MS, syncStart.getTime()));
        const phaseStart = new Date().toISOString();
        await this.pages({ startIndex: 0, lastModStart: from, lastModEnd: to }, async (next, count, total) => {
          processed += count;
          await this.state.update('nvd', {
            recordsProcessed: processed,
            progress: progress('incremental', Math.min(next, total), total, 0, phaseStart),
          });
        });
        from = to;
      }
    }

    // The sync page shows what is held, not what this run happened to touch (an incremental run may touch 0).
    await this.state.update('nvd', { lastSuccessAt: fullStart ?? syncStart, cursor: {}, recordsProcessed: await this.cves.count() });
    return processed;
  }

  private async pages(
    base: { startIndex: number; lastModStart?: Date; lastModEnd?: Date },
    onPage: (nextIndex: number, count: number, total: number) => Promise<void>,
  ): Promise<number> {
    let startIndex = base.startIndex;
    for (;;) {
      const page = await this.nvd.fetchPage({ ...base, startIndex });
      if (page.vulnerabilities.length > 0) await this.cves.upsertMany(page.vulnerabilities);
      startIndex += page.resultsPerPage || page.vulnerabilities.length;
      await onPage(startIndex, page.vulnerabilities.length, page.totalResults);
      this.logger.info({ startIndex, total: page.totalResults }, 'nvd: page stored');
      if (page.vulnerabilities.length === 0 || startIndex >= page.totalResults) return startIndex;
      await sleep(this.nvd.requestDelayMs);
    }
  }
}
