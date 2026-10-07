import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const syncState = pgTable('sync_state', {
  source: text('source').primaryKey(),
  status: text('status', { enum: ['idle', 'running', 'error'] }).notNull().default('idle'),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  lastStartedAt: timestamp('last_started_at', { withTimezone: true }),
  lastFinishedAt: timestamp('last_finished_at', { withTimezone: true }),
  lastError: text('last_error'),
  recordsProcessed: integer('records_processed').notNull().default(0),
  cursor: jsonb('cursor').$type<Record<string, unknown>>().notNull().default({}),
  runRequestedAt: timestamp('run_requested_at', { withTimezone: true }),
});
