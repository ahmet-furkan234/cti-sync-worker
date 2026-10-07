import 'dotenv/config';
import 'reflect-metadata';
import { TYPES } from '../shared/tokens.js';
import type { ILogger } from '../application/ports/ports.js';
import { SyncJobHandler } from '../application/sync/sync-job.handler.js';
import type { SyncOrchestrator } from '../application/sync/sync-orchestrator.js';
import type { EnvConfig } from '../infrastructure/common/env.config.js';
import type { ISyncStateRepository } from '../domain/sync/sync-state.repository.interface.js';
import { waitForSchema } from '../infrastructure/database/schema-check.js';
import { startHealthServer } from '../infrastructure/health/health-server.js';
import { SyncQueue } from '../infrastructure/queue/sync-queue.js';
import { buildContainer } from './container/build.js';

async function main(): Promise<void> {
  const { container, pool, shutdown } = buildContainer();
  const config = container.get<EnvConfig>(TYPES.EnvConfig);
  const logger = container.get<ILogger>(TYPES.ILogger);
  const state = container.get<ISyncStateRepository>(TYPES.ISyncStateRepository);
  const orchestrator = container.get<SyncOrchestrator>(TYPES.SyncOrchestrator);

  await waitForSchema(pool, logger);
  // Must happen BEFORE the queue worker starts: a run that was active when the previous process died would
  // otherwise still look "running" and the stalled job BullMQ re-delivers would be skipped by the DB lock.
  await state.recoverStale(0);

  const queue = new SyncQueue(config, new SyncJobHandler(orchestrator, logger), logger);
  await queue.start(await orchestrator.missingSources());
  const health = config.HEALTH_PORT > 0 ? startHealthServer(config.HEALTH_PORT, state, queue, logger) : null;
  logger.info({ syncEnabled: config.SYNC_ENABLED, nvdApiKey: !!config.NVD_API_KEY }, 'cti-sync-worker started');

  const stop = () => {
    logger.info({}, 'shutting down');
    health?.close();
    void queue.stop().finally(() => void shutdown().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 15_000).unref();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
