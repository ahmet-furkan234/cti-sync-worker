import 'reflect-metadata';
import { Container } from 'inversify';
import { TYPES } from '../../shared/tokens.js';
import { EnvConfig } from '../../infrastructure/common/env.config.js';
import { createLogger } from '../../infrastructure/common/logger.js';
import { createDatabase } from '../../infrastructure/database/client.js';
import { CveIngestRepository } from '../../infrastructure/database/repositories/cve-ingest.repository.js';
import { SyncStateRepository } from '../../infrastructure/database/repositories/sync-state.repository.js';
import { NvdClient } from '../../infrastructure/external/nvd.client.js';
import { KevClient } from '../../infrastructure/external/kev.client.js';
import { EpssClient } from '../../infrastructure/external/epss.client.js';
import { SyncNvdUseCase } from '../../application/sync/use-cases/sync-nvd.use-case.js';
import { SyncKevUseCase } from '../../application/sync/use-cases/sync-kev.use-case.js';
import { SyncEpssUseCase } from '../../application/sync/use-cases/sync-epss.use-case.js';
import { SyncOrchestrator } from '../../application/sync/sync-orchestrator.js';
import type pg from 'pg';

export interface BuiltContainer {
  container: Container;
  pool: pg.Pool;
  shutdown: () => Promise<void>;
}

/** Single place where every token is bound to its implementation. */
export function buildContainer(): BuiltContainer {
  const container = new Container({ defaultScope: 'Singleton' });
  const config = new EnvConfig();
  const logger = createLogger(config);
  const { db, pool } = createDatabase(config.DATABASE_URL);

  container.bind(TYPES.EnvConfig).toConstantValue(config);
  container.bind(TYPES.ILogger).toConstantValue(logger);
  container.bind(TYPES.DrizzleDatabase).toConstantValue(db);
  container.bind(TYPES.INvdClient).to(NvdClient);
  container.bind(TYPES.IKevClient).to(KevClient);
  container.bind(TYPES.IEpssClient).to(EpssClient);

  container.bind(TYPES.ICveIngestRepository).to(CveIngestRepository);
  container.bind(TYPES.ISyncStateRepository).to(SyncStateRepository);

  container.bind(TYPES.SyncNvdUseCase).to(SyncNvdUseCase);
  container.bind(TYPES.SyncKevUseCase).to(SyncKevUseCase);
  container.bind(TYPES.SyncEpssUseCase).to(SyncEpssUseCase);
  container.bind(TYPES.SyncOrchestrator).to(SyncOrchestrator);

  return { container, pool, shutdown: () => pool.end() };
}
