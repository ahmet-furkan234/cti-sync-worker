import { createServer, type Server } from 'node:http';
import type { ISyncStateRepository } from '../../domain/sync/sync-state.repository.interface.js';
import type { ILogger } from '../../application/ports/ports.js';

export interface QueueStatus {
  status(): Promise<{ redis: boolean; consuming: boolean }>;
}

/**
 * Tiny HTTP surface for orchestrators:
 *   GET /health  liveness (process is up)
 *   GET /ready   readiness: database + Redis reachable, queue worker consuming; plus per-source sync state
 */
export function startHealthServer(port: number, state: ISyncStateRepository, queue: QueueStatus, logger: ILogger): Server {
  const server = createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.url === '/health') return send(200, { status: 'ok' });
    if (req.url === '/ready') {
      Promise.all([state.all().then((s) => s, () => null), queue.status()]).then(([sources, q]) => {
        const ready = sources !== null && q.redis && q.consuming;
        send(ready ? 200 : 503, {
          status: ready ? 'ready' : 'not_ready',
          database: sources !== null,
          queue: q,
          sources: (sources ?? []).map((s) => ({ source: s.source, status: s.status, lastSuccessAt: s.lastSuccessAt })),
        });
      });
      return;
    }
    send(404, { error: 'NOT_FOUND' });
  });
  server.listen(port, () => logger.info({ port }, 'health server listening'));
  return server;
}
