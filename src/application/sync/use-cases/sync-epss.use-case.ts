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
    const total = await this.epss.streamScores(5000, async (batch) => {
      updated += await this.cves.applyEpss(batch);
    });
    await this.state.update('epss', { lastSuccessAt: startedAt, recordsProcessed: total });
    return updated;
  }
}
