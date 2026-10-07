/** Raw SQL used by this service, kept in one place (drizzle is used only for the batch upsert). */
export const SQL = {
  /** Readiness probes: the backend owns the migrations, this service only checks the tables exist. */
  probeCveTable: 'select 1 from cve limit 1',
  probeSyncStateTable: 'select 1 from sync_state limit 1',

  /** $1 ids · $2 added · $3 due · $4 ransomware — one round-trip per batch via unnest. */
  applyKev: `update cve set is_kev = true, kev_added = u.added, kev_due_date = u.due, kev_ransomware = u.r
       from unnest($1::text[], $2::timestamptz[], $3::timestamptz[], $4::boolean[]) as u(id, added, due, r)
       where cve.id = u.id`,

  /** $1 ids · $2 epss · $3 percentile — skips rows whose score did not change. */
  applyEpss: `update cve set epss = u.e, epss_percentile = u.p
       from unnest($1::text[], $2::real[], $3::real[]) as u(id, e, p)
       where cve.id = u.id and (cve.epss is distinct from u.e or cve.epss_percentile is distinct from u.p)`,
} as const;
