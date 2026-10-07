import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { SYNC_SOURCES, type ISyncStateRepository, type SyncSource, type SyncState } from '../../domain/sync/sync-state.repository.interface.js';
import { SyncOrchestrator } from './sync-orchestrator.js';

const blank = (source: SyncSource): SyncState => ({
  source, status: 'idle', lastSuccessAt: null, lastStartedAt: null, lastFinishedAt: null,
  lastError: null, recordsProcessed: 0, cursor: {}, runRequestedAt: null,
});

/** In-memory sync_state with the same locking semantics as the SQL implementation. */
function fakeState(initial: Partial<Record<SyncSource, Partial<SyncState>>> = {}) {
  const rows = new Map(SYNC_SOURCES.map((s) => [s, { ...blank(s), ...initial[s] } as SyncState]));
  const repo: ISyncStateRepository = {
    get: async (s) => ({ ...rows.get(s)! }),
    all: async () => SYNC_SOURCES.map((s) => ({ ...rows.get(s)! })),
    update: async (s, patch) => void Object.assign(rows.get(s)!, patch),
    tryStart: async (s) => {
      const r = rows.get(s)!;
      if (r.status === 'running') return false;
      r.status = 'running';
      return true;
    },
    requestRun: async (s) => void (rows.get(s)!.runRequestedAt = new Date()),
    recoverStale: async () => undefined,
  };
  return { repo, rows };
}

function setup(initial?: Parameters<typeof fakeState>[0], impl: Partial<Record<SyncSource, () => Promise<number>>> = {}) {
  const { repo, rows } = fakeState(initial);
  const calls: SyncSource[] = [];
  // Use cases mimic the real ones: record the call and mark success on the state row.
  const uc = (source: SyncSource) => ({
    execute: vi.fn(async () => {
      calls.push(source);
      const n = await (impl[source]?.() ?? Promise.resolve(1));
      rows.get(source)!.lastSuccessAt = new Date();
      return n;
    }),
  });
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const orch = new SyncOrchestrator(repo, uc('nvd') as never, uc('kev') as never, uc('epss') as never, logger);
  return { orch, rows, calls, logger };
}

describe('SyncOrchestrator', () => {
  it('after the FIRST successful NVD load it enriches with KEV and EPSS', async () => {
    const { orch, calls } = setup();
    await orch.run('nvd');
    expect(calls).toEqual(['nvd', 'kev', 'epss']);
  });

  it('later incremental NVD runs do not re-run KEV/EPSS', async () => {
    const { orch, calls } = setup({ nvd: { lastSuccessAt: new Date() } });
    await orch.run('nvd');
    expect(calls).toEqual(['nvd']);
  });

  it('does not start a source that is already running', async () => {
    const { orch, calls, logger } = setup({ kev: { status: 'running' } });
    await orch.run('kev');
    expect(calls).toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('records failures and releases the lock so the source can be retried', async () => {
    const { orch, rows } = setup(undefined, { kev: async () => { throw new Error('boom'); } });
    await orch.run('kev');
    expect(rows.get('kev')).toMatchObject({ status: 'error', lastError: 'boom' });
    await expect(orch.run('kev')).resolves.toBeUndefined(); // error state is not "running"
  });

  it('a failed first NVD load does not trigger KEV/EPSS', async () => {
    const { orch, calls, rows } = setup(undefined, { nvd: async () => { throw new Error('network'); } });
    rows.get('nvd')!.lastSuccessAt = null;
    await orch.run('nvd');
    expect(calls).toEqual(['nvd']);
  });

  it('clears the API\'s "queued" marker when a job starts', async () => {
    const { orch, rows } = setup();
    rows.get('epss')!.runRequestedAt = new Date();
    await orch.run('epss');
    expect(rows.get('epss')!.runRequestedAt).toBeNull();
  });

  it('missingSources lists sources that never succeeded or failed last time', async () => {
    const { orch } = setup({ nvd: { lastSuccessAt: new Date() }, kev: { lastSuccessAt: new Date() }, epss: { status: 'error', lastSuccessAt: new Date() } });
    expect(await orch.missingSources()).toEqual(['epss']);
  });

  it('missingSources returns only NVD while NVD itself is missing (its load enriches KEV/EPSS afterwards)', async () => {
    const { orch } = setup(); // fresh install: nothing has ever succeeded
    expect(await orch.missingSources()).toEqual(['nvd']);
  });
});
