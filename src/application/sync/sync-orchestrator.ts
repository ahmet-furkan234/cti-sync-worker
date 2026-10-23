import { inject, injectable } from 'inversify';
import { TYPES } from '../../shared/tokens.js';
import type { ISyncStateRepository, SyncSource } from '../../domain/sync/sync-state.repository.interface.js';
import { SYNC_SOURCES } from '../../domain/sync/sync-state.repository.interface.js';
import type { ILogger } from '../ports/ports.js';
import { SyncNvdUseCase } from './use-cases/sync-nvd.use-case.js';
import { SyncKevUseCase } from './use-cases/sync-kev.use-case.js';
import { SyncEpssUseCase } from './use-cases/sync-epss.use-case.js';

/** Runs sources with a DB-level lock and records status; every execution path (queue jobs, CLI) goes through it. */
@injectable()
export class SyncOrchestrator {
  constructor(
    @inject(TYPES.ISyncStateRepository) private readonly state: ISyncStateRepository,
    @inject(TYPES.SyncNvdUseCase) private readonly nvd: SyncNvdUseCase,
    @inject(TYPES.SyncKevUseCase) private readonly kev: SyncKevUseCase,
    @inject(TYPES.SyncEpssUseCase) private readonly epss: SyncEpssUseCase,
    @inject(TYPES.ILogger) private readonly logger: ILogger,
  ) {}

  async run(source: SyncSource): Promise<void> {
    // The job left the queue: clear the API's "queued" marker.
    await this.state.update(source, { runRequestedAt: null });
    const wasFirstLoad = source === 'nvd' && !(await this.state.get('nvd')).lastSuccessAt;
    await this.runOne(source);
    if (wasFirstLoad && (await this.state.get('nvd')).lastSuccessAt) {
      // The initial load inserted CVEs after KEV/EPSS last ran: enrich them now.
      await this.runOne('kev');
      await this.runOne('epss');
    }
  }

  private async runOne(source: SyncSource): Promise<void> {
    if (!(await this.state.tryStart(source))) {
      this.logger.warn({ source }, 'sync already running, skipped');
      return;
    }
    const startedAt = Date.now();
    try {
      const uc = source === 'nvd' ? this.nvd : source === 'kev' ? this.kev : this.epss;
      const count = await uc.execute();
      await this.state.update(source, { status: 'idle', lastFinishedAt: new Date(), lastError: null, progress: null });
      this.logger.info({ source, count, ms: Date.now() - startedAt }, 'sync finished');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.state.update(source, { status: 'error', lastFinishedAt: new Date(), lastError: message, progress: null });
      this.logger.error({ err, source }, 'sync failed');
    }
  }

  /** NVD first: KEV/EPSS only enrich CVEs that already exist. */
  async runAll(): Promise<void> {
    for (const source of SYNC_SOURCES) await this.runOne(source);
  }

  /**
   * Sources that should be (re)started on boot: never succeeded, or failed last time.
   * While NVD itself is missing only NVD is returned — its first successful load enriches KEV/EPSS afterwards.
   */
  async missingSources(): Promise<SyncSource[]> {
    const all = await this.state.all();
    const missing = all.filter((s) => !s.lastSuccessAt || s.status === 'error').map((s) => s.source);
    return missing.includes('nvd') ? ['nvd'] : missing;
  }
}
