import { inject, injectable } from 'inversify';
import { TYPES } from '../../../shared/tokens.js';
import type { ICveIngestRepository } from '../../../domain/cve/cve-ingest.repository.interface.js';
import type { ISyncStateRepository } from '../../../domain/sync/sync-state.repository.interface.js';
import type { IEpssClient } from '../../ports/ports.js';

@injectable()
export class SyncEpssUseCase {
  constructor(
    @inject(TYPES.IEpssClient) private readonly epss: IEpssClient,
    @inject(TYPES.ICveIngestRepository) private readonly cves: ICveIngestRepository,
    @inject(TYPES.ISyncStateRepository) private readonly state: ISyncStateRepository,
  ) {}

  async execute(): Promise<number> {
    const startedAt = new Date();
    let updated = 0;
    let seen = 0;
    // The gzipped CSV has no row count up front; the previous run's size is a good estimate (null on the very first run).
    const estimate = (await this.state.get('epss')).recordsProcessed || null;
    const phaseStart = startedAt.toISOString();
    await this.state.update('epss', { progress: { phase: 'download', done: 0, total: estimate, baseDone: 0, startedAt: phaseStart, updatedAt: phaseStart } });
    const total = await this.epss.streamScores(5000, async (batch) => {
      updated += await this.cves.applyEpss(batch);
      seen += batch.length;
      await this.state.update('epss', {
        progress: { phase: 'apply', done: seen, total: estimate && Math.max(estimate, seen), baseDone: 0, startedAt: phaseStart, updatedAt: new Date().toISOString() },
      });
    });
    await this.state.update('epss', { lastSuccessAt: startedAt, recordsProcessed: total });
    return updated;
  }
}
