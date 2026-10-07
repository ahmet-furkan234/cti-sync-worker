import { describe, expect, it, vi } from 'vitest';
import { SyncJobHandler } from './sync-job.handler.js';
import type { SyncOrchestrator } from './sync-orchestrator.js';

const setup = () => {
  const sync = { run: vi.fn(async () => undefined) };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return { sync, logger, handler: new SyncJobHandler(sync as unknown as SyncOrchestrator, logger) };
};

describe('SyncJobHandler', () => {
  it('runs the requested source for a valid manual job', async () => {
    const { handler, sync } = setup();
    await handler.handle({ source: 'kev', trigger: 'manual', requestId: 'r1', requestedBy: { id: 'u1', email: 'a@b.c' } }, 'j1');
    expect(sync.run).toHaveBeenCalledWith('kev');
  });

  it('accepts scheduler/bootstrap payloads without requester info', async () => {
    const { handler, sync } = setup();
    await handler.handle({ source: 'nvd', trigger: 'schedule' });
    await handler.handle({ source: 'epss', trigger: 'bootstrap' });
    expect(sync.run.mock.calls.map((c) => c[0])).toEqual(['nvd', 'epss']);
  });

  it('drops (does not retry, does not throw) payloads that fail validation', async () => {
    const { handler, sync, logger } = setup();
    await expect(handler.handle({ source: 'shodan', trigger: 'manual' }, 'bad')).resolves.toBeUndefined();
    await expect(handler.handle('garbage')).resolves.toBeUndefined();
    expect(sync.run).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(2);
  });
});
