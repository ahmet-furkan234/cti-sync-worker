import { Queue, Worker } from 'bullmq';
import type { ILogger } from '../../application/ports/ports.js';
import type { SyncJobHandler } from '../../application/sync/sync-job.handler.js';
import { SYNC_JOB_NAME, SYNC_QUEUE_NAME, type SyncJobData } from '../../domain/sync/sync-job.js';
import { SYNC_SOURCES, type SyncSource } from '../../domain/sync/sync-state.repository.interface.js';
import type { EnvConfig } from '../common/env.config.js';
import { redisConnection } from './redis-connection.js';

/** One job per source may run at once (DB lock too), so the three sources can progress in parallel. */
const CONCURRENCY = 3;

/**
 * BullMQ wiring:
 *  - a Worker consuming the `cti-sync` queue that cti-backend enqueues manual requests into,
 *  - Job Schedulers (durable repeatable jobs kept in Redis) replacing in-process cron,
 *  - bootstrap jobs for sources that never succeeded, plus (SYNC_ON_START) a run of every source at each start.
 * A job that was active when the process died is detected as stalled by BullMQ and re-run;
 * the NVD load resumes from its stored cursor.
 */
export class SyncQueue {
  private readonly queue: Queue<SyncJobData>;
  private worker: Worker<SyncJobData> | null = null;

  constructor(
    private readonly config: EnvConfig,
    private readonly handler: SyncJobHandler,
    private readonly logger: ILogger,
  ) {
    this.queue = new Queue<SyncJobData>(SYNC_QUEUE_NAME, {
      connection: redisConnection(config.REDIS_URL, { forWorker: false }),
      defaultJobOptions: { removeOnComplete: { count: 100 }, removeOnFail: { count: 100 } },
    });
    this.queue.on('error', (err) => this.logger.error({ err: String(err) }, 'queue connection error'));
  }

  async start(bootstrapSources: SyncSource[]): Promise<void> {
    this.worker = new Worker<SyncJobData>(
      SYNC_QUEUE_NAME,
      (job) => this.handler.handle(job.data, job.id),
      { connection: redisConnection(this.config.REDIS_URL, { forWorker: true }), concurrency: CONCURRENCY },
    );
    this.worker.on('failed', (job, err) => this.logger.error({ jobId: job?.id, err: String(err) }, 'sync job failed'));
    this.worker.on('stalled', (jobId) => this.logger.warn({ jobId }, 'sync job stalled, will be re-run'));
    this.worker.on('error', (err) => this.logger.error({ err: String(err) }, 'queue worker error'));

    if (this.config.SYNC_ENABLED) {
      await this.upsertSchedule('nvd', this.config.NVD_CRON);
      await this.upsertSchedule('kev', this.config.KEV_CRON);
      await this.upsertSchedule('epss', this.config.EPSS_CRON);
      const missing = new Set(bootstrapSources);
      for (const source of this.config.SYNC_ON_START ? SYNC_SOURCES : bootstrapSources) {
        await this.enqueueStartRun(source, missing.has(source) ? `bootstrap-${source}` : `startup-${source}`);
      }
    } else {
      this.logger.warn({}, 'SYNC_ENABLED=false: no schedules; only jobs enqueued by the API are executed');
    }
  }

  /**
   * Fixed job id: restarting the service does not pile up duplicate runs while one is still queued or active.
   * A finished job with that id is removed first, otherwise BullMQ would silently ignore the new one
   * (finished jobs are kept) and the second start would fetch nothing.
   */
  private async enqueueStartRun(source: SyncSource, jobId: string): Promise<void> {
    const previous = await this.queue.getJob(jobId);
    if (previous) {
      const state = await previous.getState();
      if (state === 'completed' || state === 'failed') await previous.remove();
    }
    await this.queue.add(SYNC_JOB_NAME, { source, trigger: 'bootstrap' }, { jobId });
  }

  private upsertSchedule(source: SyncSource, pattern: string) {
    return this.queue.upsertJobScheduler(
      `schedule-${source}`,
      { pattern },
      { name: SYNC_JOB_NAME, data: { source, trigger: 'schedule' } },
    );
  }

  /** For /ready: is Redis reachable and is the worker consuming? */
  async status(): Promise<{ redis: boolean; consuming: boolean }> {
    try {
      await this.queue.isPaused(); // any command is a round-trip to Redis
      return { redis: true, consuming: this.worker?.isRunning() ?? false };
    } catch {
      return { redis: false, consuming: false };
    }
  }

  async stop(): Promise<void> {
    // close() waits for active jobs; the NVD load is resumable so shutdown does not wait for it forever.
    await Promise.race([this.worker?.close(), new Promise((r) => setTimeout(r, 8_000))]);
    await this.queue.close();
  }
}
