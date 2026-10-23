import { inject, injectable } from 'inversify';
import { TYPES } from '../../../shared/tokens.js';
import type { ICveIngestRepository } from '../../../domain/cve/cve-ingest.repository.interface.js';
import type { ISyncStateRepository } from '../../../domain/sync/sync-state.repository.interface.js';
import type { IKevClient } from '../../ports/ports.js';

@injectable()
export class SyncKevUseCase {
  constructor(
    @inject(TYPES.IKevClient) private readonly kev: IKevClient,
    @inject(TYPES.ICveIngestRepository) private readonly cves: ICveIngestRepository,
    @inject(TYPES.ISyncStateRepository) private readonly state: ISyncStateRepository,
  ) {}

  async execute(): Promise<number> {
    const startedAt = new Date();
    const phaseStart = startedAt.toISOString();
    await this.state.update('kev', { progress: { phase: 'download', done: 0, total: null, baseDone: 0, startedAt: phaseStart, updatedAt: phaseStart } });
    const entries = await this.kev.fetchCatalog();
    const now = new Date().toISOString();
    await this.state.update('kev', { progress: { phase: 'apply', done: 0, total: entries.length, baseDone: 0, startedAt: now, updatedAt: now } });
    const updated = await this.cves.applyKev(entries);
    await this.state.update('kev', { lastSuccessAt: startedAt, recordsProcessed: entries.length });
    return updated;
  }
}
