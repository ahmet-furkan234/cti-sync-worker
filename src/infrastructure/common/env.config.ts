import { injectable } from 'inversify';
import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z.string().default('info'),
  /** Optional: raises the NVD rate limit ~10x (5 → 50 requests / 30 s). */
  NVD_API_KEY: z.string().optional().transform((v) => (v ? v : undefined)),
  /** false = no schedules and no bootstrap runs; the service still executes jobs the API enqueues. */
  SYNC_ENABLED: bool.default(true),
  NVD_CRON: z.string().default('7 * * * *'),
  KEV_CRON: z.string().default('15 */6 * * *'),
  EPSS_CRON: z.string().default('30 3 * * *'),
  /** BullMQ backing store shared with cti-backend. */
  REDIS_URL: z.string().default('redis://localhost:6390'),
  /** HTTP liveness/readiness port; 0 disables the server. */
  HEALTH_PORT: z.coerce.number().int().min(0).default(4100),
});

@injectable()
export class EnvConfig {
  readonly NODE_ENV: 'development' | 'production' | 'test';
  readonly DATABASE_URL: string;
  readonly LOG_LEVEL: string;
  readonly NVD_API_KEY: string | undefined;
  readonly SYNC_ENABLED: boolean;
  readonly NVD_CRON: string;
  readonly KEV_CRON: string;
  readonly EPSS_CRON: string;
  readonly REDIS_URL: string;
  readonly HEALTH_PORT: number;

  constructor() {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const lines = parsed.error.issues.map((i) => `  [${i.path.join('.')}] ${i.message}`).join('\n');
      throw new Error(`Invalid environment configuration:\n${lines}`);
    }
    const e = parsed.data;
    this.NODE_ENV = e.NODE_ENV;
    this.DATABASE_URL = e.DATABASE_URL;
    this.LOG_LEVEL = e.LOG_LEVEL;
    this.NVD_API_KEY = e.NVD_API_KEY;
    this.SYNC_ENABLED = e.SYNC_ENABLED;
    this.NVD_CRON = e.NVD_CRON;
    this.KEV_CRON = e.KEV_CRON;
    this.EPSS_CRON = e.EPSS_CRON;
    this.REDIS_URL = e.REDIS_URL;
    this.HEALTH_PORT = e.HEALTH_PORT;
  }
}
