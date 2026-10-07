import { z } from 'zod';
import { SYNC_SOURCES } from '../../domain/sync/sync-state.repository.interface.js';
import type { SyncJobData } from '../../domain/sync/sync-job.js';
import type { ILogger } from '../ports/ports.js';
import type { SyncOrchestrator } from './sync-orchestrator.js';

const jobSchema = z.object({
  source: z.enum(SYNC_SOURCES as [string, ...string[]]),
  trigger: z.enum(['manual', 'schedule', 'bootstrap']),
  requestId: z.string().optional(),
  requestedBy: z.object({ id: z.string(), email: z.string() }).nullable().optional(),
  requestedAt: z.string().optional(),
});

/**
 * Validates a queue payload and hands it to the orchestrator. Payloads come from another
 * service through Redis, so they are checked at the boundary instead of trusted.
 */
export class SyncJobHandler {
  constructor(
    private readonly sync: SyncOrchestrator,
    private readonly logger: ILogger,
  ) {}

  async handle(raw: unknown, jobId?: string): Promise<void> {
    const parsed = jobSchema.safeParse(raw);
    if (!parsed.success) {
      // A malformed job can never succeed: log and drop instead of retrying forever.
      this.logger.error({ jobId, issues: parsed.error.issues }, 'invalid sync job payload, dropped');
      return;
    }
    const job = parsed.data as SyncJobData;
    this.logger.info({ jobId, source: job.source, trigger: job.trigger, requestedBy: job.requestedBy?.email }, 'sync job started');
    await this.sync.run(job.source);
  }
}
