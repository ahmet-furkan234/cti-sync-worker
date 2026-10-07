import type { ConnectionOptions } from 'bullmq';

/** Turns `redis://[user:pass@]host:port[/db]` (or `rediss://` for TLS) into BullMQ connection options. */
export function redisConnection(url: string, opts: { forWorker: boolean }): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    ...(u.pathname.length > 1 ? { db: Number(u.pathname.slice(1)) } : {}),
    ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
    // BullMQ requires this for the blocking connections a Worker uses.
    ...(opts.forWorker ? { maxRetriesPerRequest: null } : {}),
  };
}
