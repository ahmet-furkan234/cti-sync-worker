import 'dotenv/config';
import 'reflect-metadata';
import { TYPES } from '../shared/tokens.js';
import type { ILogger } from '../application/ports/ports.js';
import type { SyncOrchestrator } from '../application/sync/sync-orchestrator.js';
import { SYNC_SOURCES, type SyncSource } from '../domain/sync/sync-state.repository.interface.js';
import { waitForSchema } from '../infrastructure/database/schema-check.js';
import { buildContainer } from './container/build.js';

/** `npm run run:once -- kev` (nvd | kev | epss | all) — runs in the foreground and exits. */
const arg = process.argv[2] ?? 'all';
if (arg !== 'all' && !SYNC_SOURCES.includes(arg as SyncSource)) {
  console.error(`Unknown source "${arg}". Use: ${[...SYNC_SOURCES, 'all'].join(' | ')}`);
  process.exit(1);
}
const { container, pool, shutdown } = buildContainer();
await waitForSchema(pool, container.get<ILogger>(TYPES.ILogger), 3);
const sync = container.get<SyncOrchestrator>(TYPES.SyncOrchestrator);
await (arg === 'all' ? sync.runAll() : sync.run(arg as SyncSource));
await shutdown();
