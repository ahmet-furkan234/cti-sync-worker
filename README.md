# cti-sync-worker

Standalone background service that keeps the CTI database fed. Separate process, separate deployable —
`cti-backend` (the API) only **reads** this data.

| Source | What | Schedule (env) |
|---|---|---|
| NVD CVE API 2.0 | CVEs (CVSS, CWE, CPE ranges, references). First run = resumable full load (~400k CVEs, ~1 h without API key), then incremental by `lastModified` | `NVD_CRON` hourly |
| CISA KEV | actively exploited flag, due date, ransomware use (falls back to CISA's GitHub mirror if cisa.gov blocks the request) | `KEV_CRON` every 6 h |
| FIRST EPSS | daily exploitation-probability scores (streamed gzip CSV) | `EPSS_CRON` daily |

After the *first* full NVD load, KEV and EPSS run automatically so the new rows get enriched.

```bash
npm install
cp .env.example .env        # DATABASE_URL must point at the cti-backend database
npm run dev                 # long-running service (BullMQ worker + schedulers + /health) — needs Redis
npm run run:once -- kev     # one-off foreground run (no Redis needed): nvd | kev | epss | all
npm test
```

## How it fits together

```
cti-backend ──enqueue──▶  Redis (BullMQ queue "cti-sync")  ──▶ cti-sync-worker ──writes──▶ PostgreSQL ◀──reads── cti-backend
   POST /sync/:source/run     job "manual-<source>"             Worker (concurrency 3)      cve, sync_state
                              + Job Schedulers (cron)
```

- **Queue = BullMQ over Redis** (`REDIS_URL`, default `redis://localhost:6390`; `docker compose up -d redis` in cti-backend).
  The API enqueues a `sync` job (`{source, trigger: 'manual', requestId, requestedBy}`); the job id `manual-<source>` means
  clicking twice never stacks runs. If Redis is down the API answers **503** instead of pretending.
- **Schedules are BullMQ Job Schedulers** (durable repeatable jobs stored in Redis, `NVD_CRON` / `KEV_CRON` / `EPSS_CRON`),
  so with several instances a schedule still fires once. Sources that never succeeded get a `bootstrap-<source>` job at boot.
- **Durable**: a job enqueued while this service is down is executed when it comes back. A job that was active when the
  process died is detected as *stalled* by BullMQ and re-run; the NVD load resumes from its stored cursor. On boot leftover
  `running` rows are reset to `error` **before** the queue worker starts (otherwise the DB lock would skip the re-run).
- **Status stays in PostgreSQL** (`sync_state`): the worker writes it, the API reads it for the UI — queue = commands,
  database = state. `run_requested_at` is only the UI's "queued" marker, cleared when the job starts.
- **Contract**: `SYNC_QUEUE_NAME` + job payload live in `src/domain/sync/sync-job.ts` and are mirrored in
  `cti-backend/src/domain/sync/sync-job.ts` (payloads are validated with zod on this side).
- **Database is the schema contract.** `cve` and `sync_state` are created by `cti-backend` migrations; this service waits
  (bounded) for them at startup and never migrates. `src/infrastructure/database/schema/*` mirrors those tables — change
  the backend schema first, then mirror it here.
- **Locking**: `sync_state.status` flips `idle|error → running` atomically (`tryStart`), so a source never runs twice
  concurrently, even with duplicate jobs or several instances.
- **Resilience**: NVD requests retry with backoff on network/5xx/429; KEV/EPSS use `fetchRetry`.
- **Observability**: pino logs; `GET :HEALTH_PORT/health` (liveness) and `/ready` (database + Redis + queue worker consuming).

Layout: `domain/` (types + repository ports + job contract) → `application/` (use cases, orchestrator, job handler, ports) →
`infrastructure/` (drizzle repos, HTTP clients, BullMQ queue, health) → `main/` (DI container, entrypoints).
